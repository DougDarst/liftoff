# Liftoff

Liftoff is an MVP for running monthly onboarding cohorts for newly hired software engineers. A program coordinator sees every new hire's readiness at a glance; each new hire signs in and works through their own checklist.

This is a portfolio/demo project. Keep it small, readable, and working. Favor plain code over cleverness.

## Stack

- **Backend:** PocketBase v0.40.x (single Go binary: SQLite + auth + REST API + admin UI). No custom server code.
- **Frontend:** static HTML/CSS/vanilla JS in `pb_public/`, served by PocketBase at `/`.
- **SDK:** PocketBase JS SDK from CDN: `https://cdn.jsdelivr.net/npm/pocketbase@0.28.1/dist/pocketbase.umd.js`. Create the client with `new PocketBase(location.origin)` so the same code works locally and on PocketHost.
- **No build step.** No npm, no bundler, no framework. One `index.html`, one `app.js`, one `styles.css` is the target.
- **Hosting:** PocketHost (`<instance>.pockethost.io`).

## Layout

```
pb_migrations/   schema + access rules (1760600000_liftoff_schema.js), demo data (1760600100_liftoff_seed.js)
pb_public/       the frontend (served at /)
pb_data/         local database. Never commit, never hand-edit. (gitignored)
BUILD_LOG.md     running notes on the AI-assisted build. Append to it when asked.
```

## Data model

| Collection | Fields | Notes |
|---|---|---|
| `users` (auth) | name, email, `role` (`coordinator` \| `new_hire`), `cohort` → cohorts, team, manager_name | Built-in auth collection with added fields |
| `cohorts` | name, start_date, location | |
| `tasks` | `cohort` → cohorts, title, description, `week` (0 = pre-work, 1 = Liftoff week, 4 = 30-day), `owner_type` (`new_hire` \| `manager` \| `it`), sort | The checklist template for a cohort |
| `progress` | `user` → users, `task` → tasks, `status` (`not_started` \| `in_progress` \| `done` \| `blocked`), completed_at, note | One row per (user, task), unique index. **No row = not started.** |

A new hire's completion % = their `done` progress rows ÷ number of tasks in their cohort.

Status rules for the coordinator roster:
- **Blocked:** any progress row with status `blocked`
- **Behind:** fewer than half of week-0 tasks done
- **On track:** everything else

## Access rules (the important part)

Security is enforced by **PocketBase API rules on the server**, not by hiding things in the UI. Rules live in `pb_migrations/1760600000_liftoff_schema.js`.

- New hires can read only **their own** user record and progress rows, and only their own cohort's tasks.
- New hires can create/update progress **only for themselves**, and can't change `user` or `task` on an existing row.
- New hires can't change their own `role` or `cohort`.
- Only coordinators can create users, cohorts, and tasks. There is no public sign-up.

**Never loosen a rule to make a UI feature work.** If a feature seems to need broader access, stop and explain the trade-off instead. Any change to rules goes in a **new** migration file, never by editing an applied one.

The UI may hide coordinator screens from new hires for convenience, but assume a new hire can call the API directly.

## Running locally

```bash
./pocketbase serve        # http://127.0.0.1:8090  (admin UI at /_/)
```

Migrations run automatically on start. To reset the demo data: stop the server, delete `pb_data/`, start again.

Demo accounts (password `liftoff-demo-2026`):
- `coordinator@example.com`: coordinator (Doug Darst)
- `priya@example.com`: on track
- `marcus@example.com`: behind
- `elena@example.com`: blocked (waiting on GitHub access)
- `sam@example.com`: just getting started

## Conventions

- Vanilla JS, ES modules not required. Keep functions small and named for what they do.
- Use `pb.authStore` for session state; show the login screen when `!pb.authStore.isValid`.
- Use `expand` (e.g. `expand: "task"`) and `filter` in SDK calls instead of N+1 fetches.
- Escape any user-provided text before inserting into the DOM (use `textContent`, not `innerHTML`, for data).
- Responsive down to phone width. Light and dark mode via CSS variables.
- Show friendly error messages; log details to the console.

## Out of scope for the MVP

Email notifications, Slack integration, SSO, HRIS sync, file uploads, multiple languages, analytics beyond the roster. Mention these as "next steps"; don't build them.
