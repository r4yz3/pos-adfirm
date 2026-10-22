#!/usr/bin/env bash
# Initialize a new private cluster only. Existing database files are never replaced.
set -euo pipefail
umask 077
taskRoot="${ADFIRM_DEPLOY_HOME:-$HOME/apps/adfirm-pos}"
export PATH="$taskRoot/runtime/node/bin:$taskRoot/runtime/postgresql/bin:/usr/bin:/bin"
mkdir -p "$taskRoot/data" "$taskRoot/shared" "$taskRoot/run" "$taskRoot/logs"
chmod 700 "$taskRoot/run" "$taskRoot/shared"
if [ ! -f "$taskRoot/shared/.env" ]; then
 echo 'Create the private shared/.env from the prepared staging configuration first.' >&2; exit 1
fi
if [ ! -f "$taskRoot/data/postgres/PG_VERSION" ]; then
 if [ -e "$taskRoot/data/postgres" ]; then echo 'Existing unrecognized database directory; refusing to initialize.' >&2; exit 1; fi
 initdb -D "$taskRoot/data/postgres" --encoding=UTF8 --locale=C.UTF-8 --auth-local=peer --auth-host=scram-sha-256 > "$taskRoot/logs/postgres-init.log"
 cat >> "$taskRoot/data/postgres/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = '$taskRoot/run'
unix_socket_permissions = 0700
password_encryption = 'scram-sha-256'
max_connections = 50
shared_buffers = '128MB'
dynamic_shared_memory_type = mmap
log_statement = 'none'
EOF
fi
if ! pg_ctl -D "$taskRoot/data/postgres" status >/dev/null 2>&1; then
 pg_ctl -D "$taskRoot/data/postgres" -l "$taskRoot/logs/postgres.log" -w start
fi
node "$(dirname "$0")/cloudpanel-provision-db.mjs"
