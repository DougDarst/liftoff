// Liftoff frontend. Plain JS, no build step.
// Access control lives in the PocketBase API rules; this file only decides what to show.

const pb = new PocketBase(location.origin);

const ROLE_LABELS = {
  coordinator: "Coordinator",
  new_hire: "New hire",
};

const $ = (id) => document.getElementById(id);

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
}

function render() {
  if (pb.authStore.isValid && pb.authStore.record) {
    showApp(pb.authStore.record);
  } else {
    showLogin();
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
  pb.authStore.clear();
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
  render();
  await refreshSession();
  render();
}

start();
