const STORE_LOOKUP = {
  'amazon.com': 'Amazon',
  'etsy.com': 'Etsy',
  'ebay.com': 'eBay',
  'target.com': 'Target',
  'walmart.com': 'Walmart',
  'bestbuy.com': 'Best Buy',
};

const SHOPIFY_DOMAINS = ['shopify.com', 'myshopify.com'];

const SENDER_RULES = {
  'amazon.com': {
    orderNumber: /Order\s*#\s*(\d{3}-\d{7}-\d{7})/i,
    total: /\b(?:order\s*total|grand\s*total|total\s*charged|amount\s*charged)\b[:\s]*(?:[$£€]|USD|GBP|EUR)?\s*([\d,]+\.\d{2})/i,
  },
  'etsy.com': {
    orderNumber: /Order\s*No\.\s*(\d+)/i,
    total: /You\s*paid\s*(?:[$£€]|USD|GBP|EUR)?\s*([\d,]+\.\d{2})/i,
  },
};

const GENERIC_ORDER_NUMBER_PATTERNS = [
  /order\s*#\s*([A-Z0-9-]{5,20})/i,
  /order\s*number[:\s]+([A-Z0-9-]{5,20})/i,
  /confirmation\s*#?[:\s]+([A-Z0-9-]{5,20})/i,
  /order\s*id[:\s]+([A-Z0-9-]{5,20})/i,
];

const GENERIC_TOTAL_PATTERNS = [
  /\b(?:order\s*total|grand\s*total|total\s*charged|amount\s*charged)\b[:\s]*(?:[$£€]|USD|GBP|EUR)?\s*([\d,]+\.\d{2})/i,
  /\btotal\b[:\s]*(?:[$£€]|USD|GBP|EUR)?\s*([\d,]+\.\d{2})/i,
  /you\s*paid[:\s]*(?:[$£€]|USD|GBP|EUR)?\s*([\d,]+\.\d{2})/i,
];

/**
 * Extracts structured order fields from a Gmail message object.
 *
 * @param {Object} emailObj Message object from searchOrderEmails().
 * @return {{orderNumber: string, total: string, currency: string, store: string, confidence: string, needsReview: boolean}}
 */
function extractOrderData(emailObj) {
  var normalizedBody = normalizeBody(emailObj.bodyText);
  var senderDomain = getSenderDomain(emailObj.senderEmail);
  var orderNumber = extractOrderNumber(normalizedBody, senderDomain);
  var total = extractTotal(normalizedBody, senderDomain);

  return {
    orderNumber: orderNumber,
    total: total,
    currency: extractCurrency(normalizedBody, total),
    store: getStoreName(emailObj.senderEmail, emailObj.senderName),
    confidence: orderNumber !== 'NOT FOUND' && total !== 'NOT FOUND' ? 'high' : 'low',
    needsReview: orderNumber === 'NOT FOUND' || total === 'NOT FOUND',
  };
}

/**
 * Collapses whitespace so regexes work across line breaks and HTML-ish spacing.
 *
 * @param {string} text Raw email body text.
 * @return {string} Normalized body text.
 */
function normalizeBody(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves a readable store name from sender details.
 *
 * @param {string} senderEmail Email address extracted from the Gmail sender.
 * @param {string} senderName Display name extracted from the Gmail sender.
 * @return {string} Clean store name.
 */
function getStoreName(senderEmail, senderName) {
  var domain = getSenderDomain(senderEmail);
  var cleanSenderName = (senderName || '').trim();
  var lookupName = getStoreLookupName(domain);

  if (lookupName) {
    return lookupName;
  }

  if (isShopifyDomain(domain) && cleanSenderName) {
    return cleanSenderName;
  }

  return cleanSenderName || domain;
}

/**
 * Finds a clean store name for exact domains and known subdomains.
 *
 * @param {string} domain Sender domain.
 * @return {string} Store name, or empty string.
 */
function getStoreLookupName(domain) {
  if (STORE_LOOKUP[domain]) {
    return STORE_LOOKUP[domain];
  }

  for (var lookupDomain in STORE_LOOKUP) {
    if (Object.prototype.hasOwnProperty.call(STORE_LOOKUP, lookupDomain) && domain.endsWith('.' + lookupDomain)) {
      return STORE_LOOKUP[lookupDomain];
    }
  }

  return '';
}

/**
 * Extracts the domain from an email address.
 *
 * @param {string} senderEmail Sender email address.
 * @return {string} Lowercase domain, or an empty string if unavailable.
 */
function getSenderDomain(senderEmail) {
  var email = (senderEmail || '').trim().toLowerCase();
  var match = email.match(/@([^>\s]+)$/);

  return match ? match[1] : '';
}

/**
 * Extracts an order number using sender-specific rules first, then generic patterns.
 *
 * @param {string} bodyText Normalized email body text.
 * @param {string} senderDomain Sender domain.
 * @return {string} Matched order number, or NOT FOUND.
 */
function extractOrderNumber(bodyText, senderDomain) {
  var senderRule = getSenderRule(senderDomain);
  var senderMatch = matchFirstGroup(bodyText, senderRule && senderRule.orderNumber);

  if (senderMatch) {
    return senderMatch;
  }

  return matchPatternList(bodyText, GENERIC_ORDER_NUMBER_PATTERNS);
}

/**
 * Extracts an order total using sender-specific rules first, then generic patterns.
 *
 * @param {string} bodyText Normalized email body text.
 * @param {string} senderDomain Sender domain.
 * @return {string} Matched total amount, or NOT FOUND.
 */
function extractTotal(bodyText, senderDomain) {
  var senderRule = getSenderRule(senderDomain);
  var senderMatch = matchFirstGroup(bodyText, senderRule && senderRule.total);

  if (senderMatch) {
    return senderMatch;
  }

  return matchPatternList(bodyText, GENERIC_TOTAL_PATTERNS);
}

/**
 * Detects a basic currency marker near the matched amount, defaulting to USD.
 *
 * @param {string} bodyText Normalized email body text.
 * @param {string=} matchedAmount Extracted total amount.
 * @return {string} Currency code.
 */
function extractCurrency(bodyText, matchedAmount) {
  var text = bodyText || '';
  var amount = matchedAmount && matchedAmount !== 'NOT FOUND' ? escapeRegExp(matchedAmount) : '[\\d,]+\\.\\d{2}';
  var nearbyCurrencyPattern = new RegExp('(?:[$£€]|USD|GBP|EUR)\\s*.{0,12}' + amount + '|' + amount + '\\s*.{0,12}(?:USD|GBP|EUR)', 'i');
  var match = text.match(nearbyCurrencyPattern);
  var marker = match ? match[0] : text;

  if (/£|GBP/i.test(marker)) {
    return 'GBP';
  }

  if (/€|EUR/i.test(marker)) {
    return 'EUR';
  }

  return 'USD';
}

/**
 * Runs extraction against real Gmail search results and logs a compact summary.
 */
function testExtraction() {
  var emails = searchOrderEmails();

  console.log('store | orderNumber | total | confidence');

  emails.forEach(function (emailObj) {
    var extracted = extractOrderData(emailObj);

    console.log(
      extracted.store +
        ' | ' +
        extracted.orderNumber +
        ' | ' +
        extracted.total +
        ' | ' +
        extracted.confidence
    );
  });
}

/**
 * Returns the first capture group for a single regex.
 *
 * @param {string} text Text to search.
 * @param {RegExp|undefined} pattern Regex with a capture group.
 * @return {string} First capture group, or empty string.
 */
function matchFirstGroup(text, pattern) {
  if (!pattern) {
    return '';
  }

  var match = text.match(pattern);

  return match ? match[1] : '';
}

/**
 * Returns the first capture group matched by a pattern list.
 *
 * @param {string} text Text to search.
 * @param {RegExp[]} patterns Regex list.
 * @return {string} First capture group, or NOT FOUND.
 */
function matchPatternList(text, patterns) {
  for (var i = 0; i < patterns.length; i += 1) {
    var match = matchFirstGroup(text, patterns[i]);

    if (match) {
      return match;
    }
  }

  return 'NOT FOUND';
}

/**
 * Finds a sender-specific extraction rule. Exact domain matches are preferred,
 * with subdomains falling back to their parent domain rule.
 *
 * @param {string} senderDomain Sender domain.
 * @return {Object|undefined} Sender rule.
 */
function getSenderRule(senderDomain) {
  var domain = senderDomain || '';

  if (SENDER_RULES[domain]) {
    return SENDER_RULES[domain];
  }

  for (var ruleDomain in SENDER_RULES) {
    if (Object.prototype.hasOwnProperty.call(SENDER_RULES, ruleDomain) && domain.endsWith('.' + ruleDomain)) {
      return SENDER_RULES[ruleDomain];
    }
  }

  return undefined;
}

/**
 * Checks whether a sender domain is Shopify-related.
 *
 * @param {string} domain Sender domain.
 * @return {boolean} True if domain looks Shopify-related.
 */
function isShopifyDomain(domain) {
  for (var i = 0; i < SHOPIFY_DOMAINS.length; i += 1) {
    if (domain === SHOPIFY_DOMAINS[i] || domain.endsWith('.' + SHOPIFY_DOMAINS[i])) {
      return true;
    }
  }

  return false;
}

/**
 * Escapes user-controlled strings before putting them inside dynamic regexes.
 *
 * @param {string} text Text to escape.
 * @return {string} Regex-safe text.
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
