/// <reference path="../pb_data/types.d.ts" />

// Tighten progress rules: a new hire can only complete tasks they own (owner_type = "new_hire").
//
// On IT- and manager-owned tasks a new hire may still:
//   - raise a flag by setting status to "blocked" (e.g. "waiting on GitHub access")
//   - edit the note on their own row
// but they can't mark those tasks done, in progress, or not started, so they can't
// clear a blocked flag or tick off work someone else is responsible for.
// Coordinators keep full access and update IT/manager tasks on the owner's behalf.

const IS_COORD = '@request.auth.role = "coordinator"';

migrate((app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.createRule =
    `(@request.body.user = @request.auth.id && @request.body.task.cohort = @request.auth.cohort` +
    ` && (@request.body.task.owner_type = "new_hire" || @request.body.status = "blocked")) || ${IS_COORD}`;
  progress.updateRule =
    `(user = @request.auth.id && @request.body.user:isset = false && @request.body.task:isset = false` +
    ` && (task.owner_type = "new_hire" || @request.body.status:isset = false || @request.body.status = "blocked")) || ${IS_COORD}`;
  app.save(progress);
}, (app) => {
  const progress = app.findCollectionByNameOrId("progress");
  progress.createRule =
    `(@request.body.user = @request.auth.id && @request.body.task.cohort = @request.auth.cohort) || ${IS_COORD}`;
  progress.updateRule =
    `(user = @request.auth.id && @request.body.user:isset = false && @request.body.task:isset = false) || ${IS_COORD}`;
  app.save(progress);
});
