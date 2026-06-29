/**
 * Phase 0 verification — body-structure check (run against the production
 * account when you get access; not a blocker for building/testing now).
 *
 * The attribution engine depends on two structures surviving getPlainBody():
 *   Structure A (focused order emails): an "Order #NNN-NNNNNNN-NNNNNNN" line.
 *   Structure B (summary/shipping emails): "orderID=NNN-NNNNNNN-NNNNNNN" markers
 *     and "* <item> Quantity: <n>" item blocks.
 *
 * Run verifyBodyStructure() manually and inspect the log:
 *   - If markers are intact -> proceed (point the source at searchAmazonEmails).
 *   - If orderID= URLs are stripped -> set CONFIG.USE_HTML_BODY = true so bodies
 *     come from getBody() (HTML) cleaned via htmlToText(), and re-run.
 */
function verifyBodyStructure() {
  const MAX_MESSAGES = 10;
  const emails = searchAmazonEmails();
  const inspectCount = Math.min(emails.length, MAX_MESSAGES);

  console.log('verifyBodyStructure: inspecting ' + inspectCount + ' of ' + emails.length + ' message(s).');
  console.log('Body source: ' + (CONFIG.USE_HTML_BODY ? 'getBody() + htmlToText()' : 'getPlainBody()'));

  let orderHashCount = 0;
  let orderIdCount = 0;
  let quantityBlockCount = 0;

  for (let i = 0; i < inspectCount; i += 1) {
    const emailObj = emails[i];
    const body = emailObj.bodyText || '';
    const hasOrderHash = /Order #\s*[0-9]{3}-[0-9]{7}-[0-9]{7}/.test(body);
    const hasOrderId = /orderID=[0-9]{3}-[0-9]{7}-[0-9]{7}/.test(body);
    const hasQuantityBlock = /\*\s+.+?\s+(?:Quantity|Qty)\s*:\s*\d+/i.test(body);

    if (hasOrderHash) { orderHashCount += 1; }
    if (hasOrderId) { orderIdCount += 1; }
    if (hasQuantityBlock) { quantityBlockCount += 1; }

    console.log('--- Message ' + (i + 1) + ' ---');
    console.log('messageId: ' + emailObj.messageId);
    console.log('subject: ' + emailObj.subject);
    console.log('Order # line: ' + (hasOrderHash ? 'YES' : 'no') +
      ' | orderID= marker: ' + (hasOrderId ? 'YES' : 'no') +
      ' | * Quantity: block: ' + (hasQuantityBlock ? 'YES' : 'no'));
    console.log('Full body:');
    console.log(body);
  }

  console.log('=== Structure summary across ' + inspectCount + ' message(s) ===');
  console.log('Order # lines:        ' + orderHashCount + ' / ' + inspectCount);
  console.log('orderID= markers:     ' + orderIdCount + ' / ' + inspectCount);
  console.log('* ... Quantity: blocks: ' + quantityBlockCount + ' / ' + inspectCount);
  if (orderIdCount === 0 && quantityBlockCount === 0 && inspectCount > 0) {
    console.log('WARNING: no markers found. If these are order emails, set CONFIG.USE_HTML_BODY=true and re-run.');
  }
}
