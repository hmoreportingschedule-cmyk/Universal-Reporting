UNIVERSAL REPORTING SYSTEM — LIVE BACKEND FOUNDATION V2.2

IMPORTANT STATUS
This ZIP adds a secure backend foundation, not an already-deployed live website.
It cannot become live until you create the Cloudflare D1 databases, configure Worker secrets,
bind each department database, deploy the Worker, and connect the website frontend to this API.
The supplied V2.1 ZIP contained only an app.js patch; it did not include index.html or style.css.
Therefore this update intentionally does not overwrite the existing website UI.

ARCHITECTURE
- CONTROL_DB: central identities, departments, role assignments, customization JSON, audit log.
- One separate D1 database per department: reporting records only.
- Master Admin controls departments, users and system configuration.
- Department access is checked on the server, not trusted from browser UI.
- Passwords use PBKDF2-SHA-256 (210,000 iterations); API sessions are signed, time-limited tokens.
- CORS is open for initial integration. Before public launch, restrict Access-Control-Allow-Origin
  in src/index.js to your exact website origin.

DEPLOY
1. Install Node.js and Wrangler, then authenticate: npx wrangler login
2. From this folder:
   npx wrangler d1 create urs-control
   Replace database_id in wrangler.toml with the returned ID.
3. Apply central schema:
   npx wrangler d1 execute urs-control --remote --file=schema-control.sql
4. For EACH department, create a separate D1 database:
   npx wrangler d1 create urs-dept-CODE
   Apply: npx wrangler d1 execute urs-dept-CODE --remote --file=schema-department.sql
   Add a [[d1_databases]] binding to wrangler.toml with binding = "DEPT_CODE".
   The department's db_binding must exactly match that binding name.
5. Set secrets:
   npx wrangler secret put JWT_SECRET
   npx wrangler secret put BOOTSTRAP_SECRET
   Use long random values. Do not put secrets in HTML/JS or GitHub.
6. Deploy:
   npx wrangler deploy
7. One-time Master Admin setup (replace URL and secret):
   POST https://YOUR-WORKER.workers.dev/api/setup
   JSON: {"bootstrapSecret":"YOUR_BOOTSTRAP_SECRET","name":"Master Admin","email":"admin@example.com","password":"A-LONG-UNIQUE-PASSWORD"}
   After successful setup, remove the bootstrap secret:
   npx wrangler secret delete BOOTSTRAP_SECRET
8. Test GET /api/health and POST /api/login.

AVAILABLE API
GET  /api/health
POST /api/setup                 one-time setup, protected by BOOTSTRAP_SECRET
POST /api/login                 {email,password}
GET  /api/me                    Authorization: Bearer TOKEN
GET  /api/admin/departments     Master Admin only
POST /api/admin/departments     Master Admin only {name,code,dbBinding?}
GET  /api/admin/users           Master Admin only
POST /api/admin/users           Master Admin only {name,email,password,role,departmentId?,status?}
GET  /api/admin/config          Master Admin only
PUT  /api/admin/config          Master Admin only {key,value}
GET  /api/audit                 Master Admin only, latest 500 events
POST /api/reports               authenticated department user; report saved in that department D1

FRONTEND INTEGRATION REQUIRED
The existing V2.1 app.js uses localStorage and is explicitly demo-only. Do not use it for real
employee records. The complete website source (index.html + style.css + app.js and any other
assets) is required to wire login, token handling, Master Admin screens, reporting forms,
approval workflow and live charts to these endpoints. The API foundation does not silently
pretend that localStorage is a production database.

SECURITY / PRODUCTION CHECKLIST
- Restrict CORS to the exact production domain.
- Enable Cloudflare rate limiting / Turnstile on login and setup.
- Use HTTPS only; keep Worker secrets private.
- Add password reset, refresh/revocation, login throttling, account lockout and session logout
  before broad production use.
- Add server-side validation for every custom field and approval transition.
- Add audit events for every privileged change and report approval.
- Test department isolation with two test departments and confirm cross-department requests fail.
- Back up D1 databases and test restore before real data migration.

This backend currently provides foundation endpoints. It does NOT yet implement the complete
custom field builder CRUD, workflow designer, hierarchy CRUD, target CRUD, report listing,
approvals, CSV/PDF exports, or frontend integration. Those require the complete project source
and additional implementation/testing.
