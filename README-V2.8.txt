UNIVERSAL REPORTING SYSTEM V2.8 — CONSOLIDATED SOURCE BUNDLE

WHAT IS INCLUDED
- Root launch page: index.html + assets/site.css
- Cloudflare Worker API: cloudflare-worker/src/index.js (V2.7 API)
- Central D1 schema and department D1 schema
- Wrangler configuration example
- Master Admin Console (V2.4 frontend)
- Reporting Portal (V2.7 frontend)
- Department review metadata migration (V2.6)

IMPORTANT SCOPE / HONEST STATUS
This ZIP consolidates all source code that has been provided/generated in this conversation.
The original full demo application source was NOT included in the earlier V2.1 upload (it contained
only an app.js patch), so this bundle cannot preserve or convert that missing original application.
The included root index.html is a new launch page linking to the two included live modules; it is
not the user's original demo dashboard.
This is a deployable source bundle, NOT a claim that it is already deployed or fully production
validated. You must deploy Worker, provision D1 databases/bindings, restrict CORS, and test it.

DEPLOYMENT OUTLINE
1. Create central D1:
   npx wrangler d1 create urs-control
   Put returned database_id in cloudflare-worker/wrangler.toml.
2. Apply central schema:
   npx wrangler d1 execute urs-control --remote --file=cloudflare-worker/schema-control.sql
3. Create a separate D1 database for EACH department. Apply:
   npx wrangler d1 execute urs-dept-CODE --remote --file=cloudflare-worker/schema-department.sql
   Add one [[d1_databases]] binding per department in wrangler.toml. The binding name must match
   the department db_binding value (e.g. DEPT_EDU).
4. For existing V2.5/V2.6 department databases, apply the V2.6 migration only if it has not
   already been applied:
   npx wrangler d1 execute urs-dept-CODE --remote --file=cloudflare-worker/migrations/0002_report_review_metadata.sql
   Do NOT apply this migration twice.
5. Set secrets:
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put BOOTSTRAP_SECRET
6. Restrict CORS in cloudflare-worker/src/index.js to your exact HTTPS domain before deployment.
7. Deploy from cloudflare-worker:
   npx wrangler deploy
8. Create the first Master Admin using POST /api/setup as documented in
   cloudflare-worker/README-DEPLOY.txt. Remove BOOTSTRAP_SECRET immediately after successful setup.
9. Upload root index.html and assets/, master-admin-console/, reporting-portal/ to your static site host.
10. Test login, department boundaries, report submission, approvals, targets, CSV export and print-to-PDF.

NO LIVE DEPLOYMENT HAS BEEN PERFORMED FROM THIS CHAT.
No real credentials, database IDs, domain bindings or Cloudflare account access were supplied.
Before using real records, complete the security checklist in cloudflare-worker/README-DEPLOY.txt.
