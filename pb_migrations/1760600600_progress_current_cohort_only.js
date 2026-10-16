/// <reference path="../pb_data/types.d.ts" />

// New hires can see and update progress only for tasks in their CURRENT cohort.
//
// If a coordinator moves a new hire to another cohort, their old progress rows stay (useful
// history for the coordinator). Before this, the new hire could still list those stale rows,
// edit their notes, and set them to "blocked", which would wrongly flag them on the roster.
// Create already required a task in the new hire's own cohort; list/view/update now match.
// Coordinators still see and edit every row.
//
// Builds on 1760600300_progress_completed_at_window.js; the rest of each rule is unchanged.

const IS_COORD = '@request.auth.role = "coordinator"';

const COMPLETED_AT_IS_RECENT =
  `(@request.body.completed_at:isset = false || @request.body.completed_at = ""` +
  ` || (@request.body.completed_at > @yesterday && @request.body.completed_at < @tomorrow))`;

const OWN_ROW = `user = @request.auth.id`;
const OWN_CURRENT_ROW = `user = @request.auth.id && task.cohort = @request.auth.cohort`;
const UPDATE_CHECKS =
  `@request.body.user:isset = false && @request.body.task:isset = false` +
  ` && (task.owner_type = "new_hire" || @request.body.status:isset = false || @request.body.status = "blocked")`;

migrate((app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.listRule = `(${OWN_CURRENT_ROW}) || ${IS_COORD}`;
  progress.viewRule = `(${OWN_CURRENT_ROW}) || ${IS_COORD}`;
  progress.updateRule = `(${OWN_CURRENT_ROW} && ${UPDATE_CHECKS} && ${COMPLETED_AT_IS_RECENT}) || ${IS_COORD}`;
  app.save(progress);
}, (app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.listRule = `${OWN_ROW} || ${IS_COORD}`;
  progress.viewRule = `${OWN_ROW} || ${IS_COORD}`;
  progress.updateRule = `(${OWN_ROW} && ${UPDATE_CHECKS} && ${COMPLETED_AT_IS_RECENT}) || ${IS_COORD}`;
  app.save(progress);
});
