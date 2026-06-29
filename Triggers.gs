/**
 * Triggers.gs — scheduling for the hourly sweep.
 *
 * Run createHourlyTrigger() once manually from the Apps Script editor AFTER
 * runSweepDryRun() looks correct on real Gmail data.
 */

function createHourlyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('runSweep').timeBased().everyHours(1).create();
  console.log('Created hourly trigger for runSweep().');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runSweep') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
