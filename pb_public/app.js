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
  if (user.role === "coordinator") loadDashboard();
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

  $("checklist-body").replaceChildren(...renderWeekGroups(tasks, renderTask));
}

// Group tasks by whichever weeks exist (tasks arrive sorted by week, then sort).
// Shared by the new-hire checklist and the coordinator's side panel.
function renderWeekGroups(tasks, renderItem) {
  const weeks = [...new Set(tasks.map((task) => task.week))];
  return weeks.map((week) => {
    const section = el("section", "week-group");
    section.append(el("h3", "week-title", WEEK_LABELS[week] || `Week ${week}`));
    const list = el("ul", "task-list card");
    for (const task of tasks.filter((t) => t.week === week)) list.append(renderItem(task));
    section.append(list);
    return section;
  });
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

// ---------- coordinator dashboard ----------

const ROSTER_STATUS = {
  blocked: { label: "Blocked", order: 0 },
  behind: { label: "Behind", order: 1 },
  on_track: { label: "On track", order: 2 },
};

// { cohorts, cohort, hires, tasks, progress: Map<userId, Map<taskId, row>>, openHireId }
let dashboard = null;

function showDashboardError(message) {
  $("dashboard-error").textContent = message;
  $("dashboard-error").hidden = false;
}

function hideDashboardError() {
  $("dashboard-error").hidden = true;
}

// Soonest cohort starting today or later; if none, the most recent one.
function defaultCohort(cohorts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const starts = (c) => new Date(c.start_date.replace(" ", "T"));
  const upcoming = cohorts.filter((c) => starts(c) >= today);
  return upcoming[0] || cohorts[cohorts.length - 1];
}

async function loadDashboard() {
  dashboard = null;
  hideDashboardError();
  $("dashboard-body").hidden = true;
  try {
    const cohorts = await pb.collection("cohorts").getFullList({ sort: "start_date" });
    if (cohorts.length === 0) {
      $("dash-cohort-line").textContent = "No cohorts yet. Create one in the admin UI.";
      $("cohort-picker").replaceChildren();
      return;
    }
    const picker = $("cohort-picker");
    picker.replaceChildren(...cohorts.map((c) => {
      const option = el("option", "", c.name);
      option.value = c.id;
      return option;
    }));
    picker.value = defaultCohort(cohorts).id;
    dashboard = { cohorts };
    await loadCohort(picker.value);
  } catch (err) {
    if (err.isAbort) return;
    console.error("Loading cohorts failed:", err);
    showDashboardError("We couldn't load the dashboard. Refresh the page to try again.");
  }
}

// Bumped on every cohort load so a slow, superseded response can't overwrite a newer one.
let cohortLoadSeq = 0;

// Three requests per cohort: its new hires, its tasks, and all progress on its tasks.
// Filtering progress by task.cohort leaves out stale rows from a previous cohort (see CLAUDE.md).
async function loadCohort(cohortId) {
  const loadId = ++cohortLoadSeq;
  closePanel();
  hideDashboardError();
  $("dashboard-body").hidden = true; // no clicking a stale roster while the new one loads
  const cohort = dashboard.cohorts.find((c) => c.id === cohortId);
  $("dash-cohort-line").textContent = `Starts ${formatDate(cohort.start_date)}${cohort.location ? ` · ${cohort.location}` : ""}`;
  try {
    const [hires, tasks, progress] = await Promise.all([
      pb.collection("users").getFullList({
        filter: pb.filter('role = "new_hire" && cohort = {:cohort}', { cohort: cohortId }),
        sort: "name",
      }),
      pb.collection("tasks").getFullList({
        filter: pb.filter("cohort = {:cohort}", { cohort: cohortId }),
        sort: "week,sort",
      }),
      pb.collection("progress").getFullList({
        filter: pb.filter("task.cohort = {:cohort}", { cohort: cohortId }),
      }),
    ]);
    if (loadId !== cohortLoadSeq) return; // a newer cohort pick superseded this load
    const byUser = new Map(hires.map((hire) => [hire.id, new Map()]));
    for (const row of progress) {
      if (byUser.has(row.user)) byUser.get(row.user).set(row.task, row);
    }
    Object.assign(dashboard, { cohort, hires, tasks, progress: byUser, openHireId: null });
    renderDashboard();
  } catch (err) {
    if (err.isAbort) return; // superseded by a newer cohort pick
    console.error("Loading cohort failed:", err);
    showDashboardError("We couldn't load that cohort. Try picking it again.");
  }
}

function hireStatusOf(hireId, task) {
  const row = dashboard.progress.get(hireId).get(task.id);
  return row ? row.status : "not_started";
}

// Roster rules from CLAUDE.md: Blocked if any blocked task; Behind if fewer than half of week-0 done.
function hireStats(hire) {
  const { tasks } = dashboard;
  const statuses = tasks.map((task) => hireStatusOf(hire.id, task));
  const done = statuses.filter((s) => s === "done").length;
  const week0 = tasks.filter((task) => task.week === 0);
  const week0Done = week0.filter((task) => hireStatusOf(hire.id, task) === "done").length;

  let status = "on_track";
  if (statuses.includes("blocked")) status = "blocked";
  else if (week0Done < week0.length / 2) status = "behind";

  return {
    done,
    percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    week0Done,
    week0Total: week0.length,
    status,
  };
}

function renderDashboard() {
  const stats = new Map(dashboard.hires.map((hire) => [hire.id, hireStats(hire)]));
  renderKpis(stats);
  renderRoster(stats);
  $("dashboard-body").hidden = false;
  if (dashboard.openHireId) renderPanel();
}

function renderKpis(stats) {
  const all = [...stats.values()];
  const week0Possible = all.reduce((sum, s) => sum + s.week0Total, 0);
  const week0Done = all.reduce((sum, s) => sum + s.week0Done, 0);

  $("kpi-count").textContent = String(all.length);
  $("kpi-prework").textContent = week0Possible ? `${Math.round((week0Done / week0Possible) * 100)}%` : "–";
  $("kpi-blocked").textContent = String(all.filter((s) => s.status === "blocked").length);
}

function renderRoster(stats) {
  const hires = [...dashboard.hires].sort((a, b) =>
    ROSTER_STATUS[stats.get(a.id).status].order - ROSTER_STATUS[stats.get(b.id).status].order
    || (a.name || a.email).localeCompare(b.name || b.email));

  if (hires.length === 0) {
    const row = el("tr");
    const cell = el("td", "roster-empty", "No new hires in this cohort yet.");
    cell.colSpan = 5;
    row.append(cell);
    $("roster-body").replaceChildren(row);
    return;
  }

  $("roster-body").replaceChildren(...hires.map((hire) => {
    const s = stats.get(hire.id);
    const row = el("tr", "roster-row");
    row.addEventListener("click", () => openPanel(hire.id));

    const nameCell = el("td");
    const nameButton = el("button", "link-button roster-name", hire.name || hire.email);
    nameButton.type = "button";
    nameButton.id = `hire-${hire.id}`;
    nameCell.append(nameButton);

    const percentCell = el("td", "col-percent");
    const bar = el("div", "progress mini");
    const fill = el("div", "progress-fill");
    fill.style.width = `${s.percent}%`;
    bar.append(fill);
    percentCell.append(el("span", "", `${s.percent}%`), bar);

    const statusCell = el("td");
    statusCell.append(el("span", `chip roster-${s.status}`, ROSTER_STATUS[s.status].label));

    row.append(nameCell, el("td", "col-team", hire.team || "–"), el("td", "col-manager", hire.manager_name || "–"),
      percentCell, statusCell);
    return row;
  }));
}

// ---------- side panel: one person's checklist ----------

function openPanel(hireId) {
  dashboard.openHireId = hireId;
  hidePanelError();
  renderPanel();
  $("panel-backdrop").hidden = false;
  $("person-panel").hidden = false;
  document.body.classList.add("panel-open");
  $("panel-close").focus();
}

function closePanel() {
  if (!dashboard || !dashboard.openHireId) return;
  const returnFocus = $(`hire-${dashboard.openHireId}`);
  dashboard.openHireId = null;
  $("panel-backdrop").hidden = true;
  $("person-panel").hidden = true;
  document.body.classList.remove("panel-open");
  if (returnFocus) returnFocus.focus();
}

function showPanelError(message) {
  $("panel-error").textContent = message;
  $("panel-error").hidden = false;
}

function hidePanelError() {
  $("panel-error").hidden = true;
}

function renderPanel() {
  const hire = dashboard.hires.find((h) => h.id === dashboard.openHireId);
  const s = hireStats(hire);

  $("panel-name").textContent = hire.name || hire.email;
  $("panel-sub").textContent = [hire.team, hire.manager_name && `Manager: ${hire.manager_name}`]
    .filter(Boolean).join(" · ");

  const summary = el("div", "panel-summary");
  summary.append(
    el("span", `chip roster-${s.status}`, ROSTER_STATUS[s.status].label),
    el("span", "muted", `${s.done} of ${dashboard.tasks.length} done`));
  $("panel-summary").replaceChildren(summary);

  $("panel-body").replaceChildren(...renderWeekGroups(dashboard.tasks, (task) => renderPanelTask(hire, task)));
}

function renderPanelTask(hire, task) {
  const status = hireStatusOf(hire.id, task);
  const row = dashboard.progress.get(hire.id).get(task.id);

  const item = el("li", `task panel-task status-${status}`);
  const body = el("div", "task-body");
  body.append(el("span", "task-title", task.title));
  const meta = el("div", "task-meta");
  meta.append(el("span", `owner owner-${task.owner_type}`, OWNER_LABELS[task.owner_type] || task.owner_type));
  body.append(meta);
  if (status === "blocked" && row && row.note) body.append(el("p", "task-note", row.note));

  // Coordinators can set any status, which is how IT/manager tasks get marked done and blockers cleared.
  const select = el("select", `status-select chip-${status}`);
  select.id = `status-${task.id}`;
  select.setAttribute("aria-label", `Status of "${task.title}" for ${hire.name || hire.email}`);
  for (const [value, label] of Object.entries(STATUS_LABELS)) {
    const option = el("option", "", label);
    option.value = value;
    select.append(option);
  }
  select.value = status;
  select.addEventListener("change", () => setHireTaskStatus(hire, task, select, status));

  item.append(body, select);
  return item;
}

async function setHireTaskStatus(hire, task, select, previous) {
  const status = select.value;
  const existing = dashboard.progress.get(hire.id).get(task.id);
  if (!existing && status === "not_started") return; // no row already means not started

  select.disabled = true;
  hidePanelError();
  const changes = { status, completed_at: status === "done" ? new Date().toISOString() : "" };
  try {
    const saved = existing
      ? await pb.collection("progress").update(existing.id, changes)
      : await pb.collection("progress").create({ user: hire.id, task: task.id, ...changes });
    dashboard.progress.get(hire.id).set(task.id, saved);
    renderDashboard();
    $(`status-${task.id}`).focus(); // the panel re-rendered; keep keyboard focus in place
  } catch (err) {
    if (err.isAbort) return;
    console.error("Updating task status failed:", err);
    showPanelError("Couldn't update that task. Try again.");
    select.value = previous;
    select.disabled = false;
  }
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
  closePanel();
  pb.authStore.clear();
  checklist = null;
  dashboard = null;
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
  $("cohort-picker").addEventListener("change", (event) => loadCohort(event.target.value));
  $("panel-close").addEventListener("click", closePanel);
  $("panel-backdrop").addEventListener("click", closePanel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });
  await refreshSession();
  render();
}

start();
