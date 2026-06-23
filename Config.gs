/**
 * Project-wide configuration.
 *
 * GMAIL_SEARCH_QUERY intentionally omits the lookback clause. The Gmail reader
 * appends newer_than:${LOOKBACK_DAYS}d at runtime so the window stays dynamic.
 */
const CONFIG = {
  GMAIL_SEARCH_QUERY:
    '(subject:(order OR "order confirmation" OR receipt OR "your order" OR shipped OR shipping) -subject:(unsubscribe))',
  SHEET_ID: 'PUT_SHEET_ID_HERE',
  SHEET_NAME: 'Orders',
  LOOKBACK_DAYS: 30,
};
