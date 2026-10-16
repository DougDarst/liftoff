# Liftoff build log

Running notes while building with Claude Code. One or two lines per step is plenty. This becomes the interview story.

**Capture especially:**
- Moments the AI was wrong, overconfident, or took a shortcut, and how you caught it
- Decisions *you* made that the AI didn't (scope cuts, rule choices, data model)
- Time spent per step

---

## Day 1: backend (pre-built starter kit)

- Data model and access rules designed up front, written as PocketBase migrations (schema as code).
- Rules verified with an automated API test acting as each demo user: new hires see only their own data, can't promote themselves, can't edit or reassign others' progress, and there's no public sign-up. All checks passed.
- Design choice: no progress row = "not started," which keeps seed data and writes small.
- Design choice: app-level `coordinator` role kept separate from PocketBase superusers (the admin UI owner).

- Tested the access rules myself with curl as Priya: she sees only her own data, her attempt to make herself coordinator got a 404, and editing her own name worked. The server enforces this, not the UI.



## Day 2: frontend

| Step | What I asked | What it got right | What I corrected | Time |
|---|---|---|---|---|
| 0 Orient | Read CLAUDE.md and the migrations, explain the data model and every new-hire rule, and flag anything risky. No code. | Accurate model and rule-by-rule summary; flagged 10 issues, ranked. Proved each one against a throwaway DB via the API before and after fixing. | Made it go one issue at a time: evaluate, then I choose. Picked docs-only fixes for #8 and #10, won't-fix for #9, and a private deployed password for #1. | |
| 1 Login + shell | Step 1 prompt: login, header with name + role, route by role to placeholders, stay signed in, light/dark, phone width. | All of it on the first pass, plus re-checking the session on reload and a "no role" screen. Used `textContent` for user data. Checked it in headless Chrome (light, dark, 390px) with no console errors. | Nothing. It caught its own false alarm: the "clipped" phone screenshot was a headless-Chrome width limit, not a bug. | |

**Step 0 security review: what changed** (one migration per fix; the applied ones were never edited)
- **#2** New hires could tick off IT and manager tasks, which also cleared their own "Blocked" flag. Now they can only flag those tasks as blocked or add a note. The strict version would have stopped them reporting a blocker at all, so it chose this middle option.
- **#3** New hires could backdate `completed_at`. Rules can't stamp a value and there's no server code, so it now has to be within ±1 day of server time.
- **#4** New hires could edit their own `team` and `manager_name`, which show on the coordinator's roster. Now coordinator-only.
- **#6** Every new hire could see every cohort (future dates and locations). Now only their own.
- **#7** After a cohort move, stale progress rows stayed editable and could flag the person as blocked forever. Progress is now scoped to the current cohort, and CLAUDE.md requires queries to filter by `task.cohort`.
- **#1** The repo is public and the seed password is in it. A stranger could create their own coordinator account and lock out the demo. Fix: a private password on the deployed instance, plus TODO.md and a CLAUDE.md instruction so I don't forget.
- **#8, #9, #10** Documented, not changed: `week` quirks, the rollback reopening sign-up (it doesn't survive a restart), and password resets via the admin UI (a coordinator reset rule would be an account-takeover tool).

**Where the AI was wrong, and how it was caught**
- **#8:** it said a task with no `week` would drop out of the "Behind" count. Testing showed PocketBase stores it as 0, so it actually counts as pre-work. It corrected itself.
- **#7:** testing turned up a side effect it hadn't predicted. The #2 rule was already partly blocking stale rows, because the rule's check on a task respects the tasks collection's own access rule. We made that explicit in the rules.
- **#9:** it first overstated the risk. Testing showed `serve` re-applies every migration on startup, so a rolled-back state can't persist.
- Its first rule test returned a 404 that looked like a pass but had hit the wrong row (an IT task). It noticed and re-ran the test on the right row.
| 2 Checklist | Step 2 prompt: cohort header, tasks grouped by week, owner badges and status, check off own tasks, IT/manager read-only, X-of-Y progress bar, few requests. | All of it in 3 requests per load, progress limited to the current cohort (#7), weeks grouped from the data rather than hard-coded (#8). It applied the review's UI notes without being asked: a "Flag a blocker" action with a note on IT/manager tasks, and clearing `completed_at` on uncheck (#3). Tested by clicking through as Sam in headless Chrome and reading the rows back from the server. | Nothing in the code. Asking "how does a blocker get cleared?" showed a gap: only a coordinator can clear one, and until step 3's side panel exists that means using the admin UI. | |
| 3 Dashboard | Step 3 prompt: cohort picker, KPI tiles, roster with % and status chip sorted Blocked → Behind → On track, side panel to update any task's status. | All of it. 3 requests per cohort, progress limited to that cohort's tasks (#7). The side panel closes the "how do blockers get cleared?" gap from step 2. Keyboard and Esc support, focus returned on close, team/manager columns hidden on phones. Reused the week grouping from step 2 and re-ran step 2's test after the refactor. Tested as the coordinator by clearing Elena's blocker and checking the KPIs (55% → 60%, verified by hand) and the server rows. | Nothing in the code. Asking "what makes someone on track vs behind?" surfaced product gaps in the CLAUDE.md rules: only pre-work counts, IT/manager tasks count against the new hire, the start date is ignored, and Sam ("just getting started") shows as Behind. Kept as-is for the MVP. | |
| 4 Security check | | | | |
| 6 Polish | | | | |

## Day 3: deploy

- Live URL:
- Surprises:

## Story draft (STAR)

- **Situation:** My earlier AI-built tools were frontend-only and read from CSVs: no persistence, no auth, no multi-user data.
- **Task:**
- **Action:**
- **Result:**
- **What I'd do next at Affirm scale:** Postgres, SSO via the identity provider, HRIS sync to create cohorts automatically, Slack nudges, 30/60/90 surveys.
