/**
 * LineItemTracking.gs — the persistence + attribution core, ported from the
 * tracking half of analyze.py (update_amazon_line_item_state and friends).
 *
 * Differences from the Python (deliberate, spec-directed — NOT algorithm changes):
 *  - State persists in the LineItemTracking sheet tab instead of a JSON file
 *    (loadTrackingState / saveTrackingState).
 *  - O(1) key lookup uses a Map; the within-order merge scans only items of the
 *    SAME order via an order index, instead of the Python global linear scan.
 *  - added_to_inventory is set by the Inventory GATE in processSweep (Main.gs),
 *    not inside advance_line_item_status. advance still owns status max-rank and
 *    the date fields; the final delivered+gated state is identical.
 *
 * Attribution precedence (verified correct on real data — exact order):
 *   1. Focused "Your Amazon.com order of" email's single order.
 *   2. Nearest-preceding authoritative orderID= marker in the same body.
 *   3. Pass-1 unique item->order mapping (with multi-order date tiebreaker).
 *   4. UNKNOWN / needs_review — never guessed onto the email's own order.
 */

const UNKNOWN_ORDER = 'UNKNOWN';

const STATUS_RANK = { Unknown: 0, Ordered: 1, Shipped: 2, 'Out for delivery': 3, Delivered: 4 };

const TOKEN_SYNONYMS = { cable: 'cord', wire: 'cord' };

const LINE_ITEM_HEADERS = [
  'Key',
  'Order Number',
  'Item Name',
  'Normalized Name',
  'Quantity',
  'Status',
  'Ordered Date',
  'Shipped Date',
  'Delivered Date',
  'Last Seen Date',
  'Message IDs',
  'Added To Inventory',
  'Needs Review',
  'Payment Declined',
  'Shipping Delayed',
];

function line_item_key(orderNumber, normalizedItemName) {
  return orderNumber + '::' + normalizedItemName;
}

function default_line_item_record(orderNumber, itemNameRaw, itemNameNormalized, quantity) {
  return {
    order_number: orderNumber,
    item_name_raw: itemNameRaw,
    item_name_normalized: itemNameNormalized,
    quantity: quantity,
    current_status: 'Unknown',
    ordered_date: '',
    shipped_date: '',
    delivered_date: '',
    last_seen_email_date: '',
    contributing_message_ids: [],
    added_to_inventory: false,
    needs_review: false,
    payment_declined: false,
    shipping_delayed: false,
  };
}

function normalize_line_item_record(record) {
  const complete = default_line_item_record(
    record.order_number || UNKNOWN_ORDER,
    record.item_name_raw || '',
    record.item_name_normalized || '',
    record.quantity || 0
  );
  Object.assign(complete, record);
  if (!Array.isArray(complete.contributing_message_ids)) {
    complete.contributing_message_ids = [];
  }
  return complete;
}

function canonical_match_tokens(normalizedItemName) {
  const tokens = [];
  normalizedItemName.split(' ').forEach(function (token) {
    if (!token) {
      return;
    }
    let canonical = Object.prototype.hasOwnProperty.call(TOKEN_SYNONYMS, token) ? TOKEN_SYNONYMS[token] : token;
    if (/^\d+\/\d+"?$/.test(canonical)) {
      canonical = canonical.replace(/"+$/, '');
    }
    tokens.push(canonical);
  });
  return tokens;
}

function _setIntersectionSize(left, right) {
  let count = 0;
  left.forEach(function (value) {
    if (right.has(value)) {
      count += 1;
    }
  });
  return count;
}

function _isSubset(left, right) {
  let subset = true;
  left.forEach(function (value) {
    if (!right.has(value)) {
      subset = false;
    }
  });
  return subset;
}

function jaccard_for_tokens(leftTokens, rightTokens) {
  if (!leftTokens.size || !rightTokens.size) {
    return 0.0;
  }
  const intersection = _setIntersectionSize(leftTokens, rightTokens);
  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0.0 : intersection / union;
}

function should_merge_same_order_items(existingNormalized, newNormalized) {
  const existingTokens = canonical_match_tokens(existingNormalized);
  const newTokens = canonical_match_tokens(newNormalized);
  if (existingTokens.length < 2 || newTokens.length < 2) {
    return false;
  }

  const existingSet = new Set(existingTokens);
  const newSet = new Set(newTokens);
  if (_isSubset(existingSet, newSet) || _isSubset(newSet, existingSet)) {
    return true;
  }
  if (jaccard_for_tokens(existingSet, newSet) >= 0.8) {
    return true;
  }

  const prefixLen = Math.min(4, existingTokens.length, newTokens.length);
  if (prefixLen >= 4) {
    let prefixEqual = true;
    for (let i = 0; i < prefixLen; i += 1) {
      if (existingTokens[i] !== newTokens[i]) {
        prefixEqual = false;
        break;
      }
    }
    if (prefixEqual) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the tracking-state key to use for (order, normalized name), merging
 * near-duplicate names within the SAME order. Scans only same-order keys via the
 * order index; re-keys to the longer normalized name when it wins (as Python).
 *
 * @param {Map} state Tracking-state Map.
 * @param {Map} orderIndex Map of order_number -> Set of keys.
 * @param {string} orderNumber Attributed order.
 * @param {string} normalized Normalized item name.
 * @return {string} The key to upsert under.
 */
function matching_line_item_key(state, orderIndex, orderNumber, normalized) {
  if (wordCount(normalized) < 2) {
    return line_item_key(orderNumber, normalized);
  }

  const keys = orderIndex.get(orderNumber);
  if (keys) {
    const keyList = Array.from(keys);
    for (let i = 0; i < keyList.length; i += 1) {
      const existingKey = keyList[i];
      const record = state.get(existingKey);
      if (!record) {
        continue;
      }
      const existingNormalized = record.item_name_normalized || '';
      if (!should_merge_same_order_items(existingNormalized, normalized)) {
        continue;
      }
      if (wordCount(normalized) > wordCount(existingNormalized)) {
        const newKey = line_item_key(orderNumber, normalized);
        state.set(newKey, record);
        state.delete(existingKey);
        record.item_name_normalized = normalized;
        keys.delete(existingKey);
        keys.add(newKey);
        return newKey;
      }
      return existingKey;
    }
  }

  return line_item_key(orderNumber, normalized);
}

function advance_line_item_status(record, status, emailDate) {
  if (!status) {
    return;
  }
  const currentRank = STATUS_RANK[record.current_status || 'Unknown'] || 0;
  const nextRank = STATUS_RANK[status];
  if (nextRank > currentRank) {
    record.current_status = status;
  }

  if (status === 'Ordered' && !record.ordered_date) {
    record.ordered_date = emailDate;
  } else if (status === 'Shipped' && !record.shipped_date) {
    record.shipped_date = emailDate;
  } else if (status === 'Out for delivery' && !record.shipped_date) {
    record.shipped_date = emailDate;
  } else if (status === 'Delivered' && !record.delivered_date) {
    record.delivered_date = emailDate;
  }
  // NOTE: added_to_inventory is set by the Inventory gate in processSweep().
}

function max_iso_date(left, right) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left > right ? left : right;
}

function authoritative_order_markers(normalizedBody) {
  const re = /orderID=([0-9]{3}-[0-9]{7}-[0-9]{7})/g;
  const markers = [];
  for (const match of (normalizedBody || '').matchAll(re)) {
    markers.push({ order: match[1], index: match.index });
  }
  return markers;
}

function focused_confirmation_order(subject, normalizedBody) {
  if (!/your amazon\.com order of/i.test(subject || '')) {
    return null;
  }
  let orders = new Set(authoritative_order_markers(normalizedBody).map(function (marker) { return marker.order; }));
  if (orders.size === 0) {
    const explicit = extract_order_number(normalizedBody, 'amazon.com');
    if (is_hit(explicit)) {
      orders = new Set([explicit]);
    }
  }
  if (orders.size === 1) {
    return orders.values().next().value;
  }
  return null;
}

function build_authoritative_item_order_map(amazonEmails, existingState) {
  const itemOrders = new Map();
  const orderOrderedDate = new Map();

  function addItemOrder(identity, order) {
    if (!itemOrders.has(identity)) {
      itemOrders.set(identity, new Set());
    }
    itemOrders.get(identity).add(order);
  }
  function setEarliestOrdered(order, date) {
    if (date && (!orderOrderedDate.has(order) || date < orderOrderedDate.get(order))) {
      orderOrderedDate.set(order, date);
    }
  }

  existingState.forEach(function (record) {
    const order = record.order_number;
    if (order && order !== UNKNOWN_ORDER) {
      addItemOrder(record.item_name_normalized || '', order);
      setEarliestOrdered(order, record.ordered_date);
    }
  });

  amazonEmails.forEach(function (emailObj) {
    const normalizedBody = normalize_body(emailObj.bodyText);
    const markers = authoritative_order_markers(normalizedBody);
    const status = amazon_line_item_status(emailObj.subject);
    const emailDate = parse_email_date(emailObj.date) || '';

    const focusedOrder = focused_confirmation_order(emailObj.subject, normalizedBody);
    if (focusedOrder) {
      const subjectItem = extractItemNameFromSubject(emailObj.subject);
      if (subjectItem) {
        const subjectIdentity = normalizeItemName(subjectItem.itemName).cleaned;
        if (subjectIdentity) {
          addItemOrder(subjectIdentity, focusedOrder);
        }
      }
      extractAmazonItemBlocksWithPositionsFromBody(normalizedBody).forEach(function (block) {
        const identity = normalizeItemName(block.item_name).cleaned;
        if (identity) {
          addItemOrder(identity, focusedOrder);
        }
      });
      if (status === 'Ordered' && emailDate) {
        setEarliestOrdered(focusedOrder, emailDate);
      }
      return;
    }

    if (!markers.length) {
      return;
    }
    extractAmazonItemBlocksWithPositionsFromBody(normalizedBody).forEach(function (block) {
      const identity = normalizeItemName(block.item_name).cleaned;
      if (!identity) {
        return;
      }
      const preceding = markers.filter(function (marker) { return marker.index <= block.position; });
      if (preceding.length) {
        addItemOrder(identity, preceding[preceding.length - 1].order);
      }
    });
    if (status === 'Ordered' && emailDate) {
      markers.forEach(function (marker) { setEarliestOrdered(marker.order, emailDate); });
    }
  });

  return { item_orders: itemOrders, order_ordered_date: orderOrderedDate };
}

function resolve_orphan_order(identity, emailDate, itemOrders, orderOrderedDate) {
  const candidates = itemOrders.get(identity) || new Set();
  if (candidates.size === 1) {
    return { order: candidates.values().next().value, needs_review: false };
  }
  if (candidates.size > 1) {
    const eligible = [];
    candidates.forEach(function (order) {
      const orderedDate = orderOrderedDate.get(order);
      if (orderedDate && emailDate && orderedDate <= emailDate) {
        eligible.push([orderedDate, order]);
      }
    });
    if (eligible.length) {
      eligible.sort(function (a, b) {
        if (a[0] !== b[0]) {
          return a[0] < b[0] ? -1 : 1;
        }
        if (a[1] !== b[1]) {
          return a[1] < b[1] ? -1 : 1;
        }
        return 0;
      });
      return { order: eligible[eligible.length - 1][1], needs_review: false };
    }
    return { order: UNKNOWN_ORDER, needs_review: true };
  }
  return { order: UNKNOWN_ORDER, needs_review: true };
}

function attribute_amazon_item_blocks(normalizedBody, itemOrders, orderOrderedDate, emailDate, focusedOrder) {
  const markers = authoritative_order_markers(normalizedBody);
  const blocks = [];
  extractAmazonItemBlocksWithPositionsFromBody(normalizedBody).forEach(function (block) {
    const identity = normalizeItemName(block.item_name).cleaned;
    if (!identity) {
      return;
    }
    const preceding = markers.filter(function (marker) { return marker.index <= block.position; });
    let orderNumber;
    let needsReview;
    if (focusedOrder) {
      orderNumber = focusedOrder;
      needsReview = false;
    } else if (preceding.length) {
      orderNumber = preceding[preceding.length - 1].order;
      needsReview = false;
    } else {
      const resolved = resolve_orphan_order(identity, emailDate, itemOrders, orderOrderedDate);
      orderNumber = resolved.order;
      needsReview = resolved.needs_review;
    }
    blocks.push({
      item_name: block.item_name,
      quantity: block.quantity,
      position: block.position,
      order_number: orderNumber,
      needs_review: needsReview,
    });
  });
  return blocks;
}

function amazon_line_item_status(subject) {
  const subjectText = normalize_body(subject);
  if (/^delivered\b/i.test(subjectText)) {
    return 'Delivered';
  }
  if (/^out\s+for\s+delivery\b/i.test(subjectText)) {
    return 'Out for delivery';
  }
  if (/^shipped\b/i.test(subjectText)) {
    return 'Shipped';
  }
  if (/\byour amazon\.com order of .+ has shipped\b/i.test(subjectText)) {
    return 'Shipped';
  }
  if (/^ordered\b/i.test(subjectText)) {
    return 'Ordered';
  }
  if (/\byour amazon\.com order of\b/i.test(subjectText)) {
    return 'Ordered';
  }
  return null;
}

function amazon_line_item_flags(subject) {
  const subjectText = normalize_body(subject);
  return {
    payment_declined: /\bpayment declined\b/i.test(subjectText),
    shipping_delayed: /\bdelay in shipping\b/i.test(subjectText),
  };
}

/**
 * Applies new emails to prior state and returns the updated state Map.
 *
 * @param {Array<Object>} emails Source email objects (camelCase shape).
 * @param {Map} existingState Prior tracking state.
 * @return {Map} Updated tracking state keyed by line-item key.
 */
function update_amazon_line_item_state(emails, existingState) {
  const state = new Map();
  const orderIndex = new Map();
  function indexAdd(order, key) {
    if (!orderIndex.has(order)) {
      orderIndex.set(order, new Set());
    }
    orderIndex.get(order).add(key);
  }

  existingState.forEach(function (value, key) {
    const record = normalize_line_item_record(value);
    state.set(key, record);
    indexAdd(record.order_number, key);
  });

  const amazonEmails = emails.filter(function (emailObj) {
    return get_domain(emailObj.senderEmail) === 'amazon.com';
  });
  const maps = build_authoritative_item_order_map(amazonEmails, state);
  const itemOrders = maps.item_orders;
  const orderOrderedDate = maps.order_ordered_date;

  amazonEmails.forEach(function (emailObj) {
    const body = emailObj.bodyText;
    const normalizedBody = normalize_body(body);
    const flags = amazon_line_item_flags(emailObj.subject);
    const status = amazon_line_item_status(emailObj.subject);
    const emailDate = parse_email_date(emailObj.date) || '';
    const messageId = emailObj.messageId || '';

    const focusedOrder = focused_confirmation_order(emailObj.subject, normalizedBody);
    let itemBlocks = attribute_amazon_item_blocks(normalizedBody, itemOrders, orderOrderedDate, emailDate, focusedOrder);

    if (!itemBlocks.length) {
      let fallbackOrder = focusedOrder;
      if (fallbackOrder == null) {
        const distinct = new Set(authoritative_order_markers(normalizedBody).map(function (m) { return m.order; }));
        if (distinct.size === 1) {
          fallbackOrder = distinct.values().next().value;
        }
      }
      if (fallbackOrder != null) {
        const subjectItem = extractItemNameFromSubject(emailObj.subject);
        if (subjectItem) {
          itemBlocks = [{ item_name: subjectItem.itemName, quantity: 1, order_number: fallbackOrder, needs_review: false }];
        }
      }
    }

    if (!itemBlocks.length && (flags.payment_declined || flags.shipping_delayed)) {
      const flagOrder = extract_order_number((emailObj.subject || '') + ' ' + body, 'amazon.com');
      state.forEach(function (record) {
        if (record.order_number === flagOrder) {
          record.payment_declined = record.payment_declined || flags.payment_declined;
          record.shipping_delayed = record.shipping_delayed || flags.shipping_delayed;
          record.last_seen_email_date = max_iso_date(record.last_seen_email_date || '', emailDate);
          if (messageId && record.contributing_message_ids.indexOf(messageId) === -1) {
            record.contributing_message_ids.push(messageId);
          }
        }
      });
      return;
    }

    itemBlocks.forEach(function (itemBlock) {
      const itemOrderNumber = itemBlock.order_number || UNKNOWN_ORDER;
      const normalized = normalizeItemName(itemBlock.item_name).cleaned;
      if (!normalized) {
        return;
      }
      const key = matching_line_item_key(state, orderIndex, itemOrderNumber, normalized);
      let record = state.get(key);
      if (!record) {
        record = default_line_item_record(itemOrderNumber, itemBlock.item_name, normalized, itemBlock.quantity);
        state.set(key, record);
        indexAdd(itemOrderNumber, key);
      }
      if (itemBlock.item_name.length > (record.item_name_raw || '').length) {
        record.item_name_raw = itemBlock.item_name;
      }
      record.quantity = Math.max(parseInt(record.quantity || 0, 10), itemBlock.quantity);
      record.payment_declined = record.payment_declined || flags.payment_declined;
      record.shipping_delayed = record.shipping_delayed || flags.shipping_delayed;
      record.last_seen_email_date = max_iso_date(record.last_seen_email_date || '', emailDate);
      if (messageId && record.contributing_message_ids.indexOf(messageId) === -1) {
        record.contributing_message_ids.push(messageId);
      }
      if (itemBlock.needs_review) {
        record.needs_review = true;
      }
      advance_line_item_status(record, status, emailDate);
    });
  });

  return state;
}

/**
 * Reads the LineItemTracking tab into a Map (ONE bulk read).
 *
 * @return {Map} Tracking state keyed by stored key.
 */
function loadTrackingState() {
  const sheet = getOrCreateTab(CONFIG.TRACKING_TAB, LINE_ITEM_HEADERS);
  const values = sheet.getDataRange().getValues();
  const state = new Map();
  if (values.length <= 1) {
    return state;
  }
  for (let row = 1; row < values.length; row += 1) {
    const cells = values[row];
    const key = String(cells[0] || '');
    if (!key) {
      continue;
    }
    state.set(key, {
      order_number: String(cells[1] || ''),
      item_name_raw: String(cells[2] || ''),
      item_name_normalized: String(cells[3] || ''),
      quantity: toInt(cells[4]),
      current_status: String(cells[5] || 'Unknown'),
      ordered_date: cellToIso(cells[6]),
      shipped_date: cellToIso(cells[7]),
      delivered_date: cellToIso(cells[8]),
      last_seen_email_date: cellToIso(cells[9]),
      contributing_message_ids: splitIds(cells[10]),
      added_to_inventory: toBool(cells[11]),
      needs_review: toBool(cells[12]),
      payment_declined: toBool(cells[13]),
      shipping_delayed: toBool(cells[14]),
    });
  }
  return state;
}

/**
 * Writes the full tracking-state Map back in ONE setValues() call.
 *
 * @param {Map} state Tracking state.
 */
function saveTrackingState(state) {
  const sheet = getOrCreateTab(CONFIG.TRACKING_TAB, LINE_ITEM_HEADERS);
  const rows = [];
  state.forEach(function (record, key) {
    rows.push([
      key,
      record.order_number,
      record.item_name_raw,
      record.item_name_normalized,
      record.quantity,
      record.current_status,
      record.ordered_date,
      record.shipped_date,
      record.delivered_date,
      record.last_seen_email_date,
      (record.contributing_message_ids || []).join('|'),
      !!record.added_to_inventory,
      !!record.needs_review,
      !!record.payment_declined,
      !!record.shipping_delayed,
    ]);
  });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, LINE_ITEM_HEADERS.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, LINE_ITEM_HEADERS.length).setValues(rows);
  }
}
