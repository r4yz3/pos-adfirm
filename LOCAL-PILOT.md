# Adfirm Micro POS — local pilot 0.3.1

Prepared for supervised local testing. The white and pastel-blue app includes multi-store selling, inventory, utang, suppliers, accounting reports, returns, stock transfers, and a separate web super admin. It starts free. The future ₱49/store/month setting displays notice only; billing is not active.

## Start a private pilot

Requires Node 22.18+ and installed project dependencies.

```powershell
npm.cmd ci
npm.cmd run build
powershell -ExecutionPolicy Bypass -File scripts\start-pilot.ps1
```

Open `http://127.0.0.1:4101`. On the first run, enter an admin email and a unique password of at least 16 characters in the terminal. Demo shortcuts and photo AI are disabled. Records are separate from the development demo, in `data/pilot/adfirm.sqlite`; optimized photos are in `data/pilot/images`. Keep the terminal running. Ctrl+C stops the server.

Sign in as super admin in the browser. Use **Add business** to create a merchant owner and first store. Sign in as that owner, add products and opening stock/costs, record opening cash through Funds, add customers and suppliers as needed, and assign cashiers through Staff & access. Create additional branches through Branches; each starts with an empty catalog. Transfers require matching products in both branches.

For vegetables or chicken, select kg and enter prices/costs per kg. Cashiers select the product manually and enter physical-scale weight. Online photo suggestions need separately configured vision credentials and field testing; they always require confirmation. Services use the service unit, with no stock or inventory cost.

## Android testing

Install the updated `artifacts/Adfirm-Micro-POS-debug.apk` on a test Android 8+ device. Start the pilot on a trusted local network:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-pilot.ps1 -Lan
```

The standard APK connects to `https://pos.adfirm.net/api`. For a separate LAN test, rebuild with `VITE_API_URL=http://<PC-LAN-IP>:4101/api` in the build environment; an emulator can use `http://10.0.2.2:4101/api`. Keep the PC and phone on the same trusted network, and allow the API through the PC firewall only there. The PC must remain running. This debug APK permits local HTTP; public distribution requires HTTPS and a signed release package. Super admin access belongs in the web app.

No thermal printer is required. Printer offers create inquiries; actual printer pairing/printing is not implemented.

## Daily checks

- Confirm correct store, product prices, opening inventory costs and cash before selling.
- Test cash/change, wallet confirmation, utang and collection, a weighed item, expense, and a partial return.
- Review Profit, Cash flow and cash count. Reports depend on complete and accurate entries. Receipts are transaction summaries, not tax invoices.
- Test offline selling, then reopen/reconnect and confirm Pending reaches zero. Sync runs while open or on returning to the app; closed-app background sync is not implemented.
- For blocked prices, export pending sales and let the owner review them in Sync. Approval preserves recorded price and requires a reason. Never uninstall, clear app data or lose the device while it has pending sales.
- In web Admin → System, run Check records. A successful check verifies recorded ledger consistency; it does not prove that every physical transaction was entered.

## Backup and recovery

Back up daily and before upgrades. Stop writes for the backup window so database and copied images represent the same period. Keep backup folders private; they contain business records and password hashes. Copy them to a separate secured location.

```powershell
npm.cmd run backup -- data/pilot/adfirm.sqlite data/pilot/images
npm.cmd run backup:verify -- "backups/<created-folder>"
npm.cmd run backup:restore -- "backups/<created-folder>" "restored-data/pilot-recovery"
npm.cmd run check:records -- "restored-data/pilot-recovery/adfirm.sqlite"
```

Restore only to a new directory; the tool refuses to overwrite existing data. Stop the API before switching to restored data. Start using `-DataDirectory restored-data/pilot-recovery`. Local backups do not contain unsynced device sales, R2 objects, or credentials from environment configuration. Database checksums cover the SQLite file; copied image files are not individually checksummed.

An owner can reset a cashier password in Staff & access with the owner's current password. A trusted PC operator can recover a local account without printing the new password:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\reset-local-password.ps1 -Database data/pilot/adfirm.sqlite -Email owner@example.com
```

Recovery revokes that account's sessions and is audited. Filesystem access to this PC grants powerful administrative access; restrict it accordingly.

`npm.cmd run images:cleanup` previews old unreferenced images. Adding `-- --apply` deletes eligible objects; use the correct storage configuration and a verified backup first.

## Release checks and boundaries

Run `npm.cmd test`, `npm.cmd run build`, `npm.cmd run test:pilot` and `npm.cmd run test:e2e`. The browser tests use isolated records. `npm.cmd run test:postgres` requires a dedicated TEST_DATABASE_URL and otherwise reports SKIP. Build the APK with `npm.cmd run android:build`.

Before public launch: provision hosting/domain/HTTPS and R2, verify PostgreSQL and restore operations on the real infrastructure, test real camera/scanner devices and photo accuracy, review security/privacy and accounting/tax requirements, and produce a securely signed release. Subscription collection and printer integration require separate implementation. See README Release boundaries for detail.
