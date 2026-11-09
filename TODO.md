# TODO

## Every time you do a fresh deploy or reset the data

The seed creates the demo accounts with the public password `liftoff-demo-2026`. Until you change it, anyone who has read this repo can sign in as the coordinator and lock out or deface the demo.

- [ ] Restart the service (`sudo systemctl restart liftoff`) so all migrations run
- [ ] In the admin UI (`https://liftoff.example.com/_/`), set a new private password on all five demo accounts in `users`
- [ ] In the admin UI, open **Settings → Application → IP proxy headers**. Without this, every visitor appears as `127.0.0.1` and shares one sign-in limit. Set **Trusted IP proxy headers** to `X-Forwarded-For`, leave **IP priority** on "Use rightmost IP", save, and check **Resolved user IP** now shows your real IP. Safe only because PocketBase listens on `127.0.0.1` and Caddy replaces any visitor-sent `X-Forwarded-For` with the real IP. (On PocketHost, behind Cloudflare, this was `CF-Connecting-IP` instead.)
- [ ] Same screen: set **Application URL** to `https://liftoff.example.com` (it defaults to `http://localhost:8090`; PocketBase uses it to build links).
- [ ] Run `./tests/check-deploy.sh https://liftoff.example.com` and confirm it passes (it checks the old password fails for all five accounts, sign-ins are throttled, signed-out visitors see nothing, and no test pages were deployed)
- [ ] Confirm a faked `X-Forwarded-For` can't dodge the sign-in limit (README, "After the first deploy" step 4): expect `400 400 429 429`
- [ ] Sign in as `coordinator@example.com` with the new password and check the roster: Elena blocked, Marcus and Sam behind, Priya on track
- [ ] Store the new password in your password manager, never in this repo

## After each person you show the demo to

- [ ] Change the demo passwords again
- [ ] Check the demo still looks right (nothing renamed, no extra coordinator accounts)

## Deferred from the security review

- [x] **#5, while building the frontend:** render all user-entered text (`note`, `name`, `team`, `manager_name`, task titles) with `textContent`, never `innerHTML` (confirmed in the code review: no `innerHTML` anywhere in the app)
- [ ] **Next step, not MVP:** password resets by coordinators (scoped to new hires) or self-service by email. See the trade-off in `CLAUDE.md`. Only after the deployed password is private.
- [ ] **Optional:** replace the demo passwords automatically from a `LIFTOFF_DEMO_PASSWORD` environment variable on deploy (for example, an `Environment=` line in the systemd service)
