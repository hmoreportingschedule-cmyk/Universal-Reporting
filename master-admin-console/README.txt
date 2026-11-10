URS V2.3 MASTER ADMIN CONSOLE

This is an ADDITIVE admin console. It does not replace your existing public/employee UI.
Open index.html via your HTTPS website origin or local test server. Enter the deployed Worker URL,
then sign in using a Master Admin account.

Features:
- Master Admin login against live Worker API
- Create departments (department D1 must be separately provisioned)
- Create users with roles: Master Admin, Department Admin, HOD, User
- View department and user directories
- Configure report fields, hierarchy, approval workflow, dashboard layout, targets and system settings
- Configuration stored in central D1 using /api/admin/config

Important:
- Frontend console uses localStorage nowhere for persistent business data; session token exists only in page memory.
- JSON customizations are stored, but existing report UI does not yet dynamically render these schemas.
- This is not the complete production workflow. Existing frontend integration, editing/deactivation, password reset,
  approval endpoints, report listing, validation, login rate limiting, audit for all actions and security testing remain.
- Before public use, set CORS to your exact domain and deploy all department D1 bindings.

V2.4 additions:
- Edit user name, email, role, department, status
- Optional password reset during edit (12+ characters)
- Activate/deactivate account with confirmation
- Self-protection: a Master Admin cannot deactivate themselves or remove their own Master Admin role
- Server-side department user directory endpoint: GET /api/department/users
  Department Admin/HOD can only query their own department; Master Admin must supply ?departmentId=...
- All user edits and status changes write audit events.
