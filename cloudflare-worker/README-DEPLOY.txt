UNIVERSAL REPORTING SYSTEM V2.7 — ADVANCED REPORTS & TARGET ANALYTICS

Worker update:
- Replace cloudflare-worker/src/index.js in your Worker project.
- No D1 schema migration is required for V2.7; it uses existing V2.6 tables and system_config.

Deploy:
  npx wrangler deploy

Website update:
Replace only:
- /reporting-portal/index.html
- /reporting-portal/style.css
- /reporting-portal/app.js

V2.7 API additions:
PUT /api/admin/departments/{departmentId}/targets
  Master Admin only; body { "period":"2026-11", "target":250, "unit":"approved reports" }
GET /api/analytics/target?departmentId=...&period=2026-11
  Department users see only their own department. Master Admin supplies departmentId.
GET /api/analytics/department-comparison?period=2026-11
  Master Admin only; compares all active departments' approved reports with configured targets.

Target calculation:
- Achievement = number of Approved reports for the selected period.
- Achievement % = approved / target * 100.
- Submitted and rejected reports do not count as achieved.
- If no target is configured, target and achievement percentage show as zero.

Portal:
- Target vs Achievement panel.
- Master Admin can set target per department and period.
- Master Admin can compare all active departments.
- CSV export of the reports currently returned by the API (maximum 500).
- Print / Save PDF uses the browser print dialog; select "Save as PDF".

Security:
- Target changes are Master Admin-only and audited.
- Department comparison is Master Admin-only.
- Target analytics enforce department isolation.
- Restrict CORS to your exact production domain before live public use.
