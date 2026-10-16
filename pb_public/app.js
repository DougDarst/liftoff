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

// The SDK cancels a pending request when another one to the same method + URL starts. That's
// right for reloading a list, but wrong for saves: every progress create shares one URL, so a
// second quick tick would cancel the first (after it already reached the server). Saves opt out.
const NO_AUTO_CANCEL = { requestKey: null };

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
  $("boot").hidden = true;
  if (pb.authStore.isValid && pb.authStore.record) {
    showApp(pb.authStore.record);
  } else if (pb.authStore.token) {
    sessionExpired();
  } else {
    showLogin();
  }
}

// Sign-in tokens expire (after 7 days by default). PocketBase treats an expired token as "signed
// out", so lists come back empty instead of failing, which would look like "you have no tasks".
// Every load and save checks first and sends the user back to sign in with an explanation.
function sessionExpired() {
  if (pb.authStore.isValid) return false;
  closeAllPanels();
  pb.authStore.clear();
  checklist = null;
  dashboard = null;
  showLogin();
  showLoginError("Your session has expired. Please sign in again.");
  return true;
}

function closeAllPanels() {
  closePanel();
  closeAddPanel();
  closeAccountPanel();
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
  if (sessionExpired()) return;
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
  if (sessionExpired()) return;
  const existing = checklist.progressByTask.get(task.id);
  const saved = existing
    ? await pb.collection("progress").update(existing.id, changes, NO_AUTO_CANCEL)
    : await pb.collection("progress").create({ user: checklist.user.id, task: task.id, ...changes }, NO_AUTO_CANCEL);
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

// Which cohort the dashboard opens on (cohorts sorted by start date). Prefer cohorts that have
// new hires, so an empty next cohort doesn't hide the one people are actually in:
//   1. the soonest cohort starting today or later that has new hires
//   2. else the most recent earlier cohort that has new hires
//   3. else the soonest upcoming cohort, else the latest one
// `today` is a parameter so the tests can check behaviour on any date.
function defaultCohort(cohorts, cohortsWithHires, today = new Date()) {
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  const starts = (c) => new Date(c.start_date.replace(" ", "T"));
  const upcoming = cohorts.filter((c) => starts(c) >= midnight);
  const earlier = cohorts.filter((c) => starts(c) < midnight);
  const staffed = (list) => list.filter((c) => cohortsWithHires.has(c.id));
  return staffed(upcoming)[0] || staffed(earlier).at(-1) || upcoming[0] || cohorts.at(-1);
}

async function loadDashboard() {
  if (sessionExpired()) return;
  dashboard = null;
  hideDashboardError();
  $("dashboard-body").hidden = true;
  $("dashboard-loading").hidden = false;
  try {
    const [cohorts, hires] = await Promise.all([
      pb.collection("cohorts").getFullList({ sort: "start_date" }),
      pb.collection("users").getFullList({ filter: 'role = "new_hire"', fields: "cohort" }),
    ]);
    $("add-hire-button").hidden = cohorts.length === 0;
    if (cohorts.length === 0) {
      $("dashboard-loading").hidden = true;
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
    picker.value = defaultCohort(cohorts, new Set(hires.map((h) => h.cohort))).id;
    dashboard = { cohorts };
    await loadCohort(picker.value);
  } catch (err) {
    if (err.isAbort) return;
    $("dashboard-loading").hidden = true;
    console.error("Loading cohorts failed:", err);
    showDashboardError("We couldn't load the dashboard. Refresh the page to try again.");
  }
}

// Bumped on every cohort load so a slow, superseded response can't overwrite a newer one.
let cohortLoadSeq = 0;

// Three requests per cohort: its new hires, its tasks, and all progress on its tasks.
// Filtering progress by task.cohort leaves out stale rows from a previous cohort (see CLAUDE.md).
async function loadCohort(cohortId) {
  if (sessionExpired()) return;
  const loadId = ++cohortLoadSeq;
  closePanel();
  hideDashboardError();
  $("dashboard-body").hidden = true; // no clicking a stale roster while the new one loads
  $("dashboard-loading").hidden = false;
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
    $("dashboard-loading").hidden = true;
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
  $("dashboard-loading").hidden = true;
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
    if (dashboard.tasks.length === 0) {
      percentCell.append(el("span", "", "–")); // nothing to complete yet
    } else {
      const bar = el("div", "progress mini");
      const fill = el("div", "progress-fill");
      fill.style.width = `${s.percent}%`;
      bar.append(fill);
      percentCell.append(el("span", "", `${s.percent}%`), bar);
    }

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

  if (dashboard.tasks.length === 0) {
    $("panel-body").replaceChildren(el("div", "card placeholder", "This cohort has no tasks yet. Add them in the admin UI."));
    return;
  }
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
  if (sessionExpired()) return;
  const status = select.value;
  const existing = dashboard.progress.get(hire.id).get(task.id);
  if (!existing && status === "not_started") return; // no row already means not started

  select.disabled = true;
  hidePanelError();
  const changes = { status, completed_at: status === "done" ? new Date().toISOString() : "" };
  try {
    const saved = existing
      ? await pb.collection("progress").update(existing.id, changes, NO_AUTO_CANCEL)
      : await pb.collection("progress").create({ user: hire.id, task: task.id, ...changes }, NO_AUTO_CANCEL);
    dashboard.progress.get(hire.id).set(task.id, saved);
    renderDashboard();
    $(`status-${task.id}`).focus(); // the panel re-rendered; keep keyboard focus in place
  } catch (err) {
    console.error("Updating task status failed:", err);
    showPanelError("Couldn't update that task. Try again.");
    select.value = previous;
    select.disabled = false;
  }
}

// ---------- add a new hire ----------

// No lookalike characters (0/O, 1/l/I, 5/S, 2/Z, 8/B) so the password can be read aloud or retyped.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKMNPQRTUVWXY34679";

// 16 random characters in groups of 4 (about 89 bits). Rejection sampling avoids modulo bias.
function generateTempPassword() {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  const chars = [];
  while (chars.length < 16) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < limit) chars.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
  }
  return chars.join("").match(/.{4}/g).join("-");
}

function showAddError(message) {
  $("add-error").textContent = message;
  $("add-error").hidden = false;
}

function hideAddError() {
  $("add-error").hidden = true;
}

function showAddForm() {
  $("add-form").reset();
  hideAddError();
  $("temp-password").textContent = ""; // don't leave a password sitting in the page
  $("add-done").hidden = true;
  $("add-form").hidden = false;
  $("add-cohort").value = dashboard.cohort.id;
  $("add-name").focus();
}

function openAddPanel() {
  if (!dashboard || !dashboard.cohort) return;
  closePanel();
  $("add-cohort").replaceChildren(...dashboard.cohorts.map((c) => {
    const option = el("option", "", c.name);
    option.value = c.id;
    return option;
  }));
  $("panel-backdrop").hidden = false;
  $("add-panel").hidden = false;
  document.body.classList.add("panel-open");
  showAddForm();
}

function closeAddPanel() {
  if ($("add-panel").hidden) return;
  $("temp-password").textContent = "";
  $("add-panel").hidden = true;
  $("panel-backdrop").hidden = true;
  document.body.classList.remove("panel-open");
  $("add-hire-button").focus();
}

// Coordinators may create users (API rule); the server also refuses this for anyone else.
async function handleAddHire(event) {
  event.preventDefault();
  if (sessionExpired()) return;
  hideAddError();

  const name = $("add-name").value.trim();
  const email = $("add-email").value.trim();
  const cohortId = $("add-cohort").value;
  if (!name) return showAddError("Enter their name.");
  if (!email || !email.includes("@")) return showAddError("Enter a valid email address.");
  if (!cohortId) return showAddError("Pick a cohort.");

  const password = generateTempPassword();
  $("add-submit").disabled = true;
  $("add-submit").textContent = "Adding…";
  try {
    await pb.collection("users").create({
      name,
      email,
      emailVisibility: true, // lets coordinators see the address on the roster
      team: $("add-team").value.trim(),
      manager_name: $("add-manager").value.trim(),
      cohort: cohortId,
      role: "new_hire",
      password,
      passwordConfirm: password,
    }, NO_AUTO_CANCEL);

    const cohort = dashboard.cohorts.find((c) => c.id === cohortId);
    $("add-done-text").textContent = `${name} was added to ${cohort.name}. Their temporary password:`;
    $("temp-password").textContent = password;
    $("copy-password").textContent = "Copy";
    $("add-form").hidden = true;
    $("add-done").hidden = false;
    $("copy-password").focus();

    if (cohortId === dashboard.cohort.id) loadCohort(cohortId); // show them on the roster
  } catch (err) {
    console.error("Adding new hire failed:", err.status, err.response); // never log the password
    const fields = (err.response && err.response.data) || {};
    if (fields.email && fields.email.code === "validation_not_unique") showAddError("Someone with that email already exists.");
    else if (fields.email) showAddError("Enter a valid email address.");
    else if (Object.keys(fields).length) showAddError("Check the details and try again.");
    else if (err.status === 400 || err.status === 403) showAddError("You don't have permission to add people.");
    else showAddError("Couldn't add them. Check your connection and try again.");
  } finally {
    $("add-submit").disabled = false;
    $("add-submit").textContent = "Add new hire";
  }
}

async function copyTempPassword() {
  try {
    await navigator.clipboard.writeText($("temp-password").textContent);
    $("copy-password").textContent = "Copied";
  } catch (err) {
    console.error("Copy failed:", err);
    $("copy-password").textContent = "Select it to copy";
  }
}

// ---------- account: change password ----------

function showPasswordError(message) {
  $("password-success").hidden = true;
  $("password-error").textContent = message;
  $("password-error").hidden = false;
}

function openAccountPanel() {
  closePanel();
  closeAddPanel();
  const user = pb.authStore.record;
  $("account-email").textContent = `Signed in as ${user.email}`;
  $("password-form").reset();
  $("account-username").value = user.email;
  $("password-error").hidden = true;
  $("password-success").hidden = true;
  $("panel-backdrop").hidden = false;
  $("account-panel").hidden = false;
  document.body.classList.add("panel-open");
  $("current-password").focus();
}

function closeAccountPanel() {
  if ($("account-panel").hidden) return;
  $("password-form").reset();
  $("account-panel").hidden = true;
  $("panel-backdrop").hidden = true;
  document.body.classList.remove("panel-open");
  $("user-name").focus();
}

// Users may change their own password by supplying the current one (API rules + PocketBase's
// built-in check). Changing it ends every existing session, this one included, so sign back in.
async function handleChangePassword(event) {
  event.preventDefault();
  if (sessionExpired()) return;
  $("password-error").hidden = true;
  $("password-success").hidden = true;

  const current = $("current-password").value;
  const next = $("new-password").value;
  const confirm = $("confirm-password").value;
  if (!current || !next || !confirm) return showPasswordError("Fill in all three fields.");
  if (next.length < 10) return showPasswordError("Choose a new password with at least 10 characters.");
  if (next !== confirm) return showPasswordError("The new passwords don't match.");
  if (next === current) return showPasswordError("Choose a password different from your current one.");

  const user = pb.authStore.record;
  $("password-submit").disabled = true;
  $("password-submit").textContent = "Changing…";
  try {
    await pb.collection("users").update(user.id,
      { oldPassword: current, password: next, passwordConfirm: confirm }, NO_AUTO_CANCEL);
  } catch (err) {
    console.error("Changing password failed:", err.status, err.response); // never log passwords
    const fields = (err.response && err.response.data) || {};
    if (fields.oldPassword) showPasswordError("Your current password is incorrect.");
    else if (fields.password) showPasswordError("Choose a stronger password (at least 10 characters).");
    else if (err.status === 429) showPasswordError("Too many attempts. Wait a few seconds and try again.");
    else showPasswordError("Couldn't change your password. Check your connection and try again.");
    $("password-submit").disabled = false;
    $("password-submit").textContent = "Change password";
    return;
  }

  try {
    await pb.collection("users").authWithPassword(user.email, next);
    $("password-form").reset();
    $("account-username").value = user.email;
    $("password-success").hidden = false;
  } catch (err) {
    // The password did change; only signing back in failed (e.g. rate limited).
    console.error("Signing back in after a password change failed:", err.status);
    closeAllPanels();
    pb.authStore.clear();
    showLogin();
    showLoginError("Your password was changed. Sign in with your new password.");
  } finally {
    $("password-submit").disabled = false;
    $("password-submit").textContent = "Change password";
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
    if (err.status === 400) showLoginError("That email and password don't match. Try again.");
    else if (err.status === 429) showLoginError("Too many sign-in attempts. Wait a few seconds and try again.");
    else showLoginError("Couldn't reach the server. Check your connection and try again.");
  } finally {
    setLoginBusy(false);
  }
}

function handleSignOut() {
  closeAllPanels();
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
  $("panel-backdrop").addEventListener("click", closeAllPanels);
  $("user-name").addEventListener("click", openAccountPanel);
  $("account-close").addEventListener("click", closeAccountPanel);
  $("password-form").addEventListener("submit", handleChangePassword);
  $("add-hire-button").addEventListener("click", openAddPanel);
  $("add-close").addEventListener("click", closeAddPanel);
  $("add-finish").addEventListener("click", closeAddPanel);
  $("add-another").addEventListener("click", showAddForm);
  $("add-form").addEventListener("submit", handleAddHire);
  $("copy-password").addEventListener("click", copyTempPassword);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllPanels();
  });
  await refreshSession();
  render();
}

start();
