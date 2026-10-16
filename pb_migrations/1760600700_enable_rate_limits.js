/// <reference path="../pb_data/types.d.ts" />

// Turn on PocketBase's built-in rate limiting. It ships disabled, which on a public deploy means
// unlimited password guessing against every account, the coordinator's included.
//
// This enables the default rules (per client IP):
//   *:auth       2 requests / 3s    sign-in attempts
//   *:create     20 requests / 5s   record creates
//   /api/batch   3 requests / 1s
//   /api/        300 requests / 10s everything else
//
// Behind a proxy (e.g. PocketHost), PocketBase needs to know which header carries the real client
// IP, or every visitor shares one limit. See the deploy checklist in TODO.md.
// tests/run.sh switches limits off on its throwaway servers after checking they're on.

migrate((app) => {
  const settings = app.settings();
  settings.rateLimits.enabled = true;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.rateLimits.enabled = false;
  app.save(settings);
});
