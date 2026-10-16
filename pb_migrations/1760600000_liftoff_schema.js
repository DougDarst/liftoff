/// <reference path="../pb_data/types.d.ts" />

// Liftoff schema: cohorts, tasks, progress, plus two fields on the built-in users collection.
//
// Roles (app-level, stored on users.role):
//   coordinator - runs the program; sees every cohort and every new hire
//   new_hire    - sees only their own cohort's tasks and their own progress
//
// (PocketBase "superusers" are separate: they own the admin UI at /_/ and bypass all rules.)
//
// The access rules below are the point of the exercise: they're enforced by the server,
// so a new hire calling the API directly can't read or change anyone else's data.

const IS_COORD = '@request.auth.role = "coordinator"';
const SIGNED_IN = '@request.auth.id != ""';

migrate((app) => {
  // ---------- cohorts ----------
  const cohorts = new Collection({
    type: "base",
    name: "cohorts",
    listRule: SIGNED_IN,
    viewRule: SIGNED_IN,
    createRule: IS_COORD,
    updateRule: IS_COORD,
    deleteRule: IS_COORD,
    fields: [
      { type: "text", name: "name", required: true, max: 100 },
      { type: "date", name: "start_date", required: true },
      { type: "text", name: "location", max: 100 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(cohorts);

  // ---------- users: add role + cohort ----------
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new SelectField({
    name: "role",
    required: true,
    maxSelect: 1,
    values: ["coordinator", "new_hire"],
  }));
  users.fields.add(new RelationField({
    name: "cohort",
    collectionId: cohorts.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  users.fields.add(new TextField({ name: "team", max: 100 }));
  users.fields.add(new TextField({ name: "manager_name", max: 100 }));

  // Users can see themselves; coordinators can see everyone.
  users.listRule = `id = @request.auth.id || ${IS_COORD}`;
  users.viewRule = `id = @request.auth.id || ${IS_COORD}`;
  // No public sign-up: only coordinators add people.
  users.createRule = IS_COORD;
  // A new hire may edit their own profile but NOT promote themselves or switch cohorts.
  users.updateRule =
    `(id = @request.auth.id && @request.body.role:isset = false && @request.body.cohort:isset = false) || ${IS_COORD}`;
  users.deleteRule = IS_COORD;
  app.save(users);

  // ---------- tasks (the checklist template for a cohort) ----------
  const tasks = new Collection({
    type: "base",
    name: "tasks",
    // New hires see only their own cohort's tasks.
    listRule: `cohort = @request.auth.cohort || ${IS_COORD}`,
    viewRule: `cohort = @request.auth.cohort || ${IS_COORD}`,
    createRule: IS_COORD,
    updateRule: IS_COORD,
    deleteRule: IS_COORD,
    fields: [
      { type: "relation", name: "cohort", required: true, collectionId: cohorts.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "title", required: true, max: 200 },
      { type: "text", name: "description", max: 1000 },
      // 0 = pre-work before arrival, 1 = Liftoff week, 2+ = follow-up weeks
      { type: "number", name: "week", required: false, min: 0, max: 13, onlyInt: true },
      { type: "select", name: "owner_type", required: true, maxSelect: 1, values: ["new_hire", "manager", "it"] },
      { type: "number", name: "sort", onlyInt: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(tasks);

  // ---------- progress (one row per new hire per task they've touched) ----------
  const progress = new Collection({
    type: "base",
    name: "progress",
    listRule: `user = @request.auth.id || ${IS_COORD}`,
    viewRule: `user = @request.auth.id || ${IS_COORD}`,
    // A new hire can only create progress for themselves, on a task in their own cohort.
    createRule:
      `(@request.body.user = @request.auth.id && @request.body.task.cohort = @request.auth.cohort) || ${IS_COORD}`,
    // ...and can only update their own rows, without reassigning them.
    updateRule:
      `(user = @request.auth.id && @request.body.user:isset = false && @request.body.task:isset = false) || ${IS_COORD}`,
    deleteRule: IS_COORD,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "task", required: true, collectionId: tasks.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["not_started", "in_progress", "done", "blocked"] },
      { type: "date", name: "completed_at" },
      { type: "text", name: "note", max: 500 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    // One progress row per (user, task).
    indexes: ["CREATE UNIQUE INDEX idx_progress_user_task ON progress (user, task)"],
  });
  app.save(progress);
}, (app) => {
  for (const name of ["progress", "tasks"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
  const users = app.findCollectionByNameOrId("users");
  for (const f of ["role", "cohort", "team", "manager_name"]) users.fields.removeByName(f);
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
  app.delete(app.findCollectionByNameOrId("cohorts"));
});
