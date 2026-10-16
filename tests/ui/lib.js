// Tiny test harness for the UI smoke tests. Each *.test.html page loads the real app in an
// iframe (same origin, so it can read and drive the app's DOM), runs its steps, and writes
// "ok - ..." / "not ok - ..." lines plus a final "DONE" into <pre id="out">, which
// tests/run.sh reads back from headless Chrome.

function log(line) {
  document.getElementById("out").textContent += line + "\n";
}

function check(desc, condition, got) {
  log((condition ? "ok - " : "not ok - ") + desc + (condition || got === undefined ? "" : ` (got: ${got})`));
}

function eq(desc, got, want) {
  check(desc, got === want, `${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll until fn() returns something truthy, or fail the test with `label`.
async function until(fn, label) {
  for (let i = 0; i < 200; i++) {
    try {
      const value = fn();
      if (value) return value;
    } catch (_) { /* app not ready yet */ }
    await sleep(50);
  }
  throw new Error(`timed out waiting for: ${label}`);
}

const app = () => document.getElementById("app").contentDocument;
const $app = (id) => app().getElementById(id);
const visible = (id) => !$app(id).hidden;

function setValue(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function run(steps) {
  try {
    await steps();
  } catch (err) {
    log(`not ok - ${err.message}`);
  }
  log("DONE");
}
