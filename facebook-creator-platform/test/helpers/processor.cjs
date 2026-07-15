'use strict';

/**
 * Artillery processor — shared helper functions for e2e and load test scenarios.
 *
 * Reference from a test YAML:
 *   config:
 *     processor: '../helpers/processor.cjs'
 *
 * Then call in a flow:
 *   - function: 'setScheduledAt'
 */

/**
 * Sets `context.vars.scheduledAt` to 60 seconds from now (ISO-8601 string).
 *
 * Used by the publish-fanout load test so the EVERY_MINUTE PublishJob can fire
 * within the subsequent 90-second think window.
 *
 * @param {object} context - Artillery virtual-user context; mutate `context.vars`.
 * @param {object} events  - Artillery event emitter (unused here).
 * @param {Function} done  - Callback to signal completion.
 */
function setScheduledAt(context, events, done) {
  const t = new Date(Date.now() + 60 * 1000);
  context.vars.scheduledAt = t.toISOString();
  return done();
}

/**
 * Sets `context.vars.scheduledAt` to the year 2099 (ISO-8601 string).
 *
 * Used by e2e tests that need a valid future date for the `scheduled` transition
 * without actually triggering the PublishJob during the test run.
 *
 * @param {object} context - Artillery virtual-user context.
 * @param {object} events  - Artillery event emitter (unused).
 * @param {Function} done  - Completion callback.
 */
function setFutureScheduledAt(context, events, done) {
  context.vars.scheduledAt = '2099-01-01T00:00:00.000Z';
  return done();
}

module.exports = { setScheduledAt, setFutureScheduledAt };
