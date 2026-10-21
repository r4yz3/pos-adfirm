#!/usr/bin/env bash
# Daily local PostgreSQL backup; off-server copies are a separate operator task.
set -euo pipefail
umask 077
taskRoot="${ADFIRM_DEPLOY_HOME:-$HOME/apps/adfirm-pos}"
export PATH="$taskRoot/runtime/postgresql/bin:/usr/bin:/bin"
export PGPASSFILE="$taskRoot/shared/.pgpass"
mkdir -p "$taskRoot/backups" "$taskRoot/run"
exec 9>"$taskRoot/run/backup.lock"
flock -n 9 || exit 0
day="$(TZ=Asia/Manila date +%F)"
destination="$taskRoot/backups/$day"
if [ -f "$destination/adfirm.dump.sha256" ]; then exit 0; fi
mkdir -p "$destination"
pg_dump --host=127.0.0.1 --port=55432 --username=adfirm_app --dbname=adfirm --format=custom --file="$destination/adfirm.dump.pending"
mv "$destination/adfirm.dump.pending" "$destination/adfirm.dump"
cd "$destination"
sha256sum adfirm.dump > adfirm.dump.sha256
echo "Backup complete: $day (Philippine date). R2 objects and unsynced devices are not included."
