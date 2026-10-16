#!/usr/bin/env bash
# API access-rule tests. Acts as each demo user against a FRESH, freshly seeded PocketBase and
# checks what the server allows and refuses. Run via tests/run.sh, which starts that server.
#
#   allow  - request must succeed (2xx)
#   deny   - request must be refused BY AN API RULE: 403/404, or 400 with no field errors.
#            A 400 with field errors is a validation failure, which means the test itself is
#            wrong, so it fails rather than passing as a "denial".
#   reject - request must fail for any reason (used where PocketBase validation does the blocking,
#            e.g. password changes and the unique index)
#   count  - a list request must return exactly N records
#
# Compatible with macOS's bash 3.2.

set -u

BASE="${1:?usage: tests/api.sh http://127.0.0.1:PORT}"
case "$BASE" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing to run against $BASE: API tests write data and use the public demo password. Local only." >&2; exit 2 ;;
esac

PW="liftoff-demo-2026"
NOW="$(date -u +"%Y-%m-%d %H:%M:%S.000Z")"
PAST="2000-01-01 00:00:00.000Z"
FUTURE="2100-01-01 00:00:00.000Z"

PASS=0
FAIL=0
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

# ---------- helpers ----------

# call METHOD PATH TOKEN [JSON]  -> sets CODE and BODY
call() {
  local method="$1" path="$2" token="$3" data="${4:-}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE/api$path")
  [ -n "$token" ] && args+=(-H "Authorization: $token")
  [ -n "$data" ] && args+=(-H "Content-Type: application/json" -d "$data")
  CODE="$(curl "${args[@]}")"
  BODY="$(cat "$BODY_FILE")"
}

ok()  { PASS=$((PASS + 1)); echo "  ok    $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; echo "        $2"; }

allow() {
  local desc="$1"; shift
  call "$@"
  case "$CODE" in
    200|204) ok "$desc" ;;
    *) bad "$desc" "expected success, got $CODE: $BODY" ;;
  esac
}

deny() {
  local desc="$1"; shift
  call "$@"
  case "$CODE" in
    403|404) ok "$desc" ;;
    400)
      if [ "$(jq -c '.data' <<<"$BODY")" = "{}" ]; then ok "$desc"
      else bad "$desc" "expected a rule denial, got a validation error (is the test request wrong?): $BODY"; fi ;;
    *) bad "$desc" "expected denial, got $CODE: $BODY" ;;
  esac
}

reject() {
  local desc="$1"; shift
  call "$@"
  case "$CODE" in
    4??) ok "$desc" ;;
    *) bad "$desc" "expected the request to fail, got $CODE: $BODY" ;;
  esac
}

count() {
  local desc="$1" want="$2" path="$3" token="$4"
  call GET "$path" "$token"
  local got
  got="$(jq -r '.totalItems // "error"' <<<"$BODY")"
  if [ "$CODE" = "200" ] && [ "$got" = "$want" ]; then ok "$desc"
  else bad "$desc" "expected $want records, got $got (HTTP $CODE): $BODY"; fi
}

login() {
  call POST /collections/users/auth-with-password "" "{\"identity\":\"$1\",\"password\":\"${2:-$PW}\"}"
  jq -r '.token // empty' <<<"$BODY"
}

urlencode() { jq -rn --arg v "$1" '$v|@uri'; }

# first_id COLLECTION FILTER  (looked up as the coordinator)
first_id() {
  call GET "/collections/$1/records?perPage=1&filter=$(urlencode "$2")" "$COORD"
  jq -r '.items[0].id // empty' <<<"$BODY"
}

section() { echo; echo "$1"; }

echo "API rule tests against $BASE"

# ---------- rate limiting (must run first, before the setup sign-ins) ----------

section "Rate limiting"
SU_TOKEN="${SU_TOKEN:-}"
if [ -z "$SU_TOKEN" ]; then
  echo "Setup failed: SU_TOKEN not set (run via tests/run.sh)." >&2
  exit 2
fi
call GET /settings "$SU_TOKEN"
if [ "$(jq -r '.rateLimits.enabled' <<<"$BODY")" = "true" ]; then ok "migrations enable rate limiting"
else bad "migrations enable rate limiting" "rateLimits.enabled is $(jq -c '.rateLimits.enabled' <<<"$BODY")"; fi
limited=0
for _ in 1 2 3 4 5 6; do
  call POST /collections/users/auth-with-password "" '{"identity":"priya@example.com","password":"wrong-password"}'
  [ "$CODE" = "429" ] && limited=$((limited + 1))
done
if [ "$limited" -gt 0 ]; then ok "rapid sign-in attempts are throttled (429)"
else bad "rapid sign-in attempts are throttled (429)" "6 quick wrong-password attempts, none got 429"; fi
# Switch it off so the rest of the suite can sign in quickly.
call PATCH /settings "$SU_TOKEN" '{"rateLimits":{"enabled":false}}'

# ---------- setup ----------

COORD="$(login coordinator@example.com)"
PRIYA="$(login priya@example.com)"
MARCUS="$(login marcus@example.com)"
ELENA="$(login elena@example.com)"
SAM="$(login sam@example.com)"
for t in COORD PRIYA MARCUS ELENA SAM; do
  if [ -z "${!t}" ]; then echo "Setup failed: couldn't sign in a demo user ($t). Is this a freshly seeded database?" >&2; exit 2; fi
done

PRIYA_ID="$(first_id users 'email = "priya@example.com"')"
MARCUS_ID="$(first_id users 'email = "marcus@example.com"')"
ELENA_ID="$(first_id users 'email = "elena@example.com"')"
SAM_ID="$(first_id users 'email = "sam@example.com"')"
NOV="$(first_id cohorts 'name ~ "November"')"
DEC="$(first_id cohorts 'name ~ "December"')"
T_SSO="$(first_id tasks 'title = "SSO and GitHub access verified"')"            # IT, week 0
T_BUDDY="$(first_id tasks 'title = "Assign an onboarding buddy"')"              # manager, week 0
T_HANDBOOK="$(first_id tasks 'title = "Read the engineering handbook"')"        # new hire, week 0
T_TRAINING="$(first_id tasks 'title = "Complete security awareness training"')" # new hire, week 0
T_LAB="$(first_id tasks 'title = "Dev environment lab: run the app locally"')"  # new hire, week 1
row_of() { first_id progress "user = \"$1\" && task = \"$2\""; }
PRIYA_HANDBOOK_ROW="$(row_of "$PRIYA_ID" "$T_HANDBOOK")"
MARCUS_HANDBOOK_ROW="$(row_of "$MARCUS_ID" "$T_HANDBOOK")"
ELENA_SSO_ROW="$(row_of "$ELENA_ID" "$T_SSO")"

# ---------- anonymous ----------

section "Anonymous (signed out)"
count "can't list users"    0 /collections/users/records ""
count "can't list cohorts"  0 /collections/cohorts/records ""
count "can't list tasks"    0 /collections/tasks/records ""
count "can't list progress" 0 /collections/progress/records ""
deny  "no public sign-up" POST /collections/users/records "" \
  '{"email":"stranger@example.com","password":"abcdefgh12","passwordConfirm":"abcdefgh12","role":"coordinator"}'
reject "wrong password is refused" POST /collections/users/auth-with-password "" \
  '{"identity":"priya@example.com","password":"wrong-password"}'

# ---------- users ----------

section "users"
count "new hire sees only herself" 1 /collections/users/records "$PRIYA"
deny  "new hire can't view another user" GET "/collections/users/records/$MARCUS_ID" "$PRIYA"
allow "new hire can edit her own name" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" '{"name":"Priya Shah"}'
deny  "new hire can't make herself coordinator" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" '{"role":"coordinator"}'
deny  "new hire can't change her cohort" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" "{\"cohort\":\"$DEC\"}"
deny  "new hire can't change her team (#4)" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" '{"team":"Payments"}'
deny  "new hire can't change her manager_name (#4)" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" '{"manager_name":"Someone"}'
deny  "new hire can't sneak team in with a name change (#4)" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" \
  '{"name":"Priya Shah","team":"Payments"}'
deny  "new hire can't edit another user" PATCH "/collections/users/records/$MARCUS_ID" "$PRIYA" '{"name":"hacked"}'
deny  "new hire can't create users" POST /collections/users/records "$PRIYA" \
  '{"email":"friend@example.com","password":"abcdefgh12","passwordConfirm":"abcdefgh12","role":"coordinator"}'
deny  "new hire can't delete herself" DELETE "/collections/users/records/$PRIYA_ID" "$PRIYA"
reject "new hire can't change her password without the old one" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" \
  '{"password":"newpass12345","passwordConfirm":"newpass12345"}'
count "coordinator sees all 5 users" 5 /collections/users/records "$COORD"
allow "coordinator can change a new hire's team" PATCH "/collections/users/records/$PRIYA_ID" "$COORD" '{"team":"Checkout"}'
allow "coordinator can create a user" POST /collections/users/records "$COORD" \
  '{"email":"nocohort@example.com","name":"No Cohort","role":"new_hire","password":"abcdefgh12","passwordConfirm":"abcdefgh12"}'
NOCOHORT="$(login nocohort@example.com abcdefgh12)"
reject "coordinator can't reset a password (manageRule unset, #10)" PATCH "/collections/users/records/$PRIYA_ID" "$COORD" \
  '{"password":"newpass12345","passwordConfirm":"newpass12345"}'

# ---------- cohorts ----------

section "cohorts"
count "new hire sees only her own cohort (#6)" 1 /collections/cohorts/records "$PRIYA"
deny  "new hire can't view another cohort (#6)" GET "/collections/cohorts/records/$DEC" "$PRIYA"
allow "new hire can view her own cohort" GET "/collections/cohorts/records/$NOV" "$PRIYA"
count "new hire with no cohort sees none (#6)" 0 /collections/cohorts/records "$NOCOHORT"
deny  "new hire can't create a cohort" POST /collections/cohorts/records "$PRIYA" \
  '{"name":"Rogue cohort","start_date":"2026-01-01 00:00:00.000Z"}'
deny  "new hire can't rename a cohort" PATCH "/collections/cohorts/records/$NOV" "$PRIYA" '{"name":"defaced"}'
count "coordinator sees every cohort" 2 /collections/cohorts/records "$COORD"

# ---------- tasks ----------

section "tasks"
count "new hire sees her cohort's 11 tasks" 11 /collections/tasks/records "$PRIYA"
count "new hire with no cohort sees no tasks" 0 /collections/tasks/records "$NOCOHORT"
allow "coordinator can create a task" POST /collections/tasks/records "$COORD" \
  "{\"cohort\":\"$DEC\",\"title\":\"December-only task\",\"owner_type\":\"new_hire\",\"week\":0}"
T_DEC="$(first_id tasks 'title = "December-only task"')"
deny  "new hire can't view another cohort's task" GET "/collections/tasks/records/$T_DEC" "$PRIYA"
deny  "new hire can't create a task" POST /collections/tasks/records "$PRIYA" \
  "{\"cohort\":\"$NOV\",\"title\":\"Rogue task\",\"owner_type\":\"new_hire\"}"
deny  "new hire can't edit a task" PATCH "/collections/tasks/records/$T_HANDBOOK" "$PRIYA" '{"title":"defaced"}'
deny  "new hire can't delete a task" DELETE "/collections/tasks/records/$T_HANDBOOK" "$PRIYA"

# ---------- progress: ownership ----------

section "progress: whose rows"
count "new hire sees only her own 5 rows" 5 /collections/progress/records "$PRIYA"
deny  "new hire can't view someone else's row" GET "/collections/progress/records/$MARCUS_HANDBOOK_ROW" "$PRIYA"
deny  "new hire can't update someone else's row" PATCH "/collections/progress/records/$MARCUS_HANDBOOK_ROW" "$PRIYA" '{"status":"done"}'
deny  "new hire can't create a row for someone else" POST /collections/progress/records "$PRIYA" \
  "{\"user\":\"$MARCUS_ID\",\"task\":\"$T_LAB\",\"status\":\"done\"}"
deny  "new hire can't reassign her row to someone else" PATCH "/collections/progress/records/$PRIYA_HANDBOOK_ROW" "$PRIYA" \
  "{\"user\":\"$MARCUS_ID\"}"
deny  "new hire can't move her row to another task" PATCH "/collections/progress/records/$PRIYA_HANDBOOK_ROW" "$PRIYA" \
  "{\"task\":\"$T_LAB\"}"
deny  "new hire can't delete her row" DELETE "/collections/progress/records/$PRIYA_HANDBOOK_ROW" "$PRIYA"
deny  "new hire can't create a row on another cohort's task" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_DEC\",\"status\":\"done\"}"

# ---------- progress: own tasks and completed_at ----------

section "progress: own tasks, completed_at window (#3)"
allow "new hire marks her own task done, dated now" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_HANDBOOK\",\"status\":\"done\",\"completed_at\":\"$NOW\"}"
SAM_HANDBOOK_ROW="$(row_of "$SAM_ID" "$T_HANDBOOK")"
reject "a second row for the same task is refused (unique index)" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_HANDBOOK\",\"status\":\"done\"}"
deny  "new hire can't create with a backdated completed_at" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_TRAINING\",\"status\":\"done\",\"completed_at\":\"$PAST\"}"
deny  "new hire can't create with a future completed_at" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_TRAINING\",\"status\":\"done\",\"completed_at\":\"$FUTURE\"}"
deny  "new hire can't backdate an existing row" PATCH "/collections/progress/records/$SAM_HANDBOOK_ROW" "$SAM" \
  "{\"completed_at\":\"$PAST\"}"
allow "new hire unchecks her task (not_started, date cleared)" PATCH "/collections/progress/records/$SAM_HANDBOOK_ROW" "$SAM" \
  '{"status":"not_started","completed_at":""}'
allow "new hire can set her own task in progress" PATCH "/collections/progress/records/$SAM_HANDBOOK_ROW" "$SAM" \
  '{"status":"in_progress"}'

# ---------- progress: IT/manager tasks ----------

section "progress: IT and manager tasks (#2)"
deny  "new hire can't mark an IT task done" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_SSO\",\"status\":\"done\"}"
deny  "new hire can't mark a manager task in progress" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_BUDDY\",\"status\":\"in_progress\"}"
allow "new hire can flag an IT task as blocked, with a note" POST /collections/progress/records "$SAM" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_SSO\",\"status\":\"blocked\",\"note\":\"No GitHub invite yet\"}"
SAM_SSO_ROW="$(row_of "$SAM_ID" "$T_SSO")"
deny  "new hire can't clear her own blocker (blocked -> done)" PATCH "/collections/progress/records/$ELENA_SSO_ROW" "$ELENA" '{"status":"done"}'
deny  "new hire can't clear her own blocker (blocked -> not_started)" PATCH "/collections/progress/records/$SAM_SSO_ROW" "$SAM" \
  '{"status":"not_started"}'
allow "new hire can update the note on a blocked IT task" PATCH "/collections/progress/records/$SAM_SSO_ROW" "$SAM" \
  '{"note":"Pinged IT again"}'
allow "coordinator can clear a blocker (blocked -> done)" PATCH "/collections/progress/records/$ELENA_SSO_ROW" "$COORD" \
  "{\"status\":\"done\",\"completed_at\":\"$NOW\"}"
allow "coordinator can backdate completed_at" PATCH "/collections/progress/records/$SAM_HANDBOOK_ROW" "$COORD" \
  "{\"status\":\"done\",\"completed_at\":\"$PAST\"}"
allow "coordinator can create a row for any new hire" POST /collections/progress/records "$COORD" \
  "{\"user\":\"$SAM_ID\",\"task\":\"$T_BUDDY\",\"status\":\"done\"}"

# ---------- progress: cohort moves ----------

section "progress: after a cohort move (#7)"
allow "coordinator moves Marcus to December" PATCH "/collections/users/records/$MARCUS_ID" "$COORD" "{\"cohort\":\"$DEC\"}"
count "Marcus no longer sees his November rows" 0 /collections/progress/records "$MARCUS"
deny  "Marcus can't view a stale row" GET "/collections/progress/records/$MARCUS_HANDBOOK_ROW" "$MARCUS"
deny  "Marcus can't edit a stale row's note" PATCH "/collections/progress/records/$MARCUS_HANDBOOK_ROW" "$MARCUS" '{"note":"x"}'
deny  "Marcus can't flag a stale row as blocked" PATCH "/collections/progress/records/$MARCUS_HANDBOOK_ROW" "$MARCUS" \
  '{"status":"blocked"}'
count "coordinator still sees Marcus's 3 November rows" 3 \
  "/collections/progress/records?filter=$(urlencode "user = \"$MARCUS_ID\"")" "$COORD"
allow "coordinator moves Marcus back" PATCH "/collections/users/records/$MARCUS_ID" "$COORD" "{\"cohort\":\"$NOV\"}"
count "Marcus sees his 3 rows again" 3 /collections/progress/records "$MARCUS"

# ---------- own password (runs last: it ends Priya's session) ----------

section "users: changing your own password"
allow "new hire can change her own password with the current one" PATCH "/collections/users/records/$PRIYA_ID" "$PRIYA" \
  '{"oldPassword":"liftoff-demo-2026","password":"priyas-new-password","passwordConfirm":"priyas-new-password"}'
deny  "the change ends her existing session" GET "/collections/users/records/$PRIYA_ID" "$PRIYA"
reject "the old password no longer signs in" POST /collections/users/auth-with-password "" \
  '{"identity":"priya@example.com","password":"liftoff-demo-2026"}'
allow "the new password signs in" POST /collections/users/auth-with-password "" \
  '{"identity":"priya@example.com","password":"priyas-new-password"}'

# ---------- summary ----------

echo
echo "API: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
