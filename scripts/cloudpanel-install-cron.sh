#!/usr/bin/env bash
set -euo pipefail
taskRoot="${ADFIRM_DEPLOY_HOME:-$HOME/apps/adfirm-pos}"
existing="$(crontab -l 2>/dev/null || true)"
if printf '%s\n' "$existing" | grep -qF '# Adfirm native watchdog'; then
 echo 'Adfirm cron entries already exist; existing crontab preserved.'; exit 0
fi
{
 printf '%s\n' "$existing"
 echo '# Adfirm native watchdog'
 printf '@reboot /bin/bash "%s/current/scripts/cloudpanel-ensure-native.sh" >> "%s/logs/watchdog.log" 2>&1\n' "$taskRoot" "$taskRoot"
 printf '* * * * * /bin/bash "%s/current/scripts/cloudpanel-ensure-native.sh" >> "%s/logs/watchdog.log" 2>&1\n' "$taskRoot" "$taskRoot"
 printf '0 * * * * /bin/bash "%s/current/scripts/cloudpanel-backup-postgres.sh" >> "%s/logs/backup.log" 2>&1\n' "$taskRoot" "$taskRoot"
 echo '# End Adfirm native watchdog'
} | crontab -
echo 'Installed account watchdog and daily-backup check; other cron entries preserved.'
