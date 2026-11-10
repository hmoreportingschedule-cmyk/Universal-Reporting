UNIVERSAL REPORTING SYSTEM V2.4 — BACKEND UPDATE

Replace your deployed Worker source with cloudflare-worker/src/index.js from this package,
then deploy from your existing Worker project with:
  npx wrangler deploy

No D1 schema migration is required for V2.4.

New endpoints:
PUT   /api/admin/users/{userId}
  JSON: {name,email,role,departmentId,status,password?}
  password is optional; if supplied it must be 12+ characters.
PATCH /api/admin/users/{userId}
  JSON: {status:"Active"|"Inactive"}
GET   /api/department/users
  Department Admin/HOD: own department only.
  Master Admin: supply ?departmentId=DEPARTMENT_ID.

All user mutations are Master Admin-only and audited. A Master Admin cannot deactivate
their own account or remove their own Master Admin role. Existing V2.3 Master Admin console
now includes Edit and Activate/Deactivate actions.

IMPORTANT: CORS must be restricted to your exact website domain before public production use.
Department database bindings must already be provisioned for report submissions.
