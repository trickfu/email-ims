/**
 * SheetWriter.gs — sheet plumbing for the four-tab schema.
 *
 * Tabs: LineItemTracking (persistent state, handled in LineItemTracking.gs),
 * Inventory (gated delivered output), Unattributed (UNKNOWN items), RunLog.
 *
 * All Sheet I/O is bulk (getValues / setValues), never per-cell in a loop.
 */

const INVENTORY_HEADERS = [
  'Order Number',
  'Item Name',
  'Normalized Name',
  'Quantity',
  'Status',
  'Ordered Date',
  'Shipped Date',
  'Delivered Date',
  'Message IDs',
  'Gated At',
];

const UNATTRIBUTED_HEADERS = [
  'Item Name',
  'Normalized Name',
  'Quantity',
  'Status',
  'Ordered Date',
  'Shipped Date',
  'Delivered Date',
  'Needs Review',
  'Message IDs',
  'Updated At',
];

const RUN_LOG_HEADERS = [
  'Timestamp',
  'Source',
  'Dry Run',
  'Emails Scanned',
  'Emails Processed',
  'New Line Items',
  'Status Advances',
  'Gated To Inventory',
  'UNKNOWN Count',
  'Total Line Items',
  'Error',
];

/**
 * Opens the configured spreadsheet, returns the named tab, creating it (with a
 * frozen header row) when needed.
 *
 * @param {string} name Tab name.
 * @param {Array<string>} headers Header row.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Sheet.
 */
function getOrCreateTab(name, headers) {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'PUT_SHEET_ID_HERE') {
    throw new Error('Set CONFIG.SHEET_ID in Config.gs before running the pipeline.');
  }
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * Appends gated (delivered) line items to the Inventory tab in one bulk write.
 *
 * @param {Array<Object>} records Line-item records.
 */
function appendInventoryRows(records) {
  if (!records || !records.length) {
    return;
  }
  const sheet = getOrCreateTab(CONFIG.INVENTORY_TAB, INVENTORY_HEADERS);
  const now = new Date();
  const rows = records.map(function (record) {
    return [
      record.order_number,
      record.item_name_raw,
      record.item_name_normalized,
      record.quantity,
      record.current_status,
      record.ordered_date,
      record.shipped_date,
      record.delivered_date,
      (record.contributing_message_ids || []).join('|'),
      now,
    ];
  });
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, INVENTORY_HEADERS.length).setValues(rows);
}

/**
 * Rewrites the Unattributed tab from the current UNKNOWN records (idempotent
 * view, so re-runs don't duplicate).
 *
 * @param {Array<Object>} records UNKNOWN line-item records.
 */
function writeUnattributedRows(records) {
  const sheet = getOrCreateTab(CONFIG.UNATTRIBUTED_TAB, UNATTRIBUTED_HEADERS);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, UNATTRIBUTED_HEADERS.length).clearContent();
  }
  if (!records || !records.length) {
    return;
  }
  const now = new Date();
  const rows = records.map(function (record) {
    return [
      record.item_name_raw,
      record.item_name_normalized,
      record.quantity,
      record.current_status,
      record.ordered_date,
      record.shipped_date,
      record.delivered_date,
      !!record.needs_review,
      (record.contributing_message_ids || []).join('|'),
      now,
    ];
  });
  sheet.getRange(2, 1, rows.length, UNATTRIBUTED_HEADERS.length).setValues(rows);
}

/**
 * Appends one run-summary row to the RunLog tab.
 *
 * @param {Object} summary Run summary.
 */
function appendRunLog(summary) {
  const sheet = getOrCreateTab(CONFIG.RUN_LOG_TAB, RUN_LOG_HEADERS);
  sheet.appendRow([
    new Date(),
    summary.source || '',
    !!summary.dryRun,
    summary.emailsScanned || 0,
    summary.emailsProcessed || 0,
    summary.newLineItems || 0,
    summary.statusAdvances || 0,
    summary.gated || 0,
    summary.unknownCount || 0,
    summary.totalLineItems || 0,
    summary.error || '',
  ]);
}

/**
 * Clears data rows of the tracking/inventory/unattributed tabs (NOT RunLog) so a
 * fixtures run is deterministic and repeatable.
 */
function resetFixtureTabs() {
  const tabs = [
    [CONFIG.TRACKING_TAB, LINE_ITEM_HEADERS],
    [CONFIG.INVENTORY_TAB, INVENTORY_HEADERS],
    [CONFIG.UNATTRIBUTED_TAB, UNATTRIBUTED_HEADERS],
  ];
  tabs.forEach(function (entry) {
    const sheet = getOrCreateTab(entry[0], entry[1]);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, entry[1].length).clearContent();
    }
  });
  console.log('Fixture tabs reset (LineItemTracking, Inventory, Unattributed).');
}

/**
 * Coercion helpers for sheet cell values (Sheets may return Date/boolean/number).
 */
function cellToIso(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
  }
  return value == null ? '' : String(value).trim();
}

function toBool(value) {
  return value === true || /^true$/i.test(String(value));
}

function toInt(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function splitIds(value) {
  return String(value == null ? '' : value)
    .split('|')
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
}
