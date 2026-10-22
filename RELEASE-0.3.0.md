# Adfirm Micro POS 0.3.0

Release validation: 22 October 2026, Asia/Manila.

## Changes

Direct barcode scanning in Add/Edit product, native file exports, full product editing with recorded inventory adjustments, owner business/store creation, larger text and controls, product insights and utang history.

Admin adds registered devices, active/manual plan counts, accounts, audit pagination, printer status, and store sales controls. Manual plan records do not charge a customer. Device counts begin with first sign-in on this version; they do not count downloads or detect uninstalls.

## Checks

- 67 backend tests passed, including permissions, inventory ledger consistency, retry/stale-edit handling, exact product return allocation, owner isolation and audit cursors.
- Both browser suites passed. The new suite decodes an actual generated EAN-13 barcode photo inside Add product, downloads and reads CSV files, edits metadata/photo/cost/stock, sells the scanned product, checks metrics, collects utang, creates a business/store and exercises admin controls.
- Mobile layouts checked at 320 and 390 pixels; editor inputs are at least 16 pixels. No browser errors were observed.
- PostgreSQL schema, concurrency, retries, edits, product insights, registered devices, manual plans and owner-created businesses passed in an isolated schema on the native server.
- Pilot startup passed with demo shortcuts disabled. Production dependency audit reported zero vulnerabilities.

## Physical-device checks

Android camera focus, camera permission flows, the native file/share sheet and installation over the previous APK still require testing on a real phone. Browser barcode-photo decoding is verified; it is not a substitute for camera hardware testing.

Update the existing installation to keep device records. Do not uninstall or clear app data while sales are pending. New Android installations default to https://pos.adfirm.net/api; existing API settings are retained.

Units stay locked after stock or sales to preserve historical meaning. Subscription charging, printer integration and production security hardening remain outside this staging release.
