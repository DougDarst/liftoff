# TODO

## Every time you deploy or reset the PocketHost instance

The seed creates the demo accounts with the public password `liftoff-demo-2026`. Until you change it, anyone who has read this repo can sign in as the coordinator and lock out or deface the demo.

- [ ] Restart the instance (power off, then on) so all migrations run
- [ ] In the admin UI (`https://<instance>.pockethost.io/_/`), set a new private password on all five demo accounts in `users`
- [ ] In the admin UI, open **Settings → Application → Trusted proxy** (first deploy only). Rate limiting is on (migration `1760600700`), but behind PocketHost's proxy PocketBase may see every visitor as the same IP, so everyone would share one sign-in limit. If the admin UI shows a proxy warning, set the header it suggests (usually `X-Forwarded-For` or `X-Real-IP`). Not yet confirmed for PocketHost.
- [ ] Run `./tests/check-deploy.sh https://<instance>.pockethost.io` and confirm it passes (it checks the old password fails for all five accounts, sign-ins are throttled, signed-out visitors see nothing, and no test pages were deployed)
- [ ] Sign in as `coordinator@example.com` with the new password and check the roster: Elena blocked, Marcus and Sam behind, Priya on track
- [ ] Store the new password in your password manager, never in this repo

## After each person you show the demo to

- [ ] Change the demo passwords again
- [ ] Check the demo still looks right (nothing renamed, no extra coordinator accounts)

## Deferred from the security review

- [x] **#5, while building the frontend:** render all user-entered text (`note`, `name`, `team`, `manager_name`, task titles) with `textContent`, never `innerHTML` (confirmed in the code review: no `innerHTML` anywhere in the app)
- [ ] **Next step, not MVP:** password resets by coordinators (scoped to new hires) or self-service by email. See the trade-off in `CLAUDE.md`. Only after the deployed password is private.
- [ ] **Optional:** replace the demo passwords automatically from a `LIFTOFF_DEMO_PASSWORD` environment variable on deploy, if PocketHost supports env vars (unconfirmed)
