/**
 * Main.gs — orchestration.
 *
 * processSweep(emails, options) is the source-agnostic core: load state ->
 * apply new emails (parse + attribute + track) -> gate delivered into Inventory
 * -> route UNKNOWN to Unattributed -> save state -> RunLog. The email SOURCE is
 * the only swap point:
 *   - runSweep()          : live Gmail (searchAmazonEmails)
 *   - runSweepDryRun()    : live Gmail, no writes (validation gate)
 *   - runAgainstFixtures(): static TEST_FIXTURES (no Gmail needed)
 */

/**
 * Source-agnostic sweep core.
 *
 * @param {Array<Object>} emails Source email objects.
 * @param {{dryRun?: boolean, source?: string}} options Options.
 * @return {{state: Map, summary: Object, gatedRecords: Array, unknownRecords: Array}}
 */
function processSweep(emails, options) {
  options = options || {};
  const dryRun = !!options.dryRun;
  const source = options.source || 'gmail';

  const existingState = loadTrackingState();
  const preStatus = new Map();
  const seenIds = new Set();
  existingState.forEach(function (record, key) {
    preStatus.set(key, record.current_status || 'Unknown');
    (record.contributing_message_ids || []).forEach(function (id) {
      if (id) {
        seenIds.add(id);
      }
    });
  });

  // Skip emails already represented in state (re-processing is safe via max-rank,
  // but skipping is faster). State seeding preserves their prior attribution.
  const newEmails = (emails || []).filter(function (emailObj) {
    return !(emailObj && emailObj.messageId && seenIds.has(emailObj.messageId));
  });

  const state = update_amazon_line_item_state(newEmails, existingState);

  let statusAdvances = 0;
  state.forEach(function (record, key) {
    if (preStatus.has(key)) {
      const before = STATUS_RANK[preStatus.get(key)] || 0;
      const after = STATUS_RANK[record.current_status] || 0;
      if (after > before) {
        statusAdvances += 1;
      }
    }
  });

  const gatedRecords = [];
  const unknownRecords = [];
  state.forEach(function (record) {
    if (record.order_number === UNKNOWN_ORDER) {
      unknownRecords.push(record);
      return;
    }
    if (record.current_status === 'Delivered' && !record.added_to_inventory) {
      gatedRecords.push(record);
      if (!dryRun) {
        record.added_to_inventory = true;
      }
    }
  });

  const summary = {
    source: source,
    dryRun: dryRun,
    emailsScanned: (emails || []).length,
    emailsProcessed: newEmails.length,
    newLineItems: state.size - existingState.size,
    statusAdvances: statusAdvances,
    gated: gatedRecords.length,
    unknownCount: unknownRecords.length,
    totalLineItems: state.size,
    error: '',
  };

  logSweepSummary(summary);

  if (dryRun) {
    console.log('DRY RUN: no writes to Inventory / LineItemTracking / Unattributed.');
  } else {
    appendInventoryRows(gatedRecords);
    writeUnattributedRows(unknownRecords);
    saveTrackingState(state);
    appendRunLog(summary);
  }

  return { state: state, summary: summary, gatedRecords: gatedRecords, unknownRecords: unknownRecords };
}

/**
 * Live hourly sweep. Lock + try/catch + failure email + error RunLog row.
 */
function runSweep() {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  try {
    lock.waitLock(30000);
    lockAcquired = true;
    const emails = searchAmazonEmails();
    processSweep(emails, { dryRun: false, source: 'gmail' });
  } catch (error) {
    logAndNotifyFailure(error);
    try {
      appendRunLog({ source: 'gmail', dryRun: false, error: formatErrorForLog(error) });
    } catch (logError) {
      console.error('Failed to write error run log: ' + formatErrorForLog(logError));
    }
  } finally {
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
 * Validation gate: everything EXCEPT writing to Inventory / advancing
 * added_to_inventory / saving state. Logs what WOULD happen. Run on real Gmail
 * before enabling the trigger.
 */
function runSweepDryRun() {
  const emails = searchAmazonEmails();
  processSweep(emails, { dryRun: true, source: 'gmail-dryrun' });
}

/**
 * Full pipeline against static fixtures (NO Gmail). Resets the data tabs first
 * for a deterministic run, then logs line items and fixture assertions.
 */
function runAgainstFixtures() {
  if (typeof TEST_FIXTURES === 'undefined') {
    throw new Error('TEST_FIXTURES not found. Add Fixtures.gs to the project.');
  }
  resetFixtureTabs();
  const result = processSweep(TEST_FIXTURES, { dryRun: false, source: 'fixtures' });
  logFixtureAssertions(result.state);
  return result;
}

/**
 * Round-trip test for tracking persistence (load/save). Writes a known record,
 * reads it back, and reports equality. Run against a TEST sheet.
 */
function testTrackingRoundTrip() {
  const order = '123-1234567-1234567';
  const normalized = 'round trip test item';
  const record = default_line_item_record(order, 'Round Trip Test Item Raw', normalized, 2);
  record.current_status = 'Delivered';
  record.delivered_date = '2026-06-04';
  record.contributing_message_ids = ['<a@example.com>', '<b@example.com>'];

  const state = new Map();
  state.set(line_item_key(order, normalized), record);
  saveTrackingState(state);

  const loaded = loadTrackingState();
  const back = loaded.get(line_item_key(order, normalized));
  console.log('Round-trip found record: ' + !!back);
  if (back) {
    console.log(JSON.stringify(back, null, 2));
  }
  const ok = back &&
    back.quantity === 2 &&
    back.current_status === 'Delivered' &&
    back.delivered_date === '2026-06-04' &&
    back.contributing_message_ids.length === 2;
  console.log(ok ? 'PASS: tracking round-trip preserved the record.' : 'FLAG: tracking round-trip mismatch.');
}

/**
 * Logs the per-run summary line.
 *
 * @param {Object} summary Run summary.
 */
function logSweepSummary(summary) {
  console.log('Sweep complete [' + summary.source + (summary.dryRun ? ' / DRY RUN' : '') + ']');
  console.log('  emails scanned: ' + summary.emailsScanned + ' (processed ' + summary.emailsProcessed + ')');
  console.log('  total line items: ' + summary.totalLineItems + ' (new ' + summary.newLineItems + ')');
  console.log('  status advances: ' + summary.statusAdvances);
  console.log('  gated to inventory: ' + summary.gated);
  console.log('  UNKNOWN (unattributed): ' + summary.unknownCount);
}

/**
 * Logs the resulting line items and the fixture assertions from
 * fixture_test_expectations.md.
 *
 * @param {Map} state Tracking state after the fixtures run.
 */
function logFixtureAssertions(state) {
  const rows = Array.from(state.values()).sort(function (a, b) {
    return (a.order_number + '::' + a.item_name_normalized).localeCompare(b.order_number + '::' + b.item_name_normalized);
  });

  console.log('=== Fixture line items ===');
  console.log('order_number | normalized | status | qty | #ids');
  rows.forEach(function (record) {
    console.log(
      record.order_number + ' | ' + record.item_name_normalized + ' | ' + record.current_status +
      ' | ' + record.quantity + ' | ' + (record.contributing_message_ids || []).length
    );
  });

  console.log('=== Assertions ===');

  // Most important assertion: fixtures #1 (Shipped) and #2 (Delivered) are the
  // same SUNLU PETG item and must COLLAPSE into one line item, advanced to
  // Delivered via max-rank, with BOTH message IDs.
  const sunlu = rows.filter(function (record) {
    return /sunlu/.test(record.item_name_normalized) && /petg/.test(record.item_name_normalized);
  });
  if (sunlu.length === 1) {
    const record = sunlu[0];
    console.log('PASS: single SUNLU line item -> order=' + record.order_number +
      ', status=' + record.current_status + ', qty=' + record.quantity +
      ', ids=' + (record.contributing_message_ids || []).length);
    if (record.current_status === 'Delivered' && (record.contributing_message_ids || []).length === 2) {
      console.log('PASS: SUNLU advanced to Delivered with both contributing IDs (max-rank merge works).');
    } else {
      console.log('FLAG: SUNLU status/IDs differ from Delivered + 2 IDs.');
    }
  } else {
    console.log('FLAG: expected exactly 1 SUNLU line item, found ' + sunlu.length + '.');
  }

  // Multi-order summary: each block under its nearest-preceding order, no phantom.
  const multiOrders = ['113-4103435-6198614', '113-3688270-9185012'];
  const multiRows = rows.filter(function (record) { return multiOrders.indexOf(record.order_number) !== -1; });
  console.log('Multi-order summary items found: ' + multiRows.length + ' across ' + multiOrders.join(', '));

  // NeoWire focused-confirmation item.
  const neo = rows.filter(function (record) { return /neowire/.test(record.item_name_normalized); });
  console.log('NeoWire records: ' + neo.length + (neo.length ? ' -> ' + neo.map(function (r) { return r.order_number; }).join(',') : ''));

  const unknownRows = rows.filter(function (record) { return record.order_number === UNKNOWN_ORDER; });
  console.log('UNKNOWN/Unattributed records: ' + unknownRows.length);
}

/**
 * Logs full failure details and emails the active Apps Script user.
 *
 * @param {*} error Uncaught error.
 */
function logAndNotifyFailure(error) {
  const errorDetails = formatErrorForLog(error);
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
 * @return {string} Error detail string.
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
