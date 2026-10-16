# Liftoff: prompt sequence for Claude Code

Run these one at a time in VS Code with Claude Code, from the `liftoff` folder. After each one, **run the app, click through it, and commit** before moving on. Small steps make it easy to tell the story ("I worked in slices and checked each one") and easy to roll back.

Have `./pocketbase serve` running in a separate terminal the whole time.

After each prompt, spend 30 seconds adding a line to `BUILD_LOG.md`: what you asked, what it got right, and what you had to correct.

---

## 0. Orient (no code yet)

```
Read CLAUDE.md and both files in pb_migrations/. Don't write any code yet.
Explain back to me, in plain language:
1. the data model and how the collections relate
2. exactly what a new hire can and can't do through the API, rule by rule
3. anything in the rules that looks wrong or risky to you
```

*Why:* you confirm the AI understands the design before it builds on it. Item 3 often surfaces something worth talking about.

## 1. Login and app shell

```
Build the frontend in pb_public/ (index.html, app.js, styles.css) per CLAUDE.md.
For this step only:
- A login screen (email + password) using the PocketBase JS SDK.
- After login, a header with "Liftoff", the user's name and role, and a Sign out button.
- Route by role: coordinators see a placeholder "Cohort dashboard" view, new hires see a placeholder "My checklist" view.
- Stay signed in on reload (pb.authStore).
- Clean, modern look. Light/dark via CSS variables. Works at phone width.
Then tell me how to test it with the demo accounts.
```

## 2. New-hire checklist

```
Replace the "My checklist" placeholder.
- Show the cohort name and start date.
- List the cohort's tasks grouped by week: "Before you arrive" (week 0), "Liftoff week" (week 1), "30-day follow-up" (week 4).
- Each task shows title, description, an owner badge (You / Manager / IT), and its status from progress.
- New hires can check off their own tasks. Checking creates or updates a progress row (status done, completed_at now); unchecking sets it back to not_started.
- Tasks owned by manager or IT are read-only for the new hire, shown with their status.
- A progress bar at the top: X of Y done.
Use expand and filter so this is a small number of requests, not one per task.
```

Test as `priya@example.com` (mostly done) and `sam@example.com` (barely started).

## 3. Coordinator cohort dashboard

```
Replace the "Cohort dashboard" placeholder.
- A cohort picker (dropdown) defaulting to the soonest upcoming cohort.
- KPI tiles: engineers in cohort, % pre-work (week 0) complete, number blocked.
- A roster table: name, team, manager, % complete, and a status chip (On track / Behind / Blocked) using the rules in CLAUDE.md.
- Sort Blocked first, then Behind, then On track.
- Clicking a row opens a side panel with that person's full checklist and any notes on blocked tasks.
- In the side panel the coordinator can update any task's status for that person (this is how IT/manager tasks get marked done).
```

Test as `coordinator@example.com`. Elena should be Blocked, Marcus Behind.

## 4. Security check (this is your best interview moment)

```
Act as a security reviewer. Sign in to the local API (http://127.0.0.1:8090) as
priya@example.com using curl (local password liftoff-demo-2026) and try to:
1. list all users
2. read Marcus's progress
3. mark one of Marcus's tasks done
4. change her own role to coordinator
5. move her own progress row to Marcus
6. create a new user via public sign-up
Show me each command and the response. Then tell me whether any frontend code
relies on hiding things instead of the server rules.
```

*Why:* this shows the server, not the UI, enforces access. If the AI ever suggests "just loosen the rule" in an earlier step, write that down. It's the story.

## 5. Coordinator can add people (optional, if time)

```
Add an "Add new hire" button on the dashboard: a small form (name, email, team, manager,
cohort) that creates a user with role new_hire and a generated temporary password shown
once to the coordinator. Don't change any access rules.
```

## 6. Polish

```
Polish pass:
- Empty states (cohort with no hires, no tasks).
- Loading and error states with friendly messages.
- Check the layout at 375px wide.
- Make sure all user data is written with textContent, not innerHTML.
- Remove dead code and console noise.
Summarize what you changed.
```

## 7. Deploy to PocketHost

Follow the "Deploy" section in README.md. Then:

```
The app is live at https://<instance>.pockethost.io. Walk me through a smoke test
I can run in the browser as each demo user, and list anything that would differ
between local and hosted.
```

---

## When things go sideways

- **"It works for coordinator but new hires get empty lists."** This is usually a rule doing its job. Ask: *"Explain which API rule is filtering this and whether the frontend query is wrong or the rule is."* Don't let it loosen the rule.
- **Weird data after experimenting:** stop the server, delete `pb_data/`, start again. The migrations rebuild everything.
- **Changing the schema:** ask for a *new* migration file. Never edit the two existing ones after they've run.
- **It's going in circles:** `/clear`, then: "Read CLAUDE.md and pb_public/app.js, then fix <specific thing>."
