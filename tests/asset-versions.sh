#!/usr/bin/env bash
# Cache busting for the frontend. On PocketHost, Cloudflare (and browsers) cache styles.css and
# app.js for 4 hours, but not index.html. So index.html loads them as "styles.css?v=<hash>" and
# "app.js?v=<hash>", where <hash> comes from the file's contents: change the file, and the URL
# changes, so visitors get the new version immediately.
#
#   ./tests/asset-versions.sh --check   exit 1 if index.html's versions are stale (run by run.sh)
#   ./tests/asset-versions.sh --fix     rewrite index.html with the current versions

set -u
cd "$(dirname "$0")/.."

MODE="${1:---check}"
INDEX="pb_public/index.html"
STALE=0

for asset in styles.css app.js; do
  want="$(shasum -a 256 "pb_public/$asset" | cut -c1-10)"
  have="$(grep -oE "${asset//./\\.}\\?v=[0-9a-f]+" "$INDEX" | head -1 | sed 's/.*?v=//')"
  if [ -z "$have" ]; then
    echo "index.html doesn't load $asset with a ?v= version" >&2
    exit 2
  fi
  if [ "$have" != "$want" ]; then
    if [ "$MODE" = "--fix" ]; then
      sed -i.bak "s/${asset//./\\.}?v=$have/$asset?v=$want/" "$INDEX" && rm -f "$INDEX.bak"
      echo "updated $asset: v=$have -> v=$want"
    else
      echo "  FAIL  $asset changed but index.html still loads ?v=$have (expected ?v=$want)"
      STALE=1
    fi
  elif [ "$MODE" != "--fix" ]; then
    echo "  ok    $asset version is current"
  fi
done

if [ "$STALE" -ne 0 ]; then
  echo "Run ./tests/asset-versions.sh --fix and commit index.html with the change." >&2
  exit 1
fi
