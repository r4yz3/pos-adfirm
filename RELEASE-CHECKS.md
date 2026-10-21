# Local pilot verification — 0.2.0

Verified locally on Windows, 21 October 2026.

| Check | Result |
| --- | --- |
| Backend API tests | 58 passed, 0 failed |
| TypeScript / Vite build | Passed |
| Browser workflow and responsive checks | Passed; no browser errors |
| Separate pilot startup | Passed; bootstrap/login, demo disabled, local storage and integrity |
| Current database integrity | Passed; inventory and receivable differences zero |
| SQLite backup / restore drill | Passed into a separate directory; original data preserved |
| Production dependency audit | 0 vulnerabilities reported |
| Android debug build | Passed; versionCode 2, versionName 0.2.0 |
| APK signature verification | Passed with Android apksigner |
| PostgreSQL integration test | SKIPPED: no TEST_DATABASE_URL |
| CI workflow | Prepared; not executed on a remote runner |
| Live R2 and vision provider | Not tested; no credentials configured |
| Physical camera/scanner/printer | Not verified on hardware |

The browser suite covers cash validation, checkout, expenses, accounting reports, funds, suppliers and invoice payment, WebP optimization, weighed/manual/photo-confirmed products with a mock provider, offline sync and owner reconciliation, partial returns, services, stock transfers, staff resets, branches, revoked access, session security, admin controls and responsive layouts.

APK: `artifacts/Adfirm-Micro-POS-debug.apk`

SHA-256: `5EFD042F1B0BA97BA6FCE97D69A18A4BF78B0E83B29A5431E9AF9A094EC0BCFD`

One browser run timed out on the initial button while the native build was running. The subsequent complete browser run passed. No test failure was hidden or converted to a passing assertion.

These results support supervised local pilot testing. They do not certify production financial/tax compliance or live infrastructure. Follow LOCAL-PILOT.md and the README release boundaries before using real merchant records or publishing a release.
