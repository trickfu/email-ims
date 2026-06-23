/**
 * Searches Gmail, extracts order fields, and writes new messages to the sheet.
 *
 * Existing rows are deduplicated by Gmail Message ID so repeat runs do not
 * append duplicate rows.
 */
function runOrderScan() {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  var summary = {
    status: 'success',
    emailsFound: 0,
    newRowsWritten: 0,
    skippedDuplicates: 0,
    needsReviewCount: 0,
    errorMessage: '',
  };

  try {
    lock.waitLock(30000);
    lockAcquired = true;

    var emails = searchOrderEmails();
    var sheet = getOrCreateSheet();
    var processedMessageIds = getProcessedMessageIds(sheet);

    summary.emailsFound = emails.length;

    emails.forEach(function (emailObj) {
      if (processedMessageIds.has(emailObj.messageId)) {
        summary.skippedDuplicates += 1;
        return;
      }

      var extracted = extractOrderData(emailObj);

      writeOrderRow(sheet, emailObj, extracted);
      processedMessageIds.add(emailObj.messageId);
      summary.newRowsWritten += 1;

      if (extracted.needsReview) {
        summary.needsReviewCount += 1;
      }
    });

    console.log('Order scan complete.');
    console.log('Total found: ' + summary.emailsFound);
    console.log('New rows written: ' + summary.newRowsWritten);
    console.log('Skipped as duplicates: ' + summary.skippedDuplicates);
    console.log('Flagged needsReview: ' + summary.needsReviewCount);
  } catch (error) {
    summary.status = 'error';
    summary.errorMessage = error && error.message ? error.message : String(error);

    logAndNotifyFailure(error);
  } finally {
    try {
      writeRunLog(summary);
    } catch (logError) {
      console.error('Failed to write run log: ' + formatErrorForLog(logError));
    }

    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (lockError) {
        console.error('Failed to release script lock: ' + formatErrorForLog(lockError));
      }
    }
  }
}

/**
 * Logs full failure details and emails the active Apps Script user.
 *
 * @param {*} error Uncaught scan error.
 */
function logAndNotifyFailure(error) {
  var errorDetails = formatErrorForLog(error);

  console.error('Order scanner failed: ' + errorDetails);

  try {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: 'Order scanner failed',
      body: errorDetails,
    });
  } catch (emailError) {
    console.error('Failed to send failure notification: ' + formatErrorForLog(emailError));
  }
}

/**
 * Formats errors with stack traces when available.
 *
 * @param {*} error Error-like value.
 * @return {string} Error message plus stack when available.
 */
function formatErrorForLog(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.stack) {
    return error.stack;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}
