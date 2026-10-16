#!/usr/bin/env bash
# Post-deploy check for a live Liftoff instance. READ-ONLY: it never creates or changes data.
#
#   ./tests/check-deploy.sh https://<instance>.pockethost.io
#
# Confirms the site is up, the public demo password no longer works (see TODO.md), sign-in
# attempts are rate limited, signed-out visitors can't read any data, and the test-only pages
# weren't deployed. (It sends a few deliberately wrong sign-ins; nothing is created or changed.)

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

# Sign-ins are rate limited (2 per 3s per IP), so space the attempts out. A 429 proves nothing
# about the password, so it counts as a failure to verify, not a pass.
for email in coordinator priya marcus elena sam; do
  sleep 2
  status="$(code -X POST "$URL/api/collections/users/auth-with-password" \
    -H "Content-Type: application/json" -d "{\"identity\":\"$email@example.com\",\"password\":\"$PUBLIC_PASSWORD\"}")"
  case "$status" in
    200) bad "$email@example.com still accepts the PUBLIC demo password: change it in the admin UI now" ;;
    400) ok "$email@example.com rejects the public demo password" ;;
    429) bad "$email@example.com: rate limited, couldn't verify the password (run again in a minute)" ;;
    *)   bad "$email@example.com: unexpected response $status" ;;
  esac
done

# Rapid wrong-password attempts against a non-existent account should be throttled.
sleep 3
throttled=""
for _ in 1 2 3 4 5 6; do
  status="$(code -X POST "$URL/api/collections/users/auth-with-password" \
    -H "Content-Type: application/json" -d '{"identity":"check-deploy@example.invalid","password":"not-a-real-password"}')"
  [ "$status" = "429" ] && throttled=1
done
[ -n "$throttled" ] && ok "rapid sign-in attempts are throttled" \
  || bad "rapid sign-in attempts are NOT throttled: check Settings > Rate limits in the admin UI"

for collection in users cohorts tasks progress; do
  total="$(curl -s "$URL/api/collections/$collection/records" | jq -r '.totalItems // "error"')"
  [ "$total" = "0" ] && ok "signed-out visitors see no $collection" || bad "signed-out visitors can see $collection ($total)"
done

# What a visitor actually gets: follow the exact ?v= links in the live page (through Cloudflare's
# cache, no cache-busting of our own) and check each file's content matches its version hash.
page="$(curl -s "$URL/")"
for asset in styles.css app.js; do
  version="$(grep -oE "${asset//./\\.}\\?v=[0-9a-f]+" <<<"$page" | head -1 | sed 's/.*?v=//')"
  if [ -z "$version" ]; then
    bad "the live page doesn't load $asset with a ?v= version (stale index.html?)"
    continue
  fi
  served="$(curl -s "$URL/$asset?v=$version" | shasum -a 256 | cut -c1-${#version})"
  [ "$served" = "$version" ] && ok "visitors get the current $asset (v=$version)" \
    || bad "visitors get a stale $asset: page asks for v=$version, content is $served"
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
