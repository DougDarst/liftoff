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

## Day 2: frontend

| Step | What I asked | What it got right | What I corrected | Time |
|---|---|---|---|---|
| 0 Orient | | | | |
| 1 Login + shell | | | | |
| 2 Checklist | | | | |
| 3 Dashboard | | | | |
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
