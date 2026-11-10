# Universal Reporting System V.1 — Foundation Demo

## What works now
- Responsive premium blue/white dashboard with animated KPI/chart bars.
- Sidebar navigation and department overview.
- Create demo departments, users, custom fields, hierarchy levels, and targets.
- Edit user name, department, role and status.
- Delete users with confirmation; preserve report history by deactivating users who have reports.
- Reactivate inactive users through Edit.
- Create local monthly report drafts.
- Export demo records as JSON; reset demo data.
- Browser localStorage persistence (same browser/device only).

## Run
Open `index.html` in Chrome/Edge, or serve the folder with a basic static server. No installation or build step required.

## Cloudflare deployment
This is a **static frontend prototype**, not a deployed production system. User changes are stored in this browser only. You may publish these files using Cloudflare Pages or static assets on Workers. Backend functionality is not present.

## Not implemented yet
Secure login/authentication; real roles/permissions; server/database synchronization; independent department databases; daily/weekly/quarterly/yearly report forms; percentage-wise target allocation; approval workflow; notifications; real Excel/PDF export; multi-user editing; production analytics. UI labels do not imply those features are implemented.

## Security
Do NOT enter real employee records, passwords or sensitive reports into this demo. localStorage is not secure storage. No backend endpoints exist.

## Next development milestone
Cloudflare Worker API + database migrations + secure authentication + RBAC, then department configuration, report templates, target allocations and four-stage approval.

## Versioning
This is V.1 foundation package. Future releases should include only changed files with exact replacement paths.
