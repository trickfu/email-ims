/**
 * Run createTimeTrigger() once manually from the Apps Script editor after
 * runOrderScan() succeeds. It installs the unattended hourly schedule.
 */
function createTimeTrigger() {
  removeAllTriggers();

  ScriptApp.newTrigger('runOrderScan').timeBased().everyHours(1).create();

  console.log('Created hourly trigger for runOrderScan().');
}

/**
 * Clears all existing triggers for runOrderScan().
 */
function removeAllTriggers() {
  removeTriggersForHandler('runOrderScan');
}

/**
 * Creates a weekly Monday morning maintenance report trigger.
 */
function createWeeklyTrigger() {
  removeTriggersForHandler('weeklyMaintenanceReport');

  ScriptApp.newTrigger('weeklyMaintenanceReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();

  console.log('Created Monday morning trigger for weeklyMaintenanceReport().');
}

/**
 * Emails a grouped count of rows that still need review by store.
 */
function weeklyMaintenanceReport() {
  try {
    var sheet = getOrCreateSheet();
    var lastRow = sheet.getLastRow();
    var recipient = Session.getActiveUser().getEmail();

    if (lastRow <= 1) {
      MailApp.sendEmail({
        to: recipient,
        subject: 'Order scanner weekly maintenance report',
        body: 'No order rows found yet.',
      });
      return;
    }

    var rowValues = sheet.getRange(2, 1, lastRow - 1, ORDER_SHEET_HEADERS.length).getValues();
    var needsReviewByStore = {};
    var totalNeedsReview = 0;

    rowValues.forEach(function (row) {
      var store = row[1] || 'Unknown Store';
      var needsReview = row[6];

      if (needsReview === 'NEEDS REVIEW') {
        needsReviewByStore[store] = (needsReviewByStore[store] || 0) + 1;
        totalNeedsReview += 1;
      }
    });

    var summary = buildMaintenanceSummary(needsReviewByStore, totalNeedsReview);

    MailApp.sendEmail({
      to: recipient,
      subject: 'Order scanner weekly maintenance report',
      body: summary,
    });
  } catch (error) {
    console.error('Weekly maintenance report failed: ' + formatErrorForLog(error));
  }
}

/**
 * Formats the maintenance email body.
 *
 * @param {Object} needsReviewByStore Map of store names to review counts.
 * @param {number} totalNeedsReview Total rows needing review.
 * @return {string} Email body.
 */
function buildMaintenanceSummary(needsReviewByStore, totalNeedsReview) {
  var stores = Object.keys(needsReviewByStore).sort();

  if (totalNeedsReview === 0) {
    return 'No unmatched order rows need review this week.';
  }

  var summaryParts = stores.map(function (store) {
    return store + ': ' + needsReviewByStore[store] + ' unmatched';
  });

  return summaryParts.join(', ');
}

/**
 * Removes triggers matching one handler function.
 *
 * @param {string} handlerFunction Function name attached to the trigger.
 */
function removeTriggersForHandler(handlerFunction) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerFunction) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
