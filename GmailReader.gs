/**
 * GmailReader.gs — the ONLY Gmail-dependent module.
 *
 * searchAmazonEmails() returns { messageId, senderEmail, subject, date, bodyText }
 * objects. The same object shape is used by TEST_FIXTURES, so everything
 * downstream (parse -> attribute -> track -> gate) is identical whether the
 * source is live Gmail or static fixtures.
 *
 * Body handling replicates the validated Python cleaning (parse_mbox.py +
 * extract.py): invisible-character stripping always, and HTML-to-text only when
 * CONFIG.USE_HTML_BODY is enabled (the getBody() fallback from Phase 0).
 */

const INVISIBLE_CHARS_RE_SOURCE = '[\\u2066\\u2067\\u2068\\u2069\\u00ad\\u200e\\u200f\\u200b]';

/**
 * Builds the Amazon Gmail search query with a dynamic lookback window.
 *
 * @return {string} Gmail search query.
 */
function buildAmazonSearchQuery() {
  return CONFIG.AMAZON_SEARCH_QUERY + ' newer_than:' + CONFIG.LOOKBACK_DAYS + 'd';
}

/**
 * Searches Gmail for Amazon order emails and returns structured message data.
 *
 * @return {Array<Object>} Email source objects.
 */
function searchAmazonEmails() {
  const query = buildAmazonSearchQuery();
  const threads = GmailApp.search(query);
  const results = [];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      results.push({
        messageId: message.getId(),
        senderEmail: parseSender(message.getFrom()).senderEmail,
        subject: stripInvisibleChars(message.getSubject()),
        date: message.getDate(),
        bodyText: getCleanBody(message),
      });
    });
  });

  console.log('searchAmazonEmails: ' + results.length + ' message(s).');
  return results;
}

/**
 * Returns the plain-text body, cleaned the same way the Python pipeline cleaned
 * mbox bodies. Uses getPlainBody() by default; falls back to getBody() (HTML)
 * stripped via htmlToText() when CONFIG.USE_HTML_BODY is true.
 *
 * @param {GoogleAppsScript.Gmail.GmailMessage} message Gmail message.
 * @return {string} Cleaned body text.
 */
function getCleanBody(message) {
  if (CONFIG.USE_HTML_BODY) {
    return htmlToText(message.getBody() || '');
  }
  return stripInvisibleChars(message.getPlainBody() || '');
}

/**
 * Removes bidirectional/soft-hyphen/zero-width markers (extract.py
 * strip_invisible_chars). These are what make the order markers parseable.
 *
 * @param {string} text Raw text.
 * @return {string} Text without invisible characters.
 */
function stripInvisibleChars(text) {
  return (text || '').replace(new RegExp(INVISIBLE_CHARS_RE_SOURCE, 'g'), '');
}

/**
 * Strips HTML to text, replicating parse_mbox.py html_to_text exactly.
 *
 * @param {string} value Raw HTML.
 * @return {string} Cleaned text.
 */
function htmlToText(value) {
  value = (value || '').replace(/<(script|style)[\s\S]*?>[\s\S]*?<\/\1>/gi, ' ');
  value = value.replace(/<br\s*\/?>/gi, '\n');
  value = value.replace(/<\/p\s*>/gi, '\n');
  value = value.replace(/<[^>]+>/g, ' ');
  value = htmlUnescape(value);
  value = value.replace(/[ \t\r\f\v]+/g, ' ');
  value = value.replace(/\n\s+/g, '\n');
  return stripInvisibleChars(value.trim());
}

/**
 * Minimal HTML entity decoder (named + numeric).
 *
 * @param {string} s Text with entities.
 * @return {string} Decoded text.
 */
function htmlUnescape(s) {
  return (s || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function (match, code) {
    if (code.charAt(0) === '#') {
      const isHex = code.charAt(1) === 'x' || code.charAt(1) === 'X';
      const num = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (isNaN(num)) {
        return match;
      }
      try {
        return String.fromCodePoint(num);
      } catch (e) {
        return match;
      }
    }
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
    return Object.prototype.hasOwnProperty.call(named, code) ? named[code] : match;
  });
}

/**
 * Parses a Gmail sender string into display name and email address.
 *
 * @param {string} from Sender string from GmailMessage.getFrom().
 * @return {{senderEmail: string, senderName: string}} Parsed sender details.
 */
function parseSender(from) {
  const sender = from || '';
  const match = sender.match(/^(.*?)\s*<([^<>@\s]+@[^<>\s]+)>/);

  if (match) {
    return {
      senderEmail: match[2],
      senderName: (match[1] || '').replace(/^"|"$/g, '').trim(),
    };
  }

  const emailMatch = sender.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    senderEmail: emailMatch ? emailMatch[0] : sender.trim(),
    senderName: '',
  };
}

/**
 * Manual smoke test for the Gmail search layer.
 */
function testAmazonSearch() {
  const results = searchAmazonEmails();
  console.log('Result count: ' + results.length);
  if (results.length > 0) {
    const first = Object.assign({}, results[0]);
    first.bodyText = (first.bodyText || '').substring(0, 200);
    console.log('First result (body truncated): ' + JSON.stringify(first, null, 2));
  }
}
