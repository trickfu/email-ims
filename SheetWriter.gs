const ORDER_SHEET_HEADERS = [
  'Date',
  'Store',
  'Order Number',
  'Total',
  'Currency',
  'Confidence',
  'Needs Review',
  'Status',
  'Message ID',
];

const MESSAGE_ID_COLUMN = ORDER_SHEET_HEADERS.length;

const RUN_LOG_SHEET_NAME = 'Run Log';

const RUN_LOG_HEADERS = [
  'Timestamp',
  'Status',
  'Emails Found',
  'New Rows Written',
  'Skipped Duplicates',
  'Needs Review Count',
  'Error Message',
];

/**
 * Opens the configured spreadsheet and returns the configured orders sheet.
 *
 * Creates the sheet tab and header row if needed.
 *
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Orders sheet.
 */
function getOrCreateSheet() {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PUT_SHEET_ID_HERE') {
    throw new Error('Set CONFIG.SHEET_ID in Config.gs before running runOrderScan().');
  }

  var spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, ORDER_SHEET_HEADERS.length).setValues([ORDER_SHEET_HEADERS]);
  } else {
    validateOrderSheetHeaders(sheet);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Returns the run log sheet, creating it and its header row when needed.
 *
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Run log sheet.
 */
function getOrCreateRunLogSheet() {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PUT_SHEET_ID_HERE') {
    throw new Error('Set CONFIG.SHEET_ID in Config.gs before writing the run log.');
  }

  var spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = spreadsheet.getSheetByName(RUN_LOG_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(RUN_LOG_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RUN_LOG_HEADERS.length).setValues([RUN_LOG_HEADERS]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Writes one run summary row to the Run Log sheet.
 *
 * @param {Object} summary Run summary values.
 */
function writeRunLog(summary) {
  var sheet = getOrCreateRunLogSheet();

  sheet.appendRow([
    new Date(),
    summary.status,
    summary.emailsFound,
    summary.newRowsWritten,
    summary.skippedDuplicates,
    summary.needsReviewCount,
    summary.errorMessage || '',
  ]);
}

/**
 * Verifies that an existing sheet matches the expected column layout.
 *
 * Dedupe depends on Message ID being the final column, so a mismatched existing
 * sheet should be fixed manually instead of silently appending bad rows.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Orders sheet.
 */
function validateOrderSheetHeaders(sheet) {
  var headerValues = sheet.getRange(1, 1, 1, ORDER_SHEET_HEADERS.length).getValues()[0];

  for (var i = 0; i < ORDER_SHEET_HEADERS.length; i += 1) {
    if (headerValues[i] !== ORDER_SHEET_HEADERS[i]) {
      throw new Error(
        'Sheet header mismatch. Expected column ' +
          (i + 1) +
          ' to be "' +
          ORDER_SHEET_HEADERS[i] +
          '". Fix the header row or use a blank sheet.'
      );
    }
  }
}

/**
 * Reads already-written Gmail message IDs from the Message ID column.
 *
 * The column is read once for efficiency instead of reading row by row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet=} sheet Orders sheet.
 * @return {Set<string>} Processed Gmail message IDs.
 */
function getProcessedMessageIds(sheet) {
  var ordersSheet = sheet || getOrCreateSheet();
  var lastRow = ordersSheet.getLastRow();
  var processedMessageIds = new Set();

  if (lastRow <= 1) {
    return processedMessageIds;
  }

  var messageIdValues = ordersSheet.getRange(2, MESSAGE_ID_COLUMN, lastRow - 1, 1).getValues();

  messageIdValues.forEach(function (row) {
    var messageId = row[0];

    if (messageId) {
      processedMessageIds.add(String(messageId));
    }
  });

  return processedMessageIds;
}

/**
 * Appends a single extracted order row to the configured sheet.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Orders sheet.
 * @param {Object} emailObj Raw email object from searchOrderEmails().
 * @param {Object} extracted Structured order fields from extractOrderData().
 */
function writeOrderRow(sheet, emailObj, extracted) {
  sheet.appendRow([
    formatDateForSheet(emailObj.date),
    extracted.store,
    extracted.orderNumber,
    formatTotalForSheet(extracted.total),
    extracted.currency,
    extracted.confidence,
    extracted.needsReview ? 'NEEDS REVIEW' : '',
    '',
    emailObj.messageId,
  ]);
}

/**
 * Keeps date values as Date objects so Sheets can sort and format them.
 *
 * @param {Date|string|number} dateValue Email received date.
 * @return {Date} Date object for Sheets.
 */
function formatDateForSheet(dateValue) {
  return dateValue instanceof Date ? dateValue : new Date(dateValue);
}

/**
 * Converts extracted total strings to numbers when possible.
 *
 * @param {string|number} total Extracted total value.
 * @return {string|number} Number for Sheets formulas, or original value.
 */
function formatTotalForSheet(total) {
  if (total === 'NOT FOUND') {
    return total;
  }

  var parsedTotal = parseFloat(String(total).replace(/,/g, ''));

  return isNaN(parsedTotal) ? total : parsedTotal;
}

/*
 * Conditional formatting guidance:
 *
 * To highlight rows that need review in Google Sheets:
 * 1. Open the Orders sheet tab.
 * 2. Select the full data range, for example A2:I.
 * 3. Go to Format > Conditional formatting.
 * 4. Under "Format cells if", choose "Custom formula is".
 * 5. Enter this formula:
 *    =$G2="NEEDS REVIEW"
 * 6. Pick a fill color and click Done.
 *
 * Column G is the "Needs Review" column in the header row above.
 */
