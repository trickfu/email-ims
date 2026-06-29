/**
 * Project-wide configuration.
 *
 * AMAZON_SEARCH_QUERY intentionally omits the lookback clause; GmailReader
 * appends newer_than:${LOOKBACK_DAYS}d at runtime so the window stays dynamic.
 *
 * The email SOURCE is the only Gmail-dependent piece. The pipeline (processSweep)
 * accepts an array of { messageId, senderEmail, subject, date, bodyText } objects,
 * which can come from searchAmazonEmails() (live) or TEST_FIXTURES (testing).
 */
const CONFIG = {
  SHEET_ID: 'PUT_SHEET_ID_HERE',

  TRACKING_TAB: 'LineItemTracking',
  INVENTORY_TAB: 'Inventory',
  UNATTRIBUTED_TAB: 'Unattributed',
  RUN_LOG_TAB: 'RunLog',

  // Phase 0 / GmailReader query (matches the validated mbox subject filter).
  AMAZON_SEARCH_QUERY:
    'from:amazon.com (subject:("your order" OR ordered OR shipped OR delivered OR "out for delivery" OR "order of") -subject:(unsubscribe OR sale OR deals OR "price drop"))',
  LOOKBACK_DAYS: 30,

  // Set true ONLY if Phase 0 (verifyBodyStructure) shows getPlainBody() stripped
  // the orderID= / Order # markers. Then bodies are taken from getBody() (HTML)
  // and run through the ported html_to_text cleaning instead.
  USE_HTML_BODY: false,
};
