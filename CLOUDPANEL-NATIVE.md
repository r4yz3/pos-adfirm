# CloudPanel native staging deployment

This deployment runs without Docker under the existing `adfirm-pos` Linux account. The app, PostgreSQL and backups share that account's filesystem permissions. A compromised site account could access its database files and secrets; account isolation is not a substitute for application security hardening.

## Layout

Root: `/home/adfirm-pos/apps/adfirm-pos`

- `runtime/node`: checksum-verified Node.js 22.23.4 from nodejs.org.
- `runtime/postgresql`: PostgreSQL 17.11 built from checksum-verified official source, with OpenSSL. ICU, readline and zlib are disabled to avoid system package installation; backup archives use the available PostgreSQL build's default compression support.
- `runtime/pm2`: account-local PM2.
- `shared/.env`: private application configuration, mode 600; never committed.
- `data/postgres`: persistent database cluster, separate from releases.
- `run`: private database socket and watchdog lock directory.
- `releases/<commit>`: source, dependencies and compiled web assets.
- `current`: active release symlink.
- `backups/<Philippine-date>`: PostgreSQL archive and checksum. These do not include R2 images, unsynced devices or configuration secrets.

The API listens on `127.0.0.1:4100`. PostgreSQL listens on `127.0.0.1:55432` and a private Unix socket. CloudPanel proxies `pos.adfirm.net` to the API. Keep public database/application ports closed. A valid TLS certificate is required.

## Installation

Run `bash scripts/cloudpanel-user-runtime.sh` as the site user. This installs inside the app directory only; it does not grant sudo, alter other sites or install system services. Source package versions are pinned in that script and must be reviewed and updated for security releases.

Place the prepared private configuration in `shared/.env`, then run `bash scripts/cloudpanel-init-native-db.sh`. It refuses to overwrite an unrecognized database directory. It creates the non-superuser `adfirm_app` database role, database and private connection/passfile. Local administrative access uses Unix peer authentication; TCP requires SCRAM passwords.

After building a release, link `current` to it and its `.env` to `shared/.env`. Start with `bash scripts/cloudpanel-ensure-native.sh`. A dedicated PM2 process list manages the API. A site-user cron entry runs the watchdog each minute and at reboot; recovery therefore may take about a minute after a process/reboot failure. This is not high availability.

The API trusts forwarded client addresses only from loopback when `TRUST_PROXY=loopback`; this is enabled in the native PM2 configuration. Keep CloudPanel/NGINX forwarding client addresses correctly, especially if Cloudflare proxying is enabled.

## Operations

Run the commands as `adfirm-pos`, with:

```bash
export PATH=/home/adfirm-pos/apps/adfirm-pos/runtime/node/bin:/home/adfirm-pos/apps/adfirm-pos/runtime/postgresql/bin:$PATH
export PM2_HOME=/home/adfirm-pos/apps/adfirm-pos/pm2
```

PM2 executable: `/home/adfirm-pos/apps/adfirm-pos/runtime/pm2/node_modules/.bin/pm2`.

Run `pm2 status`, `pm2 logs adfirm-pos --lines 30`, or `pm2 restart adfirm-pos` using that executable. Do not print `.env` or PM2 environment dumps into shared logs.

`bash current/scripts/cloudpanel-backup-postgres.sh` creates at most one successful local backup per Philippine date. The scheduled hourly check creates a new daily backup after the previous Philippine date changes. It preserves existing backups; monitor disk usage and arrange secure off-server copies and retention. Back up R2 separately. A database checksum alone does not verify a full restore.

Before changing releases, take a verified backup and run the PostgreSQL integration test using a dedicated test schema. Never clear or recreate `data/postgres`. Database schema startup changes do not provide a complete rollback/migration system. Check schema compatibility before switching back to an older release.

## Launch boundaries

This remains a staging/pilot deployment. Complete session/device storage hardening, admin MFA, independent security testing, accountant/tax review, physical Android testing and production backup monitoring before onboarding real stores. Rotate any R2 credential shared in chat. Photo AI is disabled; subscription charging and thermal printer integration are not active.
