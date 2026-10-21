# CloudPanel staging setup — 21 October 2026

- Host: 161.97.78.97, Ubuntu 24.04, approximately 12 GB RAM.
- DNS: pos.adfirm.net resolves to the host.
- SSH: adfirm-pos works; root SSH is denied. Site-user sudo is restricted to CloudPanel's site-user wrapper.
- Source uploaded to /home/adfirm-pos/apps/adfirm-pos/staging (outside htdocs).
- Private .env is mode 600, with R2 settings mapped to R2_ACCOUNT_ID/R2_BUCKET, generated database/signing secrets and bootstrap admin@adfirm.net. Credentials are not in source.
- R2 bucket access and optimized WebP write/read verified. Only the test's own diagnostic object was deleted afterward.
- R2 CORS verified for https://pos.adfirm.net and https://localhost (GET/HEAD).
- Production web build passed locally. Docker build and PostgreSQL deployment have not run.
- Docker, Node.js and PostgreSQL were not found on the server. Runtime is not started.
- Origin TLS is still self-signed. CloudPanel site-user CLI cannot issue the certificate; admin action is needed.

Next: obtain authorized root/admin SSH access, review and run scripts/cloudpanel-install-docker.sh, then deploy with the dedicated Compose project. Verify PostgreSQL tests, R2 from the server, reverse proxy and a trusted TLS certificate before opening the service to merchants. Do not alter unrelated CloudPanel sites.

The R2 credential shared in chat must be rotated before real data is uploaded. Replace it directly in the private server environment and recreate the API container. The prepared initial admin password is private in the staging environment file; change it after first login.
