/// <reference path="../pb_data/types.d.ts" />

// New hires can see only their own cohort; coordinators still see every cohort.
//
// Previously any signed-in user could list every cohort, which exposed the schedule of
// future cohorts (dates, locations) to every new hire. No new-hire feature needs that.
// Other rules compare cohort ids directly, so they don't depend on cohort read access.

const IS_COORD = '@request.auth.role = "coordinator"';
const SIGNED_IN = '@request.auth.id != ""';

migrate((app) => {
  const cohorts = app.findCollectionByNameOrId("cohorts");
  cohorts.listRule = `id = @request.auth.cohort || ${IS_COORD}`;
  cohorts.viewRule = `id = @request.auth.cohort || ${IS_COORD}`;
  app.save(cohorts);
}, (app) => {
  const cohorts = app.findCollectionByNameOrId("cohorts");
  cohorts.listRule = SIGNED_IN;
  cohorts.viewRule = SIGNED_IN;
  app.save(cohorts);
});
