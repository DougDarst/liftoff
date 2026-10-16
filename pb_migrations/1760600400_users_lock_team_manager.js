/// <reference path="../pb_data/types.d.ts" />

// Stop new hires from editing their own team and manager_name.
//
// Both fields show up on the coordinator's roster, so they're program data the coordinator
// owns, not profile preferences. A new hire can still edit their own name (e.g. a preferred
// name), but role, cohort, team, and manager_name are coordinator-only.

const IS_COORD = '@request.auth.role = "coordinator"';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.updateRule =
    `(id = @request.auth.id && @request.body.role:isset = false && @request.body.cohort:isset = false` +
    ` && @request.body.team:isset = false && @request.body.manager_name:isset = false) || ${IS_COORD}`;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.updateRule =
    `(id = @request.auth.id && @request.body.role:isset = false && @request.body.cohort:isset = false) || ${IS_COORD}`;
  app.save(users);
});
