# Liftoff

[![tests](https://github.com/DougDarst/liftoff/actions/workflows/tests.yml/badge.svg)](https://github.com/DougDarst/liftoff/actions/workflows/tests.yml)

An MVP for running monthly onboarding cohorts for new software engineers: a coordinator dashboard showing who's ready, and a personal checklist for each new hire. Built with PocketBase (auth, database, API) and a vanilla-JS frontend, self-hosted on a small Linux server.

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

Locally, all use the password `liftoff-demo-2026`. That password is public (it's in this repo), so it's for **local development only**: the deployed demo uses a different, private password (see "After the first deploy" below).

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

## Deploy (self-hosted)

Liftoff is a single PocketBase process that serves both the API and the frontend, so any Linux server that can run one binary will do. These steps self-host it on an Ubuntu server with [Caddy](https://caddyserver.com) in front for automatic HTTPS. Deployment is manual.

In the commands below, replace `you@your-server` with your SSH login and `liftoff.example.com` with your domain. Example config files are in [`deploy/`](deploy/).

### One-time server setup

1. Point a DNS A record for `liftoff.example.com` at the server, and allow ports 80 and 443 (plus SSH) through the firewall.
2. [Install Caddy](https://caddyserver.com/docs/install).
3. Download the Linux build of PocketBase into `/opt/liftoff` (the same version as above; use `arm64` instead of `amd64` on an ARM server):
   ```bash
   sudo mkdir -p /opt/liftoff && sudo chown "$USER": /opt/liftoff
   cd /opt/liftoff
   curl -fsSLO https://github.com/pocketbase/pocketbase/releases/download/v0.40.5/pocketbase_0.40.5_linux_amd64.zip
   unzip pocketbase_0.40.5_linux_amd64.zip pocketbase && rm pocketbase_0.40.5_linux_amd64.zip
   ```
4. **Install the service:** copy [`deploy/liftoff.service`](deploy/liftoff.service) to `/etc/systemd/system/liftoff.service`, set `User` and `Group` to the account that owns `/opt/liftoff`, then:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable liftoff
   ```
   PocketBase listens on `127.0.0.1` only, so it can be reached **only through Caddy**. Keep it that way: the proxy-header setting below depends on it.
5. Add the block from [`deploy/Caddyfile.example`](deploy/Caddyfile.example) to `/etc/caddy/Caddyfile` and run `sudo systemctl reload caddy`.
6. **Create the superuser** before the first start (a leading space keeps the password out of your shell history on most setups):
   ```bash
    /opt/liftoff/pocketbase superuser upsert you@example.com 'a-strong-password' --dir=/opt/liftoff/pb_data
   ```

### Deploying (first time and every update)

From this folder on your machine:

```bash
rsync -avz --delete pb_public pb_migrations you@your-server:/opt/liftoff/
ssh -t you@your-server sudo systemctl restart liftoff
```

- The restart runs any new migrations. Changes to `pb_public/` alone go live immediately, no restart needed.
- Only `pb_public/` and `pb_migrations/` are sent. **Never upload `pb_data/`**: the server holds the live data. The test pages in `tests/` stay local.
- **Caching:** browsers (and any CDN you put in front) can cache `styles.css` and `app.js`. That's why `index.html` loads them as `?v=<content hash>`: always deploy `index.html` along with any changed CSS/JS, and keep the versions current with `./tests/asset-versions.sh --fix` (the tests enforce it).

### After the first deploy (and any data reset)

1. **Replace the public demo password right away.** The seed creates the demo accounts with `liftoff-demo-2026`, which anyone can read in this repo; with it, a stranger could sign in as the coordinator and lock out or deface the demo. In the admin UI (`https://liftoff.example.com/_/`), open `users`, and for each of the five demo accounts switch on **change password**, enter the new one twice, and save.
2. **Settings → Application:**
   - Set **Application URL** to `https://liftoff.example.com` (it defaults to `http://localhost:8090`; PocketBase uses it to build links).
   - Under **IP proxy headers**, set **Trusted IP proxy headers** to `X-Forwarded-For`, leave **IP priority** on "Use rightmost IP", save, and check that **Resolved user IP** shows your real IP. Without this, PocketBase sees every visitor as `127.0.0.1` and the whole internet shares one sign-in limit.
   - This is safe here because PocketBase is reachable only through Caddy, and Caddy replaces any `X-Forwarded-For` a visitor sends with the visitor's real IP. If you add another proxy or CDN in front (for example, Cloudflare's proxy), revisit this setting.
3. Run `./tests/check-deploy.sh https://liftoff.example.com`. It's read-only and confirms the public password is rejected, sign-ins are throttled, signed-out visitors see nothing, visitors get the current CSS/JS, and no test pages were deployed.
4. **Confirm a faked header can't dodge the rate limit.** Four wrong sign-ins, each claiming a different IP:
   ```bash
   for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" -X POST \
     -H "Content-Type: application/json" -H "X-Forwarded-For: 10.0.0.$i" \
     -d '{"identity":"nobody@example.com","password":"wrong"}' \
     https://liftoff.example.com/api/collections/users/auth-with-password; done
   ```
   Expect `400 400 429 429` (the limit is 2 sign-ins per 3 seconds). Four `400`s means the faked header worked: recheck step 2. All `429`s just means an earlier check's throttle hadn't reset; wait a few seconds and rerun.
5. Visit `https://liftoff.example.com` and sign in as a demo user with the new password.

> Share the deployed password privately with each person you show the demo to, and change it afterward. Never commit it.

## What's where

- `pb_migrations/1760600000_liftoff_schema.js`: collections and the original **access rules** (the security model)
- `pb_migrations/1760600100_liftoff_seed.js`: demo cohort, tasks, users, progress
- `pb_migrations/1760600200_*` onward: rule tightenings from the security review; the latest migration touching a collection holds its current rules (summarized in `CLAUDE.md`)
- `tests/`: API rule tests, UI smoke tests, the deploy check, and `run.sh` to run them
- `.github/workflows/tests.yml`: runs the tests on every push
- `docs/security-demo.md` + `tests/security-demo.sh`: a 5-minute live demo that the server, not the UI, enforces access
- `TODO.md`: post-deployment checklist and deferred items
- `deploy/`: example systemd service and Caddy config for self-hosting
- `pb_public/`: frontend (built in `PROMPTS.md`)
- `CLAUDE.md`: project context for Claude Code
- `BUILD_LOG.md`: notes on the AI-assisted build, the source of the interview story
