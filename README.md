# Liftoff

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

All use the password `liftoff-demo-2026`.

| Email | Role | Story |
|---|---|---|
| coordinator@example.com | coordinator | Sees the whole cohort |
| priya@example.com | new hire | On track |
| marcus@example.com | new hire | Behind on pre-work |
| elena@example.com | new hire | Blocked on GitHub access |
| sam@example.com | new hire | Just getting started |

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
5. Visit `https://<instance>.pockethost.io` and sign in as a demo user.

> Before sharing the link widely, change the demo password or delete the demo users in the admin UI.

## What's where

- `pb_migrations/1760600000_liftoff_schema.js`: collections and **access rules** (the security model)
- `pb_migrations/1760600100_liftoff_seed.js`: demo cohort, tasks, users, progress
- `pb_public/`: frontend (built in `PROMPTS.md`)
- `CLAUDE.md`: project context for Claude Code
- `BUILD_LOG.md`: notes on the AI-assisted build, the source of the interview story
