/**
 * Builds the Gmail search query using the configured base query and lookback.
 *
 * @return {string} Gmail search query.
 */
function buildOrderEmailSearchQuery() {
  return CONFIG.GMAIL_SEARCH_QUERY + ' newer_than:' + CONFIG.LOOKBACK_DAYS + 'd';
}

/**
 * Parses a Gmail sender string into display name and email address.
 *
 * Handles values like:
 * - Jane Store <orders@example.com>
 * - "Jane Store" <orders@example.com>
 * - orders@example.com
 *
 * @param {string} from Sender string from GmailMessage.getFrom().
 * @return {{senderEmail: string, senderName: string}} Parsed sender details.
 */
function parseSender(from) {
  var sender = from || '';
  var match = sender.match(/^(.*?)\s*<([^<>@\s]+@[^<>\s]+)>/);

  if (match) {
    return {
      senderEmail: match[2],
      senderName: (match[1] || '').replace(/^"|"$/g, '').trim(),
    };
  }

  var emailMatch = sender.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    senderEmail: emailMatch ? emailMatch[0] : sender.trim(),
    senderName: '',
  };
}

/**
 * Searches Gmail for likely order emails and returns structured message data.
 *
 * This function only reads Gmail. It does not parse order fields or write to a
 * spreadsheet yet.
 *
 * @return {Array<Object>} Matching Gmail messages.
 */
function searchOrderEmails() {
  var query = buildOrderEmailSearchQuery();
  var threads = GmailApp.search(query);
  var results = [];

  threads.forEach(function (thread) {
    var threadId = thread.getId();
    var messages = thread.getMessages();

    messages.forEach(function (message) {
      var sender = parseSender(message.getFrom());
      var bodyText = message.getPlainBody();

      results.push({
        messageId: message.getId(),
        threadId: threadId,
        senderEmail: sender.senderEmail,
        senderName: sender.senderName,
        subject: message.getSubject(),
        date: message.getDate(),
        bodyText: bodyText,
      });

      console.log('Body preview: ' + bodyText.substring(0, 200));
    });
  });

  console.log('Messages found: ' + results.length);
  return results;
}

/**
 * Manual smoke test for the Apps Script editor.
 */
function testSearch() {
  var results = searchOrderEmails();

  console.log('Result count: ' + results.length);

  if (results.length > 0) {
    console.log('First result: ' + JSON.stringify(results[0], null, 2));
  } else {
    console.log('No matching order emails found for the current query.');
  }
}
