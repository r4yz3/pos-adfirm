# Adfirm Micro POS

Local pilot build 0.2.0: a white / powder-blue POS interface, Android package, API, and a separate super admin workspace.

For a separate pilot database without demo shortcuts, follow [LOCAL-PILOT.md](LOCAL-PILOT.md). For the installed native CloudPanel staging service, see [CLOUDPANEL-NATIVE.md](CLOUDPANEL-NATIVE.md) and [verification status](CLOUDPANEL-STATUS.md).

## Run locally

Requires Node 22.18+.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173. Choose **Try store** or **Try admin**. The development server creates sample stores and products; sample sales start at zero. Records persist in `data/adfirm.sqlite`. Sample accounts use `owner@adfirm.demo`, `admin@adfirm.demo`, and `cashier@adfirm.demo`, with password `AdfirmDemo!2026`. Demo access is explicitly disabled in production.

The application is built with React / TypeScript and Capacitor for Android. The Fastify API uses SQLite locally and has a PostgreSQL adapter and container configuration. This changes the earlier proposed Kotlin / NestJS stack to allow the same working interface to be tested in-browser and packaged for Android.

## Included

- Owner and cashier sessions; store memberships; separate super admin account.
- Account security: owners/cashiers use More â†’ Account, and super admins use System. Change passwords with current-password proof (12â€“128 characters for the new password), or sign out other sessions. Both keep the current session and revoke other API sessions. Login and password changes serialize on the user record to prevent concurrent old-password logins from surviving a password change. Security audit records never include passwords.
- Other devices learn of session revocation on their next API request. Offline records stay on those devices. Local demo shortcuts intentionally remain active in demo mode; production disables them.
- More â†’ Staff & access: create cashier accounts with a 12-character minimum password and enable/disable access per store within one business. Audit events track changes. Owners and cross-business accounts cannot be altered through these controls.
- Revoked store access is checked again inside sale posting. On a 401/403 snapshot response the app removes the cached store snapshot and clears the visible store/cart, while preserving and allowing export of pending sales. Offline devices cannot learn of revocation until they reconnect; signed image URLs retain their existing expiry.
- Multiple stores with separate products, prices, stock, customers, and ledgers.
- More â†’ Branches: owners create/edit branches in their business and compare daily sales/profit with end-of-day cash and utang balances for branches they own. New branches start empty and grant owner access only to the creator; switch branches and assign cashiers separately. Branch creation has request-ID duplicate protection.
- Owners can pause new sales per branch. Existing data and refunds remain accessible; retries of already-committed sales return the original result. Uncommitted offline sales remain blocked/queued until the owner resumes sales (and any other conflicts are resolved). Offline devices learn the pause on reconnect. A pause does not delete records or alter subscription settings.
- Product creation, camera/file photos, price editing, stock receipts, and physical stock counts.
- Native and browser barcode scanning, product search, fractional quantities, and cart.
- Sell â†’ Identify product: optional online photo matching for vegetables, meat/poultry, fruit, and other goods without barcodes. Cashiers confirm a catalog match and enter the quantity or scale weight; photos never determine weight or price. Manual no-barcode selection works without the vision service.
- Cash with change, manually verified e-wallet payments, and customer utang.
- Durable IndexedDB sale outbox; idempotent API posting; reconnect and retry. Queued price conflicts remain visible for owner review and export.
- Product costs, perpetual inventory values, operating expenses, utang collection, cash/wallet balances, and daily profit.
- Balanced double-entry journals, date-range profit and loss, balance sheet, trial-balance CSV, cash/wallet movement, and latest-500-entry ledger export.
- Owner-only sales history (latest 200 per date), partial item returns, explicit utang cancellation and cash/wallet refund splits, optional stock restoration, and immutable journal/audit entries. Returns use original sale allocations and do not rewrite the original sale date.
- Daily cash counts with expected/counted/variance, required notes for differences, and a warning when later entries affect a counted day. A count does not adjust cash automatically.
- Idempotent expenses, utang collections, refunds, and cash counts when the client supplies a stable request ID.
- Money â†’ Suppliers: store-specific supplier contacts, multi-product credit purchases, invoice references and due dates, partial cash/e-wallet payments, invoice lines, and payment history. Stock receipts use weighted costs; purchases add inventory/debt and payments settle debt without reducing profit again. Request IDs prevent duplicate receipt/payment posting. Up to 100 invoices are shown, open invoices first.
- Existing supplier debt remains unassigned. Funds can settle only unassigned debt; named invoices must be paid in Suppliers. Existing Restock remains available for cash/wallet/unassigned-credit receipts; never record the same delivery through both flows.
- Owner capital, withdrawals, cash/e-wallet transfers, and unassigned supplier debt payments with audit records and request-ID duplicate protection. Payouts check recorded funds; these entries do not change profit. Funds history shows the latest 100 movements.
- Printer inquiries sent to the platform admin; no printer required for selling.
- Admin business provisioning, store list, audit events, and a 30-day paid-plan notice setting at PHP49/store/month.
- Image pipeline ready for private Cloudflare R2, with a local development adapter.

## Cloudflare R2

Copy `.env.example` to `.env` and configure the four server-only R2 variables. Use a private bucket and a bucket-scoped read/write token. Never place credentials in `VITE_*` variables or commit `.env`.

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=adfirm-product-images
```

Restart the API after configuration. Admin â†’ System shows **Cloudflare R2** when configured. No real R2 uploads have been verified without credentials.

Image flow:

1. Authenticated owner uploads a still image to the API (10 MB / 24 megapixel limits).
2. Sharp validates the decoded format, applies orientation, resizes inside 1200Ã—1200 without enlarging, and removes EXIF metadata.
3. WebP conversion starts at quality 80, reducing quality/dimensions when needed, with a hard 200 KiB output limit. Output size varies by image; smaller images stay smaller.
4. Only the optimized `.webp` is written to R2 under a business/store-scoped key. The original is not retained.
5. Database stores image metadata and object key. Authorized readers receive a 10-minute signed GET URL. Local development uses signed image links.

Cloudflare R2 is object storage, not an image optimizer. The Node API performs the optimization before the R2 upload. Run the API in a container/Node host that supports Sharp; this implementation is not a Cloudflare Worker.

## Android

The `android/` project includes camera and barcode-scanner plugins and targets Android 8.0+ (API 26+). Open it in Android Studio, or use the portable Windows setup:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\prepare-android.ps1
npm.cmd run android:build
```

The setup downloads a checksum-verified Adoptium JDK 21 and Google's Android SDK tools under ignored `.tools/`. The debug build is copied to `artifacts/Adfirm-Micro-POS-debug.apk`.

On first launch, configure an API URL ending in `/api`. For the emulator, `http://10.0.2.2:4100/api` reaches the host API. A physical device needs a reachable server URL; use HTTPS outside trusted development networks. Debug builds allow HTTP for local testing; release builds require HTTPS. To access from a phone on your trusted LAN, start the API with `HOST=0.0.0.0` and use the PC's LAN address. Do not expose demo access to the public internet.

Release builds: provide `VITE_API_URL=https://your-api.example.com/api`, run `npm run android:sync`, and create a signed release in Android Studio. Signing keys stay outside source control. Device camera scanning and printer hardware require physical-device testing.

## Checks

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

Browser tests use installed Microsoft Edge through Playwright and a separate in-memory API. They do not change the preview's records. Screenshots are saved under ignored `artifacts/`.

## Deployment scaffold

`Dockerfile` serves the compiled app and API from Node. `compose.yaml` provides PostgreSQL and persistent database storage. Supply the variables required by Compose, then use `docker compose up --build`. Put the API behind HTTPS. The PostgreSQL and Docker path require verification on a Docker-capable host; local automated tests currently exercise SQLite.

Production startup requires PostgreSQL, allowed origins, R2 credentials, demo mode disabled, and bootstrap admin credentials (16+ characters). Startup creates the first admin only when no users exist. Use Admin â†’ Add business to create merchant accounts. Native Android's origin `https://localhost` must be in CORS_ORIGINS alongside the web origin.

## Release boundaries

This build is prepared for supervised local pilot testing. Public launch still requires:

- Hosting, domain, HTTPS, PostgreSQL concurrency/load verification, live R2 testing, versioned migration deployment, tenant-policy review, monitoring, and production backup/recovery operations. The isolated PostgreSQL concurrency test has passed on the native staging server; sustained load testing and production operations still need validation.
- Payment gateway / Play billing, subscription authorization, and subscription access enforcement. The PHP49/store/month control schedules notice only; it never charges or locks out stores.
- MFA, hardened native token storage / web sessions, email-based password recovery, and audited support-access workflows. Owner-assisted cashier resets and trusted local operator recovery are implemented.
- Accountant validation, privacy/retention review, and applicable BIR/software registration and compliant invoicing. Current receipts are transaction summaries, not tax invoices. Voids, discounts/tax configuration, cashier shifts, supplier opening-debt allocation, purchase returns/corrections, and invoice pagination remain outside this pilot.
- Physical-device camera and barcode checks, real-photo recognition accuracy tests, and optional physical printer integration. Hardware requests are inquiries, not purchases. Recognition requires separately configured credentials and provider charges; tests use a mock provider. Photos cannot measure weight. Offline photo recognition is not implemented.
- Closed-app native background sync. Sales sync on foreground, reconnect, and periodic checks while open. Unsynced records remain only on the device; preserve/export them before clearing app data. Owners can review and approve recorded offline prices with an audit reason; other invalid records still require correction.

Implemented pilot safeguards include request-ID retry protection for product creation, stock receipts/counts and hardware inquiries; service items without inventory; atomic inter-branch stock transfers; classified cash flow; record-integrity checks; owner offline reconciliation; partial/credit returns; offline photo caching; image quotas and orphan cleanup; and local SQLite backup, verification and restore tools. Clients must retain request IDs when retrying. Existing clients without IDs do not gain duplicate protection automatically. Real refunds must still be paid to the customer separately.

Treat reported profit as recorded profit: incomplete expenses, pending/offline devices, and inaccurate opening stock/costs affect it. Inventory count adjustments are shown separately in profit and loss.

Reference: [Cloudflare R2 JavaScript SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [Sharp WebP output](https://sharp.pixelplumbing.com/api-output/), [Capacitor Android setup](https://capacitorjs.com/docs/getting-started/environment-setup).

## Products without barcodes

1. Add a product with no barcode, choose a category such as Vegetables or Meat & poultry, and set its unit (kg or pc), store selling price, cost, and stock. For kg products, price and cost are per kg.
2. At Sell, choose Identify product. Cashiers can search/select manually, or take a photo and press Identify photo when online recognition is enabled.
3. Confirm one of the suggested catalog products. Enter weight from a physical scale for kg products, or a quantity. Confirm Add to sale; checkout uses the regular transaction/stock/accounting flow. No sale is created just by identifying an image.

Optional photo recognition configuration (server only):

```
VISION_ENABLED=true
VISION_OPENAI_API_KEY=your-vision-api-key
VISION_MODEL=gpt-4.1-mini
VISION_DAILY_LIMIT=30
```

The integration sends an optimized WebP photo plus store catalog IDs, names, categories, and units to OpenAI's Responses API. It does not send prices, costs, customers, or balances. It requests `store:false`; provider-side data handling still follows your API account's terms. Recognition photos are not written to R2 or the image table. Catalog product IDs and current store prices are validated by the API; results always require cashier confirmation.

The API enforces a persistent per-store daily attempt limit and request rate limit. Failed provider calls count as attempts because they may incur costs. The default limit is 30/day (Philippine dates). Vision usage has separate provider charges and is disabled by default; it is not included automatically in the planned PHP49 subscription. There is no live AI accuracy claim until credentials are configured and actual products are tested. Admin â†’ System shows whether photo recognition is configured.

Matching considers up to 250 catalog products at once. Larger catalogs must be narrowed using the name/category field. Unknown/ambiguous photos may return no match; existing catalog/manual entry remains available. A photo cannot measure weight or verify freshness.

Implementation references: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs).
