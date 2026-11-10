UNIVERSAL REPORTING SYSTEM V2.5 — LIVE REPORTING API

Update your existing Worker source with cloudflare-worker/src/index.js and deploy:
  npx wrangler deploy
No D1 schema migration is required; the V2.2 department schema already contains reports.status,
payload_json, period and created_at columns.

New endpoints:
GET  /api/report-schema[?departmentId=...]
GET  /api/reports[?departmentId=...&status=Submitted]
POST /api/reports
PUT  /api/reports/{reportId}/status[?departmentId=...]
PUT  /api/admin/departments/{departmentId}/report-schema

Access:
- User: submit reports and read own reports only.
- HOD / Department Admin: read and review reports in their own department only.
- Master Admin: select departmentId to view/review its reports and configure department report schema.
- Cross-department requests from non-Master roles are rejected server-side.

Dynamic schema format:
[
 {"key":"activity","label":"Activity Name","type":"text","required":true},
 {"key":"count","label":"Achievement","type":"number","required":true},
 {"key":"category","label":"Category","type":"select","required":false,"options":["A","B"]}
]
Supported types: text, textarea, number, date, select.
Keys must be unique and match ^[A-Za-z][A-Za-z0-9_]{0,59}$.
Schemas are stored in central D1 under report_fields:<departmentId>.
The existing global report_fields config is used as fallback.

Production warning:
Restrict CORS to your exact HTTPS website origin in src/index.js before public launch.
Enable Cloudflare login rate limiting / Turnstile. Test cross-department denial using two test departments.
