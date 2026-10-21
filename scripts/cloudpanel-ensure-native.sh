#!/usr/bin/env bash
# Account cron watchdog. Uses only this deployment's private runtime and process list.
set -euo pipefail
umask 077
taskRoot="${ADFIRM_DEPLOY_HOME:-$HOME/apps/adfirm-pos}"
mkdir -p "$taskRoot/run" "$taskRoot/logs"
exec 9>"$taskRoot/run/watchdog.lock"
flock -n 9 || exit 0
export PATH="$taskRoot/runtime/node/bin:$taskRoot/runtime/postgresql/bin:/usr/bin:/bin"
export PM2_HOME="$taskRoot/pm2"
if ! pg_ctl -D "$taskRoot/data/postgres" status >/dev/null 2>&1; then
 pg_ctl -D "$taskRoot/data/postgres" -l "$taskRoot/logs/postgres.log" -w start 9>&-
fi
pm2="$taskRoot/runtime/pm2/node_modules/.bin/pm2"
if ! "$pm2" pid adfirm-pos 9>&- 2>/dev/null | grep -Eq '^[1-9][0-9]*$'; then
 "$pm2" start "$taskRoot/current/scripts/cloudpanel-ecosystem.config.cjs" 9>&-
 "$pm2" save 9>&-
fi
