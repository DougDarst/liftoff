#!/usr/bin/env bash
# Live security demo: signs in as Priya (a new hire) and attempts six things she must not be
# able to do, printing each curl command and the server's reply. LOCAL ONLY: it uses the public
# demo password. Nothing is changed (every attempt should be refused, and the script checks).
#
#   ./tests/security-demo.sh                 # against the dev server, http://127.0.0.1:8090
#   ./tests/security-demo.sh --pause         # wait for Enter between steps (for presenting)
#   ./tests/security-demo.sh http://127.0.0.1:8091
#
# See docs/security-demo.md for the talking points.

set -u

PAUSE=""
API_BASE="http://127.0.0.1:8090"
for arg in "$@"; do
  case "$arg" in
    --pause) PAUSE=1 ;;
    *) API_BASE="${arg%/}" ;;
  esac
done
case "$API_BASE" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Refusing to run against $API_BASE: this demo uses the public demo password. Local only." >&2; exit 2 ;;
esac

API="$API_BASE/api"
J="Content-Type: application/json"
PW="liftoff-demo-2026"
REFUSED=0
ALLOWED=0

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
pause() { [ -n "$PAUSE" ] && read -r -p "  (press Enter) " _; }

# attempt "description" "curl command"  -> prints the command and reply; a 4xx reply is a refusal
attempt() {
  local desc="$1" cmd="$2" out code
  echo
  echo "  $desc"
  echo "  \$ $cmd"
  out="$(eval "$cmd -w '\n%{http_code}'")"
  code="$(tail -n1 <<<"$out")"
  echo "  $(sed '$d' <<<"$out" | jq -c . 2>/dev/null)"
  case "$code" in
    4??) echo "  -> refused ($code)"; REFUSED=$((REFUSED + 1)) ;;
    *)   echo "  -> ALLOWED ($code)  <-- this should not happen"; ALLOWED=$((ALLOWED + 1)) ;;
  esac
}

login() {
  curl -s -X POST "$API/collections/users/auth-with-password" -H "$J" \
    -d "{\"identity\":\"$1\",\"password\":\"$PW\"}" | jq -r '.token // empty'
}

curl -s "$API/health" >/dev/null || { echo "No PocketBase at $API_BASE. Start it with ./pocketbase serve" >&2; exit 2; }

# Worst case for the demo: assume Priya somehow knows Marcus's record IDs. They're random, not
# secret, so the server must refuse even when the IDs are right. Look them up as the coordinator.
COORD="$(login coordinator@example.com)"
[ -n "$COORD" ] || { echo "Couldn't sign in as the coordinator (is this the seeded local database?)" >&2; exit 2; }
lookup() {
  curl -s -G "$API/collections/$1/records" --data-urlencode "filter=$2" -H "Authorization: $COORD" | jq -r '.items[0].id // empty'
}
MARCUS_ID="$(lookup users 'email = "marcus@example.com"')"
PRIYA_ID="$(lookup users 'email = "priya@example.com"')"
MARCUS_ROW="$(lookup progress "user = \"$MARCUS_ID\" && task.title = \"Read the engineering handbook\"")"
PRIYA_ROW="$(lookup progress "user = \"$PRIYA_ID\" && task.title = \"Read the engineering handbook\"")"
LAB_TASK="$(lookup tasks 'title = "Dev environment lab: run the app locally"')"
snapshot() {
  echo "$(curl -s "$API/collections/progress/records/$MARCUS_ROW" -H "Authorization: $COORD" | jq -c '{status, updated}')" \
    "$(curl -s "$API/collections/users/records/$PRIYA_ID" -H "Authorization: $COORD" | jq -r .role)" \
    "$(curl -s "$API/collections/progress/records/$PRIYA_ROW" -H "Authorization: $COORD" | jq -r .user)" \
    "$(curl -s -G "$API/collections/users/records" --data-urlencode 'filter=email = "intruder@example.com"' -H "Authorization: $COORD" | jq .totalItems)"
}
BEFORE="$(snapshot)"

sleep 3 # sign-ins are rate limited to 2 per 3 seconds

bold "0. Sign in as Priya, a new hire"
echo "  \$ TOKEN=\$(curl -s -X POST \$API/collections/users/auth-with-password -d '{\"identity\":\"priya@example.com\",...}' | jq -r .token)"
TOKEN="$(login priya@example.com)"
[ -n "$TOKEN" ] || { echo "  Couldn't sign in as Priya (rate limited? wait 3 seconds and rerun)" >&2; exit 2; }
echo "  -> signed in as a new_hire"
pause

bold "1. List all users"
echo
echo "  \$ curl -s \$API/collections/users/records -H \"Authorization: \$TOKEN\""
echo "  $(curl -s "$API/collections/users/records" -H "Authorization: $TOKEN" | jq -c '{totalItems, emails: [.items[].email]}')"
echo "  -> she sees only herself"
pause

bold "2. Read Marcus's progress"
echo
echo "  \$ curl -s -G \$API/collections/progress/records --data-urlencode 'filter=user=\"\$MARCUS_ID\"' -H \"Authorization: \$TOKEN\""
echo "  $(curl -s -G "$API/collections/progress/records" --data-urlencode "filter=user = \"$MARCUS_ID\"" -H "Authorization: $TOKEN" | jq -c '{totalItems}')"
echo "  -> an empty list, not an error"
attempt "Fetch one of Marcus's rows by ID:" \
  "curl -s \$API/collections/progress/records/\$MARCUS_ROW -H \"Authorization: \$TOKEN\""
pause

bold "3. Mark one of Marcus's tasks done"
attempt "Update his existing row:" \
  "curl -s -X PATCH \$API/collections/progress/records/\$MARCUS_ROW -H \"Authorization: \$TOKEN\" -H \"\$J\" -d '{\"status\":\"done\"}'"
attempt "Create a new row in his name:" \
  "curl -s -X POST \$API/collections/progress/records -H \"Authorization: \$TOKEN\" -H \"\$J\" -d \"{\\\"user\\\":\\\"\$MARCUS_ID\\\",\\\"task\\\":\\\"\$LAB_TASK\\\",\\\"status\\\":\\\"done\\\"}\""
pause

bold "4. Make herself a coordinator"
attempt "Set her own role:" \
  "curl -s -X PATCH \$API/collections/users/records/\$PRIYA_ID -H \"Authorization: \$TOKEN\" -H \"\$J\" -d '{\"role\":\"coordinator\"}'"
pause

bold "5. Move her own progress row to Marcus"
attempt "Reassign the row's user:" \
  "curl -s -X PATCH \$API/collections/progress/records/\$PRIYA_ROW -H \"Authorization: \$TOKEN\" -H \"\$J\" -d \"{\\\"user\\\":\\\"\$MARCUS_ID\\\"}\""
pause

bold "6. Create an account via public sign-up (no token at all)"
attempt "Sign up as a coordinator:" \
  "curl -s -X POST \$API/collections/users/records -H \"\$J\" -d '{\"email\":\"intruder@example.com\",\"password\":\"abcdefgh12\",\"passwordConfirm\":\"abcdefgh12\",\"role\":\"coordinator\"}'"
pause

bold "Did anything change? (checked as the coordinator)"
AFTER="$(snapshot)"
if [ "$BEFORE" = "$AFTER" ]; then
  echo "  No: Marcus's row, Priya's role, her row's owner, and the user list are all unchanged."
else
  echo "  YES, something changed:"; echo "  before: $BEFORE"; echo "  after:  $AFTER"; ALLOWED=$((ALLOWED + 1))
fi

echo
echo "$REFUSED attempts refused, $ALLOWED allowed."
[ "$ALLOWED" -eq 0 ]
