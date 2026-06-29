/**
 * Extractor.gs — direct 1:1 translation of extract.py.
 *
 * Function names match the Python. JS regex porting per the spec:
 *   re.findall(group) -> [...str.matchAll(/.../g)].map(m => m[1])
 *   re.search(..., re.I) -> str.match(/.../i)
 *   re.finditer -> str.matchAll(/.../g) (m.index = position)
 * Do not change any regex, normalization, or status logic.
 */

const NOT_FOUND = 'NOT FOUND';

const SENDER_RULES = {
  'amazon.com': {
    store: 'Amazon',
    order_number_patterns: [
      /\border\s*#\s*([0-9]{3}-[0-9]{7}-[0-9]{7})\b/i,
      /\border\s+number\s*[:#]?\s*([0-9]{3}-[0-9]{7}-[0-9]{7})\b/i,
    ],
    total_patterns: [
      /\border\s+total\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /\btotal\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /\btotal\s*[:\-]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(USD|EUR|GBP)\b/i,
    ],
  },
  'etsy.com': {
    store: 'Etsy',
    order_number_patterns: [
      /\border\s*#\s*([0-9]{6,})\b/i,
      /\breceipt\s*#\s*([0-9]{6,})\b/i,
    ],
    total_patterns: [
      /\border\s+total\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
      /\btotal\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
    ],
  },
};

const GENERIC_ORDER_NUMBER_PATTERNS = [
  /\border\s*(?:number|no\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/i,
  /\bconfirmation\s*(?:number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/i,
  /\breceipt\s*(?:number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{4,})\b/i,
];

const GENERIC_TOTAL_PATTERNS = [
  /\border\s+total\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
  /\bgrand\s+total\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
  /\btotal\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
  /\btotal\s*[:\-]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(USD|EUR|GBP)\b/i,
  /\bamount\s+paid\s*[:\-]?\s*([$€£])\s*([0-9,]+(?:\.[0-9]{2})?)/i,
];

const ITEM_ANCHOR_PATTERNS = [
  /\bitem\s*[:\-]\s*(.+?)(?=\s+(?:order\s+total|qty|quantity|price|total)\b|$)/i,
  /\bproduct\s*[:\-]\s*(.+?)(?=\s+(?:order\s+total|qty|quantity|price|total)\b|$)/i,
  /\byou\s+(?:bought|purchased|ordered)\s*[:\-]?\s*(.+?)(?=\s+(?:order\s+total|qty|quantity|price|total)\b|$)/i,
  /\bitem\s+ordered\s*[:\-]\s*(.+?)(?=\s+(?:order\s+total|qty|quantity|price|total)\b|$)/i,
];

const ARRIVAL_DATE_PATTERNS = [
  /\barriving\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/i,
  /\bestimated\s+(?:delivery|arrival)\s*[:\-]?\s*([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/i,
  /\bdelivery\s+(?:date|by)\s*[:\-]?\s*([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/i,
  /\b(?:will|should)\s+arrive\s+(?:by\s+)?([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/i,
  /\barrives\s+([A-Z][a-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/i,
];

const CURRENCY_SYMBOLS = { '$': 'USD', '€': 'EUR', '£': 'GBP' };
const ISO_CURRENCIES = { USD: true, EUR: true, GBP: true };

const SPEC_TOKEN_SRC =
  '\\d+/\\d+"?|\\bm\\d+(?:\\.\\d+)?\\b|\\b\\d+(?:\\.\\d+)?(?:mm|cm|v|w|mah|a)\\b|\\b\\d+\\s*(?:pcs|pack)\\b|\\b\\d+(?:\\.\\d+)+\\b';

const UI_BUTTON_PHRASES = new Set([
  'track package',
  'view order',
  'view details',
  'manage order',
  'leave feedback',
  'write a review',
  'track shipment',
]);

const MARKETING_FILLER_WORDS = new Set([
  'premium',
  'new',
  'upgraded',
  '2024',
  '2025',
  'professional',
  'heavy',
  'duty',
]);

const SKIP_ITEM_LINES_RE = /(view|manage|order|total|subtotal|shipping|tax|payment|receipt|confirmation|tracking|delivered|arriving)/i;

const MONTH_INDEX = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

/**
 * Trims any of the given characters from both ends (mirrors Python str.strip(chars)).
 *
 * @param {string} value Text.
 * @param {string} chars Characters to strip.
 * @return {string} Trimmed text.
 */
function trimChars(value, chars) {
  let start = 0;
  let end = value.length;
  while (start < end && chars.indexOf(value.charAt(start)) !== -1) {
    start += 1;
  }
  while (end > start && chars.indexOf(value.charAt(end - 1)) !== -1) {
    end -= 1;
  }
  return value.slice(start, end);
}

function wordCount(value) {
  return value ? value.split(/\s+/).filter(Boolean).length : 0;
}

function is_hit(value) {
  return value !== null && value !== undefined && value !== '' && value !== NOT_FOUND;
}

function strip_invisible_chars(text) {
  return stripInvisibleChars(text);
}

function normalize_body(text) {
  return strip_invisible_chars(text).replace(/\s+/g, ' ').trim();
}

function _extract_email_address(senderEmail) {
  const raw = senderEmail || '';
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

function get_domain(senderEmail) {
  let address = _extract_email_address(senderEmail);
  if (address.indexOf('@') !== -1) {
    address = address.split('@').pop();
  }
  const labels = address.split('.').filter(Boolean);
  if (labels.length <= 2) {
    return labels.join('.');
  }
  const fullDomain = labels.join('.');
  for (const knownDomain in SENDER_RULES) {
    if (Object.prototype.hasOwnProperty.call(SENDER_RULES, knownDomain)) {
      if (fullDomain === knownDomain || fullDomain.endsWith('.' + knownDomain)) {
        return knownDomain;
      }
    }
  }
  return labels.slice(-2).join('.');
}

function get_store_name(senderEmail, senderName) {
  const domain = get_domain(senderEmail);
  if (SENDER_RULES[domain]) {
    return SENDER_RULES[domain].store;
  }
  if (senderName) {
    return String(senderName).trim();
  }
  return domain || NOT_FOUND;
}

function _first_match(patterns, body) {
  for (let i = 0; i < patterns.length; i += 1) {
    const match = body.match(patterns[i]);
    if (match) {
      return match;
    }
  }
  return null;
}

function extract_order_number(body, domain) {
  const normalized = normalize_body(body);
  const domainPatterns = (SENDER_RULES[domain] && SENDER_RULES[domain].order_number_patterns) || [];
  const match = _first_match(domainPatterns, normalized) || _first_match(GENERIC_ORDER_NUMBER_PATTERNS, normalized);
  return match ? match[1].trim() : NOT_FOUND;
}

function extract_total(body, domain) {
  const normalized = normalize_body(body);
  const domainPatterns = (SENDER_RULES[domain] && SENDER_RULES[domain].total_patterns) || [];
  const match = _first_match(domainPatterns, normalized) || _first_match(GENERIC_TOTAL_PATTERNS, normalized);
  if (!match) {
    return { total: NOT_FOUND, currency: NOT_FOUND };
  }

  const first = match[1];
  const second = match[2];
  let amount;
  let currency;
  if (Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, first)) {
    amount = second.replace(/,/g, '');
    currency = CURRENCY_SYMBOLS[first];
  } else if (ISO_CURRENCIES[String(second).toUpperCase()]) {
    amount = first.replace(/,/g, '');
    currency = String(second).toUpperCase();
  } else {
    amount = second.replace(/,/g, '');
    currency = CURRENCY_SYMBOLS[first] || first;
  }
  return { total: amount, currency: currency };
}

function clean_item_candidate(value) {
  value = strip_invisible_chars(value);
  value = trimChars(value.replace(/\s+/g, ' '), ' -:|');
  value = value.replace(/\b(qty|quantity)\s*[:#]?\s*\d+.*$/i, '').trim();
  return value;
}

function is_sku_only_candidate(value) {
  const normalized = trimChars((value || '').replace(/\s+/g, ' ').trim(), ' .,!?:;-');
  if (/^item\s*(?:no|number|#)\.?\s*:?\s*\d+$/i.test(normalized)) {
    return true;
  }
  if (/^[A-Z0-9][A-Z0-9_-]{2,15}$/i.test(normalized) && /\d/.test(normalized)) {
    return true;
  }
  return false;
}

function is_ui_button_phrase(value) {
  let normalized = (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  normalized = trimChars(normalized, ' .,!?:;-');
  return UI_BUTTON_PHRASES.has(normalized);
}

function _looks_like_item_line(line) {
  line = clean_item_candidate(line);
  if (!line || line.length < 3 || line.length > 140) {
    return false;
  }
  if (is_ui_button_phrase(line) || is_sku_only_candidate(line)) {
    return false;
  }
  if (SKIP_ITEM_LINES_RE.test(line)) {
    return false;
  }
  if (/^[$€£]?\d+(?:\.\d{2})?$/.test(line)) {
    return false;
  }
  return /[A-Za-z]/.test(line);
}

function _clean_subject_item_name(rawName) {
  let name = clean_item_candidate(rawName);
  const truncated = /\.\.\.$/.test(name);
  name = name.replace(/\.\.\.$/, '').trim();
  return { name: name, truncated: truncated };
}

function _subject_item_result(rawName, subject) {
  const cleaned = _clean_subject_item_name(rawName);
  const name = cleaned.name;
  if (!name || is_ui_button_phrase(name) || is_sku_only_candidate(name)) {
    return null;
  }
  return {
    itemName: name,
    items: [name],
    multipleItems: /\band\s+\d+\s+more\s+items?\b/i.test(subject),
    itemNameTruncated: cleaned.truncated,
  };
}

function extractItemNameFromSubject(subject) {
  subject = normalize_body(subject);
  if (!subject) {
    return null;
  }

  const patterns = [
    /\b(?:ordered|shipped|delivered|out\s+for\s+delivery|delivery\s+update|delivery\s+estimate\s+update):\s+"([^"]+)"/i,
    /\b(?:your\s+amazon\.com\s+order\s+of|shipped:)\s+"\d+"\s*x\s+(.+?)(?=\s+(?:has\s+shipped|shipped|and\s+\d+\s+more\s+items?)|[!.]?$)/i,
    /\b(?:your\s+amazon\.com\s+order\s+of|shipped:)\s+(?:\d+\s*x\s*)?"([^"]+)"/i,
    /\b(?:your\s+amazon\.com\s+order\s+of|shipped:)\s+\d+\s+"([^"]+)"/i,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const match = subject.match(patterns[i]);
    if (match) {
      return _subject_item_result(match[1], subject);
    }
  }
  return null;
}

function extractAmazonItemsFromBody(body) {
  const normalized = normalize_body(body);
  const re = /(?:^|\s)\*\s+(.+?)\s+(?:Quantity|Qty)\s*:\s*\d+\b/gi;
  const out = [];
  for (const match of normalized.matchAll(re)) {
    const candidate = clean_item_candidate(match[1]);
    if (candidate && !is_ui_button_phrase(candidate)) {
      out.push(candidate);
    }
  }
  return out;
}

function extractAmazonItemBlocksFromBody(body) {
  const normalized = normalize_body(body);
  const re = /(?:^|\s)\*\s+(.+?)\s+(?:Quantity|Qty)\s*:\s*(\d+)\b/gi;
  const blocks = [];
  for (const match of normalized.matchAll(re)) {
    const candidate = clean_item_candidate(match[1]);
    if (!candidate || is_ui_button_phrase(candidate) || is_sku_only_candidate(candidate)) {
      continue;
    }
    blocks.push({ item_name: candidate, quantity: parseInt(match[2], 10) });
  }
  return blocks;
}

function extractAmazonItemBlocksWithPositionsFromBody(body) {
  const normalized = normalize_body(body);
  const re = /(?:^|\s)\*\s+(.+?)\s+(?:Quantity|Qty)\s*:\s*(\d+)\b/gi;
  const blocks = [];
  for (const match of normalized.matchAll(re)) {
    const candidate = clean_item_candidate(match[1]);
    if (!candidate || is_ui_button_phrase(candidate) || is_sku_only_candidate(candidate)) {
      continue;
    }
    blocks.push({ item_name: candidate, quantity: parseInt(match[2], 10), position: match.index });
  }
  return blocks;
}

/**
 * ADDITIVE (reorder-reference feature): maps each accepted item block's position
 * to its per-item price, parsed from the amount that follows "Quantity: <n>",
 * e.g. "... Quantity: 1 42.99 USD" or "... Quantity: 1 $42.99".
 *
 * The name/quantity portion of the regex is identical to
 * extractAmazonItemBlocksWithPositionsFromBody, and the price clause is fully
 * optional and only matches inside its own group, so match positions and the set
 * of accepted blocks are unchanged — this only adds price metadata.
 *
 * @param {string} body Email body text.
 * @return {Map<number, {price_paid: string, currency: string}>} position -> price.
 */
function extractAmazonItemBlockPriceMap(body) {
  const normalized = normalize_body(body);
  const re = /(?:^|\s)\*\s+(.+?)\s+(?:Quantity|Qty)\s*:\s*(\d+)\b(?:\s+(?:([0-9,]+\.[0-9]{2})\s*(USD|EUR|GBP)|([$€£])\s*([0-9,]+\.[0-9]{2})))?/gi;
  const map = new Map();
  for (const match of normalized.matchAll(re)) {
    const candidate = clean_item_candidate(match[1]);
    if (!candidate || is_ui_button_phrase(candidate) || is_sku_only_candidate(candidate)) {
      continue;
    }
    let pricePaid = '';
    let currency = '';
    if (match[3]) {
      pricePaid = match[3].replace(/,/g, '');
      currency = String(match[4]).toUpperCase();
    } else if (match[5] && match[6]) {
      pricePaid = match[6].replace(/,/g, '');
      currency = CURRENCY_SYMBOLS[match[5]] || match[5];
    }
    map.set(match.index, { price_paid: pricePaid, currency: currency });
  }
  return map;
}

const WEEKDAY_INDEX = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

const AMAZON_ETA_MARKER_PATTERNS = [
  /\bArriving:?\s+(today|tomorrow|(?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?|[A-Za-z]+day)/gi,
  /\bNow\s+Arriving\s+((?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/gi,
  /\bNow\s+arriving\s+([A-Za-z]+day)\b/gi,
  /\bEstimated\s+delivery:?\s+((?:by\s+)?(?:today|tomorrow|(?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?|[A-Za-z]+day))/gi,
  /\bExpected\s+Delivery\s*:?\s*((?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/gi,
  /\b(?:guaranteed\s+)?delivery\s+date\s+is:?\s+((?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/gi,
  /\byour\s+package\s+will\s+arrive:?\s*((?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?)/gi,
  /\bpackage\s+will\s+be\s+delivered\s+(today)\b/gi,
  /\bwill\s+arrive\s+by\s+this\s+evening\b/gi,
  /\barrive(?:s)?\s+by:?\s+((?:today|tomorrow|(?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?|[A-Za-z]+day))/gi,
  /\bwill\s+arrive\s+(?:by\s+)?((?:today|tomorrow|(?:[A-Za-z]+day,?\s+)?[A-Za-z]+\.?\s+\d{1,2}(?:,\s*\d{4})?|[A-Za-z]+day))/gi,
];

const WEEKDAY_MONTH_DAY_RE =
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b/gi;

const AMAZON_SHIPPING_SECTION_START_RE =
  /\b(?:your package was shipped|your package is out for delivery|shipping confirmation|your package will arrive|delivery estimate update|now arriving|arriving today|arriving tomorrow|expected delivery|has shipped)\b/i;

/**
 * Resolves the next occurrence of a weekday name on or after the reference date.
 *
 * @param {string} weekdayName Weekday token (e.g. "Wednesday").
 * @param {Date} refDate Reference date (UTC noon).
 * @return {string} ISO date or ''.
 */
function nextWeekdayIso(weekdayName, refDate) {
  const targetDay = WEEKDAY_INDEX[String(weekdayName).toLowerCase()];
  if (targetDay === undefined) {
    return '';
  }
  const refDay = refDate.getUTCDay();
  let delta = (targetDay - refDay + 7) % 7;
  const d = new Date(refDate);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDateUTC(d);
}

/**
 * Parses an Amazon ETA phrase into an ISO date, using the email date for year
 * inference and year-end rollover (month far in the past -> next year).
 *
 * @param {string} phrase ETA text after "Arriving:" / "Estimated delivery:" etc.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {string} ISO date or ''.
 */
function parseAmazonEtaPhrase(phrase, emailDateIso) {
  if (!phrase || !emailDateIso) {
    return '';
  }
  let text = String(phrase).trim().replace(/\./g, '');
  const ref = new Date(emailDateIso + 'T12:00:00Z');

  if (/^today$/i.test(text)) {
    return emailDateIso;
  }
  if (/^tomorrow$/i.test(text)) {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() + 1);
    return isoDateUTC(d);
  }
  if (/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(text)) {
    return nextWeekdayIso(text, ref);
  }

  text = text.replace(/^by\s+/i, '');
  text = text.replace(/^[A-Za-z]+day,?\s+/i, '');

  return parse_date_candidate_with_email_year(text, emailDateIso);
}

/**
 * Like parse_date_candidate but anchors the year to the email date and rolls
 * forward when the month/day would be far in the past.
 *
 * @param {string} value Month-day phrase.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {string} ISO date or ''.
 */
function parse_date_candidate_with_email_year(value, emailDateIso) {
  value = String(value || '').trim().replace(/\./g, '');
  const match = value.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!match) {
    return '';
  }
  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (month === undefined) {
    return '';
  }
  const day = parseInt(match[2], 10);
  const ref = new Date(emailDateIso + 'T12:00:00Z');
  let year = match[3] ? parseInt(match[3], 10) : ref.getUTCFullYear();
  let date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return '';
  }
  if (!match[3] && date.getTime() < ref.getTime() - (45 * 86400000)) {
    year += 1;
    date = new Date(Date.UTC(year, month, day));
  }
  return isoDateUTC(date);
}

/**
 * Finds Amazon-stated ETA markers in a normalized body with character positions.
 *
 * @param {string} normalizedBody Whitespace-normalized email body.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {Array<{index: number, eta: string}>} Sorted markers.
 */
function extract_amazon_eta_markers(normalizedBody, emailDateIso) {
  const seen = new Set();
  const markers = [];
  AMAZON_ETA_MARKER_PATTERNS.forEach(function (pattern) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of normalizedBody.matchAll(re)) {
      if (seen.has(match.index)) {
        continue;
      }
      let phrase = match[1];
      if (!phrase && /this\s+evening/i.test(match[0])) {
        phrase = 'today';
      }
      const eta = phrase ? parseAmazonEtaPhrase(phrase, emailDateIso) : '';
      if (eta) {
        seen.add(match.index);
        markers.push({ index: match.index, eta: eta });
      }
    }
  });
  markers.sort(function (a, b) { return a.index - b.index; });
  return markers;
}

/**
 * ETA from subject lines like "Now arriving today: Your Amazon package".
 *
 * @param {string} subject Email subject.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {{eta: string, source: string}}
 */
function extractAmazonEtaFromSubject(subject, emailDateIso) {
  const subj = normalize_body(subject || '');
  if (!subj || !emailDateIso) {
    return { eta: '', source: '' };
  }
  if (/\b(?:now\s+)?arriving\s+today\b|\bout\s+for\s+delivery\s+today\b|\bwill be delivered\s+today\b/i.test(subj)) {
    return { eta: emailDateIso, source: 'amazon_estimate' };
  }
  if (/\b(?:now\s+)?arriving\s+tomorrow\b/i.test(subj)) {
    const d = new Date(emailDateIso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return { eta: isoDateUTC(d), source: 'amazon_estimate' };
  }
  return { eta: '', source: '' };
}

/**
 * Lower-confidence fallback: a single "[Weekday], [Month] [day]" in the
 * shipping/delivery section when no primary ETA phrase matched.
 *
 * @param {string} body Email body text.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {string} ISO date or ''.
 */
function extractAmazonFallbackBodyEta(body, emailDateIso) {
  const normalized = normalize_body(body);
  if (!normalized || !emailDateIso) {
    return '';
  }
  if (extract_amazon_eta_markers(normalized, emailDateIso).length) {
    return '';
  }
  if (/\bOrder Confirmation\b/i.test(normalized) &&
      !/\b(?:Shipping Confirmation|your package was shipped|your package will arrive|Expected Delivery)\b/i.test(normalized)) {
    return '';
  }
  const startMatch = normalized.match(AMAZON_SHIPPING_SECTION_START_RE);
  if (!startMatch) {
    return '';
  }
  const section = normalized.slice(startMatch.index);
  const uniqueDates = [];
  const seen = new Set();
  for (const match of section.matchAll(new RegExp(WEEKDAY_MONTH_DAY_RE.source, 'gi'))) {
    const eta = parseAmazonEtaPhrase(match[0], emailDateIso);
    if (eta && !seen.has(eta)) {
      seen.add(eta);
      uniqueDates.push(eta);
    }
  }
  return uniqueDates.length === 1 ? uniqueDates[0] : '';
}

/**
 * Returns the ETA from the nearest preceding marker at or before position.
 * Kept for unit tests / debugging; production uses section-scoped assignment.
 *
 * @param {Array<{index: number, eta: string}>} markers Sorted ETA markers.
 * @param {number} position Item block position.
 * @return {string} ISO date or ''.
 */
function nearestPrecedingEta(markers, position) {
  let best = '';
  markers.forEach(function (marker) {
    if (marker.index <= position) {
      best = marker.eta;
    }
  });
  return best;
}

const AMAZON_ETA_SECTION_BOUNDARY_RE = /\b(?:Grand Total|Order received)\b/i;

/**
 * End index for an ETA marker's scope: next marker, or a package/order boundary.
 *
 * @param {string} normalizedBody Whitespace-normalized body.
 * @param {number} markerIndex Index into markers array.
 * @param {Array<{index: number, eta: string}>} markers Sorted ETA markers.
 * @return {number} Exclusive end position.
 */
function etaSectionEnd(normalizedBody, markerIndex, markers) {
  if (markerIndex + 1 < markers.length) {
    return markers[markerIndex + 1].index;
  }
  const after = normalizedBody.slice(markers[markerIndex].index);
  const boundary = after.search(AMAZON_ETA_SECTION_BOUNDARY_RE);
  if (boundary > 0) {
    return markers[markerIndex].index + boundary;
  }
  return Infinity;
}

/**
 * ADDITIVE (package ETA feature): maps item block positions to the Amazon
 * "Arriving …" phrase for their package section (first item block after the
 * marker until the next marker or Grand Total / Order received boundary).
 *
 * @param {string} body Email body text.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {Map<number, string>} position -> estimated_eta ISO date.
 */
function extractAmazonItemBlockEtaMap(body, emailDateIso) {
  const normalized = normalize_body(body);
  const markers = extract_amazon_eta_markers(normalized, emailDateIso);
  if (!markers.length) {
    return new Map();
  }
  const blocks = extractAmazonItemBlocksWithPositionsFromBody(body);
  const map = new Map();
  markers.forEach(function (marker, markerIndex) {
    const sectionEnd = etaSectionEnd(normalized, markerIndex, markers);
    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block.position > marker.index && block.position < sectionEnd) {
        map.set(block.position, marker.eta);
        break;
      }
    }
  });
  return map;
}

/**
 * True when the body is a pre-ship order confirmation (not a shipping notice).
 *
 * @param {string} subject Email subject.
 * @param {string} normalizedBody Whitespace-normalized body.
 * @return {boolean}
 */
function isAmazonPreShipOrderConfirmation(subject, normalizedBody) {
  const subj = normalize_body(subject || '');
  if (/\bhas shipped\b/i.test(subj) || /^(?:shipped|out for delivery|now arriving)/i.test(subj)) {
    return false;
  }
  if (!/\bOrder Confirmation\b/i.test(normalizedBody)) {
    return false;
  }
  return !/\b(?:Shipping Confirmation|your package was shipped|your package will arrive|Expected Delivery)\b/i.test(normalizedBody);
}

/**
 * Email-level ETA: primary body markers, then subject, then conservative fallback.
 *
 * @param {string} subject Email subject.
 * @param {string} body Email body text.
 * @param {string} emailDateIso Email received date (yyyy-MM-dd).
 * @return {{eta: string, source: string}} ISO date and source tag.
 */
function extractAmazonEmailLevelEta(subject, body, emailDateIso) {
  const normalized = normalize_body(body);
  if (isAmazonPreShipOrderConfirmation(subject, normalized)) {
    return { eta: '', source: '' };
  }
  const markers = extract_amazon_eta_markers(normalized, emailDateIso);
  if (markers.length) {
    return { eta: markers[0].eta, source: 'amazon_estimate' };
  }
  const subjectEta = extractAmazonEtaFromSubject(subject, emailDateIso);
  if (subjectEta.eta) {
    return subjectEta;
  }
  const fallback = extractAmazonFallbackBodyEta(body, emailDateIso);
  if (fallback) {
    return { eta: fallback, source: 'amazon_estimate_low' };
  }
  return { eta: '', source: '' };
}

function extract_item_name(body, domain) {
  const normalized = normalize_body(body);
  for (let i = 0; i < ITEM_ANCHOR_PATTERNS.length; i += 1) {
    const match = normalized.match(ITEM_ANCHOR_PATTERNS[i]);
    if (match) {
      const candidate = clean_item_candidate(match[1]);
      if (candidate && !is_ui_button_phrase(candidate) && !is_sku_only_candidate(candidate)) {
        return candidate;
      }
    }
  }

  const lines = (body || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    if (/\b(qty|quantity)\s*[:#]?\s*\d+\b/i.test(lines[index])) {
      for (let previous = index - 1; previous >= Math.max(0, index - 4); previous -= 1) {
        if (_looks_like_item_line(lines[previous])) {
          return clean_item_candidate(lines[previous]);
        }
      }
    }
  }

  return NOT_FOUND;
}

function normalizeItemName(rawName) {
  const value = strip_invisible_chars(rawName).toLowerCase();
  const specTokens = [];
  for (const match of value.matchAll(new RegExp(SPEC_TOKEN_SRC, 'gi'))) {
    specTokens.push(match[0].replace(/\s+/g, ''));
  }
  let withoutSpecs = value.replace(new RegExp(SPEC_TOKEN_SRC, 'gi'), ' ');
  withoutSpecs = withoutSpecs.replace(/\bx\d+\b/g, ' ');
  withoutSpecs = withoutSpecs.replace(/[^a-z0-9\s]/g, ' ');
  const words = withoutSpecs.replace(/\s+/g, ' ').trim().split(' ').filter(function (word) {
    return word && !MARKETING_FILLER_WORDS.has(word);
  });
  const descriptiveWords = words.slice(0, 6);
  const keyWords = descriptiveWords.slice();
  for (let i = 0; i < specTokens.length; i += 1) {
    const token = specTokens[i];
    if (token && keyWords.indexOf(token) === -1) {
      keyWords.push(token);
    }
  }
  return { cleaned: keyWords.join(' '), words: keyWords };
}

function extract_arrival_date(body) {
  const normalized = normalize_body(body);
  for (let i = 0; i < ARRIVAL_DATE_PATTERNS.length; i += 1) {
    const match = normalized.match(ARRIVAL_DATE_PATTERNS[i]);
    if (!match) {
      continue;
    }
    const parsed = parse_date_candidate(match[1]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function infer_email_status(subject, bodyText) {
  const text = normalize_body((subject || '') + ' ' + (bodyText || ''));
  if (/\bdelivered\b/i.test(text)) {
    return 'Delivered';
  }
  if (/\b(shipped|shipping|out for delivery|delivery update|delivery estimate update|on the way|tracking)\b/i.test(text)) {
    return 'Shipped';
  }
  if (/\bordered\b/i.test(text)) {
    return 'Ordered';
  }
  return 'Unknown';
}

function isoDateUTC(date) {
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

function parse_email_date(value) {
  if (!value) {
    return null;
  }
  const date = (value instanceof Date) ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return null;
  }
  return isoDateUTC(date);
}

function parse_date_candidate(value) {
  value = value.trim().replace(/\./g, '');
  const match = value.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (!match) {
    return null;
  }
  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (month === undefined) {
    return null;
  }
  const day = parseInt(match[2], 10);
  const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return isoDateUTC(date);
}

function extract_order_data(emailObj) {
  const senderEmail = emailObj.senderEmail || '';
  const senderName = emailObj.senderName || '';
  const subject = strip_invisible_chars(emailObj.subject || '');
  const body = strip_invisible_chars(emailObj.bodyText || '');
  const domain = get_domain(senderEmail);

  const orderNumber = extract_order_number(body, domain);
  const totalData = extract_total(body, domain);
  const amazonBodyItems = domain === 'amazon.com' ? extractAmazonItemsFromBody(body) : [];
  const subjectItem = (domain === 'amazon.com' && amazonBodyItems.length === 0)
    ? extractItemNameFromSubject(subject)
    : null;

  let itemName;
  let items;
  let itemNameTruncated;
  let multipleItems;
  let itemNameSource;
  if (amazonBodyItems.length) {
    itemName = amazonBodyItems[0];
    items = amazonBodyItems;
    itemNameTruncated = false;
    multipleItems = amazonBodyItems.length > 1;
    itemNameSource = 'amazon_body';
  } else if (subjectItem) {
    itemName = subjectItem.itemName;
    items = subjectItem.items;
    itemNameTruncated = subjectItem.itemNameTruncated;
    multipleItems = subjectItem.multipleItems;
    itemNameSource = 'subject';
  } else {
    itemName = extract_item_name(body, domain);
    items = itemName === NOT_FOUND ? [] : [itemName];
    itemNameTruncated = false;
    multipleItems = /\b(\d+)\s+(items|products)\b/i.test(normalize_body(body));
    itemNameSource = itemName === NOT_FOUND ? 'not_found' : 'body';
  }

  const normalizedItem = normalizeItemName(itemName !== NOT_FOUND ? itemName : '');
  const status = infer_email_status(subject, body);
  let arrivalDate;
  let arrivalDateSource;
  if (status === 'Delivered') {
    arrivalDate = parse_email_date(emailObj.date || '');
    arrivalDateSource = arrivalDate ? 'delivered_email' : NOT_FOUND;
  } else {
    arrivalDate = extract_arrival_date(body);
    arrivalDateSource = arrivalDate ? 'parsed_estimate' : NOT_FOUND;
  }

  const hits = [
    orderNumber !== NOT_FOUND,
    totalData.total !== NOT_FOUND,
    itemName !== NOT_FOUND,
    arrivalDate !== null && arrivalDate !== undefined,
  ];
  const hitCount = hits.filter(Boolean).length;
  const confidence = Math.round((hitCount / hits.length) * 100) / 100;

  return {
    orderNumber: orderNumber,
    total: totalData.total,
    currency: totalData.currency,
    store: get_store_name(senderEmail, senderName),
    itemName: itemName,
    items: items,
    itemNameSource: itemNameSource,
    itemNameTruncated: itemNameTruncated,
    itemNameNormalized: normalizedItem.cleaned,
    itemNameWords: normalizedItem.words,
    multipleItems: multipleItems,
    arrivalDate: arrivalDate ? arrivalDate : NOT_FOUND,
    arrivalDateSource: arrivalDateSource,
    confidence: confidence,
    needsReview: confidence < 0.75,
  };
}
