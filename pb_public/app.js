// Liftoff frontend. Plain JS, no build step.
// Access control lives in the PocketBase API rules; this file only decides what to show.

const pb = new PocketBase(location.origin);

const ROLE_LABELS = {
  coordinator: "Coordinator",
  new_hire: "New hire",
};

const WEEK_LABELS = {
  0: "Before you arrive",
  1: "Liftoff week",
  4: "30-day follow-up",
};

const OWNER_LABELS = {
  new_hire: "You",
  manager: "Manager",
  it: "IT",
};

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const $ = (id) => document.getElementById(id);

// Create an element with an optional class and text. Text always goes in via textContent.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// PocketBase dates look like "2026-11-02 16:00:00.000Z"; Safari needs the "T".
function formatDate(pbDate) {
  const date = new Date(pbDate.replace(" ", "T"));
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ---------- views ----------

function showLogin() {
  $("app-view").hidden = true;
  $("login-view").hidden = false;
  $("login-form").reset();
  hideLoginError();
  $("email").focus();
}

function showApp(user) {
  $("login-view").hidden = true;
  $("app-view").hidden = false;

  $("user-name").textContent = user.name || user.email;
  $("user-role").textContent = ROLE_LABELS[user.role] || "No role";

  $("dashboard-view").hidden = user.role !== "coordinator";
  $("checklist-view").hidden = user.role !== "new_hire";
  $("no-role-view").hidden = user.role in ROLE_LABELS;

  if (user.role === "new_hire") loadChecklist(user);
}

function render() {
  if (pb.authStore.isValid && pb.authStore.record) {
    showApp(pb.authStore.record);
  } else {
    showLogin();
  }
}

// ---------- new-hire checklist ----------

// { user, cohort, tasks, progressByTask: Map<taskId, progressRecord> } for the signed-in new hire.
let checklist = null;

function statusOf(task) {
  const row = checklist.progressByTask.get(task.id);
  return row ? row.status : "not_started";
}

function showChecklistError(message) {
  $("checklist-error").textContent = message;
  $("checklist-error").hidden = false;
}

function hideChecklistError() {
  $("checklist-error").hidden = true;
}

// Three requests total: the cohort, its tasks, and this user's progress on them.
// Progress is scoped to the current cohort (see CLAUDE.md: stale rows from an old cohort don't count).
async function loadChecklist(user) {
  checklist = null;
  hideChecklistError();
  $("checklist-summary").hidden = true;
  $("cohort-line").textContent = "";

  if (!user.cohort) {
    $("checklist-body").replaceChildren(
      el("div", "card placeholder", "You haven't been added to a cohort yet. Your coordinator will set this up."));
    return;
  }

  $("checklist-body").replaceChildren(el("p", "muted", "Loading your checklist…"));
  try {
    const [cohort, tasks, progress] = await Promise.all([
      pb.collection("cohorts").getOne(user.cohort),
      pb.collection("tasks").getFullList({
        filter: pb.filter("cohort = {:cohort}", { cohort: user.cohort }),
        sort: "week,sort",
      }),
      pb.collection("progress").getFullList({
        filter: pb.filter("user = {:user} && task.cohort = {:cohort}", { user: user.id, cohort: user.cohort }),
      }),
    ]);
    checklist = { user, cohort, tasks, progressByTask: new Map(progress.map((row) => [row.task, row])) };
    renderChecklist();
  } catch (err) {
    if (err.isAbort) return; // superseded by a newer load
    console.error("Loading checklist failed:", err);
    $("checklist-body").replaceChildren(
      el("p", "error", "We couldn't load your checklist. Refresh the page to try again."));
  }
}

function renderChecklist() {
  const { cohort, tasks } = checklist;

  $("cohort-line").textContent = `${cohort.name} · Starts ${formatDate(cohort.start_date)}`;
  renderProgressSummary(tasks);

  if (tasks.length === 0) {
    $("checklist-body").replaceChildren(el("div", "card placeholder", "No tasks have been added to your cohort yet."));
    return;
  }

  // Group by whichever weeks exist (tasks arrive sorted by week, then sort).
  const weeks = [...new Set(tasks.map((task) => task.week))];
  const groups = weeks.map((week) => {
    const section = el("section", "week-group");
    section.append(el("h3", "week-title", WEEK_LABELS[week] || `Week ${week}`));
    const list = el("ul", "task-list card");
    for (const task of tasks.filter((t) => t.week === week)) list.append(renderTask(task));
    section.append(list);
    return section;
  });
  $("checklist-body").replaceChildren(...groups);
}

function renderProgressSummary(tasks) {
  const done = tasks.filter((task) => statusOf(task) === "done").length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  $("progress-text").textContent = `${done} of ${tasks.length} done`;
  $("progress-fill").style.width = `${percent}%`;
  $("progress-bar").setAttribute("aria-valuemax", "100");
  $("progress-bar").setAttribute("aria-valuenow", String(percent));
  $("checklist-summary").hidden = false;
}

function renderTask(task) {
  const status = statusOf(task);
  const row = checklist.progressByTask.get(task.id);
  const isMine = task.owner_type === "new_hire";

  const item = el("li", `task status-${status}`);

  // New hires check off their own tasks; IT/manager tasks show a read-only box.
  const checkbox = el("input", "task-check");
  checkbox.type = "checkbox";
  checkbox.id = `task-${task.id}`;
  checkbox.checked = status === "done";
  checkbox.disabled = !isMine;
  if (isMine) checkbox.addEventListener("change", () => toggleTask(task, checkbox));
  item.append(checkbox);

  const body = el("div", "task-body");
  const title = el("label", "task-title", task.title);
  title.htmlFor = checkbox.id;
  body.append(title);
  if (task.description) body.append(el("p", "task-desc", task.description));

  const meta = el("div", "task-meta");
  meta.append(el("span", `owner owner-${task.owner_type}`, OWNER_LABELS[task.owner_type] || task.owner_type));
  meta.append(el("span", `chip chip-${status}`, STATUS_LABELS[status] || status));
  body.append(meta);

  if (status === "blocked" && row && row.note) body.append(el("p", "task-note", row.note));

  // On someone else's task a new hire can only raise a flag (the API rules enforce this too).
  if (!isMine && status !== "done" && status !== "blocked") body.append(renderFlagControl(task));

  item.append(body);
  return item;
}

function renderFlagControl(task) {
  const wrap = el("div", "flag");
  const open = el("button", "link-button", "Flag a blocker");
  open.type = "button";

  const form = el("form", "flag-form");
  form.hidden = true;
  const input = el("input");
  input.type = "text";
  input.maxLength = 500;
  input.placeholder = "What are you waiting on? (optional)";
  input.setAttribute("aria-label", `What's blocking "${task.title}"?`);
  const submit = el("button", "button danger", "Flag as blocked");
  submit.type = "submit";
  const cancel = el("button", "button", "Cancel");
  cancel.type = "button";
  form.append(input, submit, cancel);

  open.addEventListener("click", () => {
    open.hidden = true;
    form.hidden = false;
    input.focus();
  });
  cancel.addEventListener("click", () => {
    form.hidden = true;
    open.hidden = false;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const changes = { status: "blocked" };
    const note = input.value.trim();
    if (note) changes.note = note;
    try {
      await saveProgress(task, changes);
    } catch (err) {
      console.error("Flagging task failed:", err);
      showChecklistError("Couldn't flag that task. Try again.");
      submit.disabled = false;
    }
  });

  wrap.append(open, form);
  return wrap;
}

async function toggleTask(task, checkbox) {
  const checked = checkbox.checked;
  checkbox.disabled = true;
  hideChecklistError();
  try {
    await saveProgress(task, checked
      ? { status: "done", completed_at: new Date().toISOString() }
      : { status: "not_started", completed_at: "" });
  } catch (err) {
    console.error("Saving task failed:", err);
    showChecklistError("Couldn't save that change. Try again.");
    checkbox.checked = !checked;
    checkbox.disabled = false;
  }
}

// No progress row means "not started", so the first change creates the row.
async function saveProgress(task, changes) {
  const existing = checklist.progressByTask.get(task.id);
  const saved = existing
    ? await pb.collection("progress").update(existing.id, changes)
    : await pb.collection("progress").create({ user: checklist.user.id, task: task.id, ...changes });
  checklist.progressByTask.set(task.id, saved);
  renderChecklist();
}

// ---------- login ----------

function showLoginError(message) {
  $("login-error").textContent = message;
  $("login-error").hidden = false;
}

function hideLoginError() {
  $("login-error").hidden = true;
  $("login-error").textContent = "";
}

function setLoginBusy(busy) {
  $("login-button").disabled = busy;
  $("login-button").textContent = busy ? "Signing in…" : "Sign in";
}

async function handleLogin(event) {
  event.preventDefault();
  hideLoginError();

  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) {
    showLoginError("Enter your email and password.");
    return;
  }

  setLoginBusy(true);
  try {
    await pb.collection("users").authWithPassword(email, password);
    render();
  } catch (err) {
    console.error("Login failed:", err);
    showLoginError(err.status === 400
      ? "That email and password don't match. Try again."
      : "Couldn't reach the server. Check your connection and try again.");
  } finally {
    setLoginBusy(false);
  }
}

function handleSignOut() {
  pb.authStore.clear();
  checklist = null;
  render();
}

// ---------- start ----------

// On reload, re-fetch the user so a role or name change made by a coordinator shows up,
// and drop the session if the account was deleted or the token is no longer accepted.
async function refreshSession() {
  if (!pb.authStore.isValid) return;
  try {
    await pb.collection("users").authRefresh();
  } catch (err) {
    console.error("Session refresh failed:", err);
    if (err.status === 401 || err.status === 403 || err.status === 404) {
      pb.authStore.clear();
    }
  }
}

async function start() {
  $("login-form").addEventListener("submit", handleLogin);
  $("signout-button").addEventListener("click", handleSignOut);
  await refreshSession();
  render();
}

start();
