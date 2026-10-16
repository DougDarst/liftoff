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

A new hire's completion % = their `done` progress rows for tasks in their **current** cohort ÷ number of tasks in that cohort.

Status rules for the coordinator roster (all counted only over tasks in the new hire's current cohort):
- **Blocked:** any progress row with status `blocked`
- **Behind:** fewer than half of week-0 tasks done
- **On track:** everything else

## Access rules (the important part)

Security is enforced by **PocketBase API rules on the server**, not by hiding things in the UI. Rules were created in `pb_migrations/1760600000_liftoff_schema.js` and tightened by later migrations (`1760600200` onward); the **latest migration touching a collection** holds its current rules.

Coordinators can read and write everything. New hires:

- **users:** can read only their own record. Can update only their own `name` (and built-in profile fields); `role`, `cohort`, `team`, and `manager_name` are coordinator-only.
- **cohorts:** can read only their own cohort.
- **tasks:** can read only their own cohort's tasks.
- **progress:** can read and update only their own rows for tasks in their **current** cohort, and create rows only for themselves on those tasks. Can't change `user` or `task` on an existing row.
  - On `new_hire`-owned tasks: any status.
  - On `it`/`manager`-owned tasks: may only set status to `blocked` or edit the note (they can flag a problem, but can't complete the task or clear the flag).
  - `completed_at`, if sent, must be empty or within ±1 day of server time (no backdating).
- Only coordinators can create users, cohorts, and tasks, or delete anything. There is no public sign-up.

UI consequences: show IT/manager tasks to new hires as read-only with a "flag as blocked" action; send `completed_at` (now) when marking done and `""` when un-marking; profile edits must send only `name`, never the whole record.

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
- Always scope progress queries to the new hire's current cohort (filter `task.cohort = "<their cohort id>"`), on both the checklist and the roster. A new hire who moved cohorts keeps their old progress rows; coordinators can still read them, and they must not count toward completion % or Blocked/Behind.
- Escape any user-provided text before inserting into the DOM (use `textContent`, not `innerHTML`, for data).
- Responsive down to phone width. Light and dark mode via CSS variables.
- Show friendly error messages; log details to the console.

## Out of scope for the MVP

Email notifications, Slack integration, SSO, HRIS sync, file uploads, multiple languages, analytics beyond the roster. Mention these as "next steps"; don't build them.
