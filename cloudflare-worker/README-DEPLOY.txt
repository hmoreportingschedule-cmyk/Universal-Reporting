UNIVERSAL REPORTING SYSTEM V2.6 — APPROVAL + ANALYTICS

1. Replace Worker source with cloudflare-worker/src/index.js.
2. Apply migration ONCE to EACH existing department D1 database:
   npx wrangler d1 execute urs-dept-CODE --remote --file=cloudflare-worker/migrations/0002_report_review_metadata.sql
   Repeat for every department database. Do NOT run twice; SQLite ALTER TABLE will report duplicate columns.
3. For newly created department databases, use updated schema-department.sql instead of the old schema.
4. Deploy Worker: npx wrangler deploy
5. Replace reporting portal files: /reporting-portal/index.html, style.css, app.js.

New API:
GET /api/analytics/summary[?departmentId=...]
GET /api/analytics/ranking[?departmentId=...]
PUT /api/reports/{reportId}/status[?departmentId=...]
Review body: {"status":"Approved"|"Rejected","note":"optional review note"}

Dashboard:
- HOD / Department Admin: own department summary, pending/approved/rejected counts, trend and contributor ranking.
- Master Admin: select a department and view its dashboard.
- Review notes and reviewer/time are stored in department DB.
- Review and analytics endpoints enforce department context server-side.

IMPORTANT: This is a department reporting approval workflow, not a separate task assignment module.
Restrict CORS to your production origin and test two departments before live launch.
