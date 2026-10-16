/// <reference path="../pb_data/types.d.ts" />

// Demo data so the app has something to show on first run.
// Every demo account uses the same password: DEMO_PASSWORD below.
// Change it (or delete the demo users) before you share the URL widely.

const DEMO_PASSWORD = "liftoff-demo-2026";

migrate((app) => {
  const cohortsCol = app.findCollectionByNameOrId("cohorts");
  const tasksCol = app.findCollectionByNameOrId("tasks");
  const usersCol = app.findCollectionByNameOrId("users");
  const progressCol = app.findCollectionByNameOrId("progress");

  // ---- cohorts ----
  const mkCohort = (name, start, location) => {
    const r = new Record(cohortsCol);
    r.set("name", name);
    r.set("start_date", start);
    r.set("location", location);
    app.save(r);
    return r;
  };
  const nov = mkCohort("November 2026 cohort", "2026-11-02 16:00:00.000Z", "San Francisco");
  mkCohort("December 2026 cohort", "2026-12-07 16:00:00.000Z", "San Francisco");

  // ---- tasks (November checklist) ----
  const taskDefs = [
    // week, owner_type, title, description
    [0, "it",       "Laptop shipped and set up",              "IT ships the laptop; new hire confirms it boots and enrolls in device management."],
    [0, "it",       "SSO and GitHub access verified",         "Identity account active, MFA enrolled, added to the GitHub org and team."],
    [0, "new_hire", "Read the engineering handbook",          "Skim the handbook: how we ship, on-call basics, where to ask questions."],
    [0, "new_hire", "Complete security awareness training",   "Required before production access is granted."],
    [0, "manager",  "Assign an onboarding buddy",             "Pick a teammate to pair with the new hire for the first 30 days."],
    [1, "new_hire", "Dev environment lab: run the app locally","Clone, build, and run the main service with the lab instructor."],
    [1, "new_hire", "Open your first PR (guided)",            "Small, real change; reviewed and merged by end of Wednesday."],
    [1, "new_hire", "Code review norms session",              "How we review: what to look for, tone, turnaround expectations."],
    [1, "new_hire", "AI-assisted development session",        "Using AI coding tools safely and effectively in our codebase."],
    [1, "new_hire", "Friday demo + week feedback survey",     "Demo what you shipped; 10-minute survey on the week."],
    [4, "manager",  "30-day check-in",                        "Manager and new hire review goals, blockers, and buddy feedback."],
  ];
  const tasks = taskDefs.map(([week, owner, title, desc], i) => {
    const r = new Record(tasksCol);
    r.set("cohort", nov.id);
    r.set("week", week);
    r.set("owner_type", owner);
    r.set("title", title);
    r.set("description", desc);
    r.set("sort", i + 1);
    app.save(r);
    return r;
  });

  // ---- users ----
  const mkUser = (email, name, role, opts = {}) => {
    const r = new Record(usersCol);
    r.set("email", email);
    r.set("name", name);
    r.set("role", role);
    r.set("verified", true);
    r.set("emailVisibility", true);
    if (opts.cohort) r.set("cohort", opts.cohort);
    if (opts.team) r.set("team", opts.team);
    if (opts.manager) r.set("manager_name", opts.manager);
    r.setPassword(DEMO_PASSWORD);
    app.save(r);
    return r;
  };

  mkUser("coordinator@example.com", "Doug Darst", "coordinator");
  const priya  = mkUser("priya@example.com",  "Priya Shah",  "new_hire", { cohort: nov.id, team: "Checkout",  manager: "Jordan Kim" });
  const marcus = mkUser("marcus@example.com", "Marcus Lee",  "new_hire", { cohort: nov.id, team: "Risk",      manager: "Alex Rivera" });
  const elena  = mkUser("elena@example.com",  "Elena Ruiz",  "new_hire", { cohort: nov.id, team: "Platform",  manager: "Sam Patel" });
  const sam    = mkUser("sam@example.com",    "Sam Okafor",  "new_hire", { cohort: nov.id, team: "Merchant",  manager: "Jordan Kim" });

  // ---- progress: give the dashboard some variety ----
  // indexes into tasks[] -> status
  const seed = [
    [priya,  { 0: "done", 1: "done", 2: "done", 3: "done", 4: "done" }],              // on track
    [marcus, { 0: "done", 1: "done", 2: "in_progress" }],                              // behind
    [elena,  { 0: "done", 1: "blocked", 2: "done", 3: "done" }],                       // blocked on access
    [sam,    { 0: "done" }],                                                           // just getting started
  ];
  const now = new Date().toISOString().replace("T", " ");
  for (const [user, statuses] of seed) {
    for (const [idx, status] of Object.entries(statuses)) {
      const r = new Record(progressCol);
      r.set("user", user.id);
      r.set("task", tasks[Number(idx)].id);
      r.set("status", status);
      if (status === "done") r.set("completed_at", now);
      if (status === "blocked") r.set("note", "Still waiting on GitHub org invite");
      app.save(r);
    }
  }
}, (app) => {
  // Down: remove demo data (cascade handles tasks/progress when cohorts/users go).
  for (const email of ["coordinator@example.com", "priya@example.com", "marcus@example.com", "elena@example.com", "sam@example.com"]) {
    try { app.delete(app.findAuthRecordByEmail("users", email)); } catch (_) {}
  }
  for (const r of app.findAllRecords("cohorts")) app.delete(r);
});
