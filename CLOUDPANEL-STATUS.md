# CloudPanel native staging status — 21 October 2026

- Public URL: https://pos.adfirm.net (Cloudflare → CloudPanel → localhost API).
- Host: 161.97.78.97, Ubuntu 24.04, approximately 12 GB RAM.
- Native deployment under adfirm-pos; Docker is not used and root SSH is not required for this installation.
- Node.js 22.23.4, PostgreSQL 17.11 and PM2 are account-scoped.
- API: 127.0.0.1:4100. PostgreSQL: 127.0.0.1:55432 and a private socket. Application database role is not a superuser.
- Persistent data/configuration live outside Git releases under /home/adfirm-pos/apps/adfirm-pos.
- Private shared/.env and .pgpass are mode 600. Secrets were not committed or included in web assets.
- R2 optimized WebP upload/read and CORS verified from the server.
- Valid HTTPS verified through Cloudflare and directly against the origin.
- 59 backend tests passed on the server, including loopback-only proxy trust.
- PostgreSQL concurrency, duplicate delivery, stock valuation and accounting integrity tests passed in an isolated schema.
- Public HTTPS startup, admin login/logout, authorization, demo-disabled status and web-asset secret checks passed.
- Local PostgreSQL backup checksum, isolated database restore and accounting integrity passed. The initial staging backup contains the admin account and no merchant transactions.
- PM2 manages the app. An account cron watchdog checks each minute and at reboot; an hourly backup check creates one backup per Philippine date. An entire server reboot has not been tested, to avoid disturbing other sites.

See CLOUDPANEL-NATIVE.md for operations. Off-server database copies, separate R2 recovery, log/disk monitoring, production security hardening, physical Android testing and accounting/tax review remain launch requirements. Rotate the R2 credential shared in chat before real data is uploaded. This is a staging/pilot deployment, not a production security certification.
