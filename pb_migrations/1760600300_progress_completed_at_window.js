/// <reference path="../pb_data/types.d.ts" />

// Stop new hires from backdating or future-dating completed_at.
//
// API rules can't set a value server-side (that would need a pb_hooks script, and this
// project has no custom server code), so instead we constrain what a new hire may send:
// completed_at must be omitted, cleared, or within a day of the server's current time.
// The +/- 1 day window tolerates client clock skew. Coordinators can still set any date
// (e.g. to backfill a task someone finished earlier).
//
// Builds on 1760600200_progress_task_ownership.js; the rest of each rule is unchanged.

const IS_COORD = '@request.auth.role = "coordinator"';

const COMPLETED_AT_IS_RECENT =
  `(@request.body.completed_at:isset = false || @request.body.completed_at = ""` +
  ` || (@request.body.completed_at > @yesterday && @request.body.completed_at < @tomorrow))`;

const OWN_CREATE =
  `@request.body.user = @request.auth.id && @request.body.task.cohort = @request.auth.cohort` +
  ` && (@request.body.task.owner_type = "new_hire" || @request.body.status = "blocked")`;
const OWN_UPDATE =
  `user = @request.auth.id && @request.body.user:isset = false && @request.body.task:isset = false` +
  ` && (task.owner_type = "new_hire" || @request.body.status:isset = false || @request.body.status = "blocked")`;

migrate((app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.createRule = `(${OWN_CREATE} && ${COMPLETED_AT_IS_RECENT}) || ${IS_COORD}`;
  progress.updateRule = `(${OWN_UPDATE} && ${COMPLETED_AT_IS_RECENT}) || ${IS_COORD}`;
  app.save(progress);
}, (app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.createRule = `(${OWN_CREATE}) || ${IS_COORD}`;
  progress.updateRule = `(${OWN_UPDATE}) || ${IS_COORD}`;
  app.save(progress);
});
