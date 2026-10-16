# Liftoff

[![tests](https://github.com/DougDarst/liftoff/actions/workflows/tests.yml/badge.svg)](https://github.com/DougDarst/liftoff/actions/workflows/tests.yml)

An MVP for running monthly onboarding cohorts for new software engineers: a coordinator dashboard showing who's ready, and a personal checklist for each new hire. Built with PocketBase (auth, database, API) and a vanilla-JS frontend, hosted on PocketHost.

## Setup on a Mac (about 10 minutes)

1. **Get PocketBase.** Download `pocketbase_0.40.5_darwin_arm64.zip` (Apple Silicon) or `..._darwin_amd64.zip` (Intel) from
   https://github.com/pocketbase/pocketbase/releases/tag/v0.40.5
   and unzip it so the `pocketbase` binary sits in this folder.

2. **Let macOS run it** (it's unsigned):
   ```bash
   cd ~/code/liftoff
   xattr -d com.apple.quarantine pocketbase
   chmod +x pocketbase
   ```

3. **Start it:**
   ```bash
   ./pocketbase serve
   ```
   The migrations run automatically and create the collections, access rules, and demo data.
   The terminal prints a link to create your **superuser** (the admin UI owner). Open it and set one up.

4. **Look around** at http://127.0.0.1:8090/_/ : the `cohorts`, `tasks`, `progress`, and `users` collections, and each collection's **API Rules** tab.

5. **Initialize git:**
   ```bash
   git init && git add . && git commit -m "Liftoff: schema, rules, seed data, build plan"
   ```

6. **Build the frontend** with Claude Code by following `PROMPTS.md`.

## Demo accounts

Locally, all use the password `liftoff-demo-2026`. That password is public (it's in this repo), so it's for **local development only**: the deployed demo uses a different, private password (see Deploy step 5).

| Email | Role | Story |
|---|---|---|
| coordinator@example.com | coordinator | Sees the whole cohort |
| priya@example.com | new hire | On track |
| marcus@example.com | new hire | Behind on pre-work |
| elena@example.com | new hire | Blocked on GitHub access |
| sam@example.com | new hire | Just getting started |

## Tests

```bash
./tests/run.sh
```

- **API rule tests (`tests/api.sh`):** about 70 checks that sign in as each demo user and confirm what the server allows and refuses, including every rule tightened in the security review.
- **UI smoke tests (`tests/ui/`):** headless Chrome drives the real app through login, the new-hire checklist, and the coordinator dashboard, then confirms what reached the server.

Each group runs against a fresh throwaway database, so your local data is never touched. GitHub Actions runs the same script on every push (badge above).

## Deploy to PocketHost

1. Sign up at https://pockethost.io and create an instance (e.g. `liftoff-doug`). Paid instances are $5/month, and there's a 7-day risk-free trial.
2. Open the instance's admin UI (`https://<instance>.pockethost.io/_/`) and create the superuser.
3. Upload this folder's `pb_migrations/` and `pb_public/`. Either way works:
   - **phio CLI** (needs Node 24+):
     ```bash
     npm install -g phio
     phio login
     phio link <instance>
     phio deploy
     ```
     It uploads the `pb_*` folders and skips `pb_data`.
   - **SFTP:** host `ftp.pockethost.io`, port `2222`, username = your PocketHost email, Ed25519 SSH key auth. Drop the folders into your instance's folder.
4. **Restart the instance** from the PocketHost dashboard (power off, then on) so the migrations run.
5. **Replace the public demo password right away.** The seed creates the demo accounts with `liftoff-demo-2026`, which anyone can read in this repo; with it, a stranger could sign in as the coordinator and lock out or deface the demo. In the admin UI, open `users` and set a new password on all five demo accounts. Do this after every fresh deploy or data reset.
6. Run `./tests/check-deploy.sh https://<instance>.pockethost.io`. It's read-only and confirms the public password is rejected, signed-out visitors see nothing, and no test pages were deployed.
7. Visit `https://<instance>.pockethost.io` and sign in as a demo user with the new password.

> Share the deployed password privately with each person you show the demo to, and change it afterward. Never commit it.

## What's where

- `pb_migrations/1760600000_liftoff_schema.js`: collections and the original **access rules** (the security model)
- `pb_migrations/1760600100_liftoff_seed.js`: demo cohort, tasks, users, progress
- `pb_migrations/1760600200_*` onward: rule tightenings from the security review; the latest migration touching a collection holds its current rules (summarized in `CLAUDE.md`)
- `tests/`: API rule tests, UI smoke tests, the deploy check, and `run.sh` to run them
- `.github/workflows/tests.yml`: runs the tests on every push
- `TODO.md`: post-deployment checklist and deferred items
- `pb_public/`: frontend (built in `PROMPTS.md`)
- `CLAUDE.md`: project context for Claude Code
- `BUILD_LOG.md`: notes on the AI-assisted build, the source of the interview story
