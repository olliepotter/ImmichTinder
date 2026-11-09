#!/bin/sh
# Nightly online backup of the ImmichTinder SQLite database, keeping N copies.
#
# Runs on the TrueNAS host (System > Advanced > Cron Jobs, user root) and uses
# the better-sqlite3 copy inside the running app container, so no sqlite3
# binary or extra image is needed. The SQLite online backup API produces a
# consistent copy even while the app is writing (WAL mode).
#
# Usage: backup-db.sh [container] [keep]
#   CONTAINER  app container name (default immich-tinder)
#   KEEP       number of backups to keep (default 14)
#   BACKUP_DIR host path of /data/backups (default derived from the container)
set -eu

CONTAINER="${1:-${CONTAINER:-immich-tinder}}"
KEEP="${2:-${KEEP:-14}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="immich-tinder-${STAMP}.db"

# Find the host path behind the container's /data mount (for pruning).
if [ -z "${BACKUP_DIR:-}" ]; then
  DATA_HOST="$(docker inspect "$CONTAINER" \
    --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')"
  [ -n "$DATA_HOST" ] || { echo "no /data mount found on $CONTAINER" >&2; exit 1; }
  BACKUP_DIR="$DATA_HOST/backups"
fi

docker exec "$CONTAINER" node -e '
const fs = require("node:fs");
const Database = require("/app/.output/server/node_modules/better-sqlite3");
const src = process.env.NUXT_DATABASE_PATH || "/data/immich-tinder.db";
const dest = "/data/backups/" + process.argv[1];
fs.mkdirSync("/data/backups", { recursive: true });
const db = new Database(src, { readonly: true, fileMustExist: true });
db.backup(dest)
  .then(() => {
    db.close();
    const check = new Database(dest, { readonly: true });
    const ok = check.pragma("integrity_check", { simple: true });
    check.close();
    if (ok !== "ok") throw new Error("integrity_check: " + ok);
    console.log("backup written: " + dest);
  })
  .catch((err) => { console.error(err); process.exit(1); });
' "$NAME"

# Keep the newest $KEEP backups.
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/immich-tinder-*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r old; do
  rm -f -- "$old"
done
