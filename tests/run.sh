#!/usr/bin/env bash
# Run the Liftoff test suite against throwaway PocketBase instances.
#
#   ./tests/run.sh          API rule tests, then UI smoke tests
#   ./tests/run.sh api      API rule tests only
#   ./tests/run.sh ui       UI smoke tests only
#
# Every test group gets a brand-new database built from pb_migrations/, so the tests never
# touch pb_data/ and also prove the migrations apply cleanly.
#
# Environment:
#   POCKETBASE=path   PocketBase binary (default: ./pocketbase)
#   PORT=8099         port for the throwaway server
#   CHROME=path       Chrome/Chromium binary for UI tests (auto-detected if unset)
#   REQUIRE_UI=1      fail instead of skipping when no Chrome is found (set in CI)

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WHAT="${1:-all}"
POCKETBASE="${POCKETBASE:-./pocketbase}"
PORT="${PORT:-8099}"
BASE="http://127.0.0.1:$PORT"
TMP="$(mktemp -d)"
PB_PID=""
FAILED=0

cleanup() {
  stop_server
  rm -rf "$TMP"
}
trap cleanup EXIT

for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 2; }
done
[ -x "$POCKETBASE" ] || { echo "PocketBase binary not found at $POCKETBASE (set POCKETBASE=...)" >&2; exit 2; }

# ---------- throwaway server ----------

# The app plus the UI test pages, served together. Test pages live under /__test/ and only
# ever exist in this temp copy, never in pb_public/.
build_public_dir() {
  rm -rf "$TMP/public"
  cp -R pb_public "$TMP/public"
  cp -R tests/ui "$TMP/public/__test"
}

start_server() {
  stop_server
  rm -rf "$TMP/data"
  "$POCKETBASE" serve --dir "$TMP/data" --migrationsDir pb_migrations --publicDir "$TMP/public" \
    --http "127.0.0.1:$PORT" > "$TMP/pocketbase.log" 2>&1 &
  PB_PID=$!
  for _ in $(seq 1 50); do
    curl -s "$BASE/api/health" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  echo "PocketBase didn't start on port $PORT. Log:" >&2
  cat "$TMP/pocketbase.log" >&2
  exit 2
}

stop_server() {
  if [ -n "$PB_PID" ]; then
    kill "$PB_PID" 2>/dev/null
    wait "$PB_PID" 2>/dev/null
    PB_PID=""
  fi
}

# ---------- UI tests ----------

find_chrome() {
  if [ -n "${CHROME:-}" ]; then echo "$CHROME"; return; fi
  local mac="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -x "$mac" ]; then echo "$mac"; return; fi
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$c" >/dev/null && { command -v "$c"; return; }
  done
}

# ui_test NAME SIGNED_IN_AS   (SIGNED_IN_AS is a demo user's email prefix, or "" for signed out)
# Each page in tests/ui/ prints "ok - ..." / "not ok - ..." lines and a final "DONE".
ui_test() {
  local name="$1" user="$2" url output
  start_server
  if [ -n "$user" ]; then url="$BASE/__test/login-as.html?u=$user&then=/__test/$name.test.html"
  else url="$BASE/__test/$name.test.html"; fi

  local flags=(--headless=new --disable-gpu --user-data-dir="$TMP/chrome-$name" --virtual-time-budget=30000)
  [ -n "${CI:-}" ] && flags+=(--no-sandbox --disable-dev-shm-usage)

  output="$("$CHROME_BIN" "${flags[@]}" --dump-dom "$url" 2>/dev/null \
    | sed -n '/<pre id="out">/,/<\/pre>/p' | sed 's/.*<pre id="out">//; s/<\/pre>.*//' \
    | sed 's/&amp;/\&/g; s/&lt;/</g; s/&gt;/>/g')"

  echo
  echo "UI: $name"
  echo "$output" | grep -E '^(ok|not ok) - ' | sed 's/^ok - /  ok    /; s/^not ok - /  FAIL  /'
  local passed failed
  passed="$(echo "$output" | grep -c '^ok - ')"
  failed="$(echo "$output" | grep -c '^not ok - ')"
  if ! echo "$output" | grep -q '^DONE$'; then
    echo "  FAIL  page never finished (timed out or crashed)"
    failed=$((failed + 1))
  fi
  UI_PASS=$((UI_PASS + passed))
  UI_FAIL=$((UI_FAIL + failed))
}

run_ui_tests() {
  CHROME_BIN="$(find_chrome)"
  if [ -z "$CHROME_BIN" ]; then
    if [ -n "${REQUIRE_UI:-}" ]; then echo "No Chrome found and REQUIRE_UI is set." >&2; FAILED=1; return; fi
    echo; echo "UI tests skipped: no Chrome found (set CHROME=...)"; return
  fi
  UI_PASS=0
  UI_FAIL=0
  ui_test login ""
  ui_test checklist sam
  ui_test dashboard coordinator
  echo
  echo "UI: $UI_PASS passed, $UI_FAIL failed"
  [ "$UI_FAIL" -eq 0 ] || FAILED=1
}

# ---------- run ----------

build_public_dir

if [ "$WHAT" = "all" ] || [ "$WHAT" = "api" ]; then
  start_server
  tests/api.sh "$BASE" || FAILED=1
fi

if [ "$WHAT" = "all" ] || [ "$WHAT" = "ui" ]; then
  run_ui_tests
fi

echo
if [ "$FAILED" -eq 0 ]; then echo "All tests passed."; else echo "TESTS FAILED."; fi
exit "$FAILED"
