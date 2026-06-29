/**
 * SheetWriter.gs — sheet plumbing for the four-tab schema.
 *
 * Tabs: LineItemTracking (persistent state, handled in LineItemTracking.gs),
 * Inventory (gated delivered output), Unattributed (UNKNOWN items), RunLog.
 *
 * All Sheet I/O is bulk (getValues / setValues), never per-cell in a loop.
 */

const INVENTORY_HEADERS = [
  'Order Number',
  'Item Name',
  'Normalized Name',
  'Quantity',
  'Status',
  'Ordered Date',
  'Shipped Date',
  'Delivered Date',
  'Message IDs',
  'Gated At',
];

const UNATTRIBUTED_HEADERS = [
  'Item Name',
  'Normalized Name',
  'Quantity',
  'Status',
  'Ordered Date',
  'Shipped Date',
  'Delivered Date',
  'Needs Review',
  'Message IDs',
  'Updated At',
];

const REORDER_HEADERS = [
  'Item',
  'Last Price/Unit',
  'Last Order Date',
  'Last Quantity',
  'Times Ordered',
  'Check Current Price',
];

const RUN_LOG_HEADERS = [
  'Timestamp',
  'Source',
  'Dry Run',
  'Emails Scanned',
  'Emails Processed',
  'New Line Items',
  'Status Advances',
  'Gated To Inventory',
  'UNKNOWN Count',
  'Total Line Items',
  'Error',
];

/**
 * Opens the configured spreadsheet, returns the named tab, creating it (with a
 * frozen header row) when needed.
 *
 * @param {string} name Tab name.
 * @param {Array<string>} headers Header row.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
 */
function getOrCreateTab(name, headers) {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PUT_SHEET_ID_HERE') {
    throw new Error('Set CONFIG.SHEET_ID in Config.gs before running the pipeline.');
  }
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Appends gated (delivered) line items to the Inventory tab in one bulk write.
 *
 * @param {Array<Object>} records Line-item records.
 */
function appendInventoryRows(records) {
  if (!records || !records.length) {
    return;
  }
  const sheet = getOrCreateTab(CONFIG.INVENTORY_TAB, INVENTORY_HEADERS);
  const now = new Date();
  const rows = records.map(function (record) {
    return [
      record.order_number,
      record.item_name_raw,
      record.item_name_normalized,
      record.quantity,
      record.current_status,
      record.ordered_date,
      record.shipped_date,
      record.delivered_date,
      (record.contributing_message_ids || []).join('|'),
      now,
    ];
  });
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, INVENTORY_HEADERS.length).setValues(rows);
}

/**
 * Rewrites the Unattributed tab from the current UNKNOWN records (idempotent
 * view, so re-runs don't duplicate).
 *
 * @param {Array<Object>} records UNKNOWN line-item records.
 */
function writeUnattributedRows(records) {
  const sheet = getOrCreateTab(CONFIG.UNATTRIBUTED_TAB, UNATTRIBUTED_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, UNATTRIBUTED_HEADERS.length).clearContent();
  }
  if (!records || !records.length) {
    return;
  }
  const now = new Date();
  const rows = records.map(function (record) {
    return [
      record.item_name_raw,
      record.item_name_normalized,
      record.quantity,
      record.current_status,
      record.ordered_date,
      record.shipped_date,
      record.delivered_date,
      !!record.needs_review,
      (record.contributing_message_ids || []).join('|'),
      now,
    ];
  });
  sheet.getRange(2, 1, rows.length, UNATTRIBUTED_HEADERS.length).setValues(rows);
}

/**
 * Appends one run-summary row to the RunLog tab.
 *
 * @param {Object} summary Run summary.
 */
function appendRunLog(summary) {
  const sheet = getOrCreateTab(CONFIG.RUN_LOG_TAB, RUN_LOG_HEADERS);
  sheet.appendRow([
    new Date(),
    summary.source || '',
    !!summary.dryRun,
    summary.emailsScanned || 0,
    summary.emailsProcessed || 0,
    summary.newLineItems || 0,
    summary.statusAdvances || 0,
    summary.gated || 0,
    summary.unknownCount || 0,
    summary.totalLineItems || 0,
    summary.error || '',
  ]);
}

/**
 * Rebuilds the ReorderReference tab from current tracking state. DERIVED view:
 * one row per DISTINCT item (deduplicated by item_name_normalized). Full
 * clear + bulk setValues, so it is always fresh and never has stale dedup.
 *
 * @param {Map} state Tracking state.
 */
function writeReorderReference(state) {
  const sheet = getOrCreateTab(CONFIG.REORDER_TAB, REORDER_HEADERS);

  const groups = new Map();
  state.forEach(function (record) {
    const key = record.item_name_normalized;
    if (!key) {
      return;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(record);
  });

  const rows = [];
  groups.forEach(function (records, normalized) {
    let latest = records[0];
    let latestDate = reorderRecordDate(latest);
    records.forEach(function (record) {
      const date = reorderRecordDate(record);
      if (date >= latestDate) {
        latestDate = date;
        latest = record;
      }
    });

    const distinctOrders = {};
    records.forEach(function (record) { distinctOrders[record.order_number] = true; });

    const displayName = reorderBestName(records, normalized);
    const lastPricePerUnit = computePricePerUnit(latest.price_paid, latest.quantity);
    const searchUrl = 'https://www.amazon.com/s?k=' + encodeURIComponent(displayName);
    const linkFormula = '=HYPERLINK("' + searchUrl + '","Check current price")';

    rows.push([
      displayName,
      lastPricePerUnit,
      latestDate,
      latest.quantity,
      Object.keys(distinctOrders).length,
      linkFormula,
    ]);
  });

  rows.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, REORDER_HEADERS.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, REORDER_HEADERS.length).setValues(rows);
  }
}

/**
 * Best display date for a record: latest ISO among its known dates.
 *
 * @param {Object} record Line-item record.
 * @return {string} ISO date or ''.
 */
function reorderRecordDate(record) {
  const dates = [record.ordered_date, record.shipped_date, record.delivered_date, record.last_seen_email_date]
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : '';
}

/**
 * Cleanest display name for an item group: the longest raw name seen, else the
 * normalized key.
 *
 * @param {Array<Object>} records Records sharing a normalized name.
 * @param {string} normalized Normalized key.
 * @return {string} Display name.
 */
function reorderBestName(records, normalized) {
  let best = '';
  records.forEach(function (record) {
    if ((record.item_name_raw || '').length > best.length) {
      best = record.item_name_raw;
    }
  });
  return best || normalized;
}

/**
 * Clears data rows of the tracking/inventory/unattributed/reorder tabs (NOT
 * RunLog) so a fixtures run is deterministic and repeatable.
 */
function resetFixtureTabs() {
  const tabs = [
    [CONFIG.TRACKING_TAB, LINE_ITEM_HEADERS],
    [CONFIG.INVENTORY_TAB, INVENTORY_HEADERS],
    [CONFIG.UNATTRIBUTED_TAB, UNATTRIBUTED_HEADERS],
    [CONFIG.REORDER_TAB, REORDER_HEADERS],
  ];
  tabs.forEach(function (entry) {
    const sheet = getOrCreateTab(entry[0], entry[1]);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, entry[1].length).clearContent();
    }
  });
  console.log('Fixture tabs reset (LineItemTracking, Inventory, Unattributed).');
}

/**
 * Coercion helpers for sheet cell values (Sheets may return Date/boolean/number).
 */
function cellToIso(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
  }
  return value == null ? '' : String(value).trim();
}

function toBool(value) {
  return value === true || /^true$/i.test(String(value));
}

function toInt(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function toFloatCell(value) {
  if (value === '' || value == null) {
    return '';
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? '' : parsed;
}

function splitIds(value) {
  return String(value == null ? '' : value)
    .split('|')
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}
