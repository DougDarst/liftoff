#!/usr/bin/env bash
# Post-deploy check for a live Liftoff instance. READ-ONLY: it never creates or changes data.
#
#   ./tests/check-deploy.sh https://<instance>.pockethost.io
#
# Confirms the site is up, the public demo password no longer works (see TODO.md),
# signed-out visitors can't read any data, and the test-only pages weren't deployed.

set -u

URL="${1:?usage: tests/check-deploy.sh https://<instance>.pockethost.io}"
URL="${URL%/}"
PUBLIC_PASSWORD="liftoff-demo-2026"
FAIL=0

ok()  { echo "  ok    $1"; }
bad() { echo "  FAIL  $1"; FAIL=1; }

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Checking $URL"

[ "$(code "$URL/api/health")" = "200" ] && ok "API is up" || bad "API health check failed"
[ "$(code "$URL/")" = "200" ] && ok "app is served at /" || bad "app page didn't load"

for email in coordinator priya marcus elena sam; do
  status="$(code -X POST "$URL/api/collections/users/auth-with-password" \
    -H "Content-Type: application/json" -d "{\"identity\":\"$email@example.com\",\"password\":\"$PUBLIC_PASSWORD\"}")"
  if [ "$status" = "200" ]; then
    bad "$email@example.com still accepts the PUBLIC demo password: change it in the admin UI now"
  else
    ok "$email@example.com rejects the public demo password"
  fi
done

for collection in users cohorts tasks progress; do
  total="$(curl -s "$URL/api/collections/$collection/records" | jq -r '.totalItems // "error"')"
  [ "$total" = "0" ] && ok "signed-out visitors see no $collection" || bad "signed-out visitors can see $collection ($total)"
done

# PocketBase answers unknown paths with index.html (200), so check the content, not the status.
if curl -s "$URL/__test/login-as.html" | grep -q "Test-only helper"; then
  bad "test pages are reachable on the live site"
else
  ok "test pages aren't deployed"
fi

echo
if [ "$FAIL" -eq 0 ]; then echo "Deploy check passed."; else echo "DEPLOY CHECK FAILED."; fi
exit "$FAIL"
