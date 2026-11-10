URS V2.5 LIVE REPORTING PORTAL

Copy this entire folder to your website root as /reporting-portal/.
Open https://YOUR-DOMAIN/reporting-portal/

Master Admin:
- Sign in using Master Admin credentials.
- Select a department.
- Configure its report fields using JSON. Example:
[
 {"key":"activity","label":"Activity Name","type":"text","required":true},
 {"key":"work_date","label":"Work Date","type":"date","required":true},
 {"key":"count","label":"Achievement","type":"number","required":true},
 {"key":"category","label":"Category","type":"select","required":true,"options":["A","B","C"]}
]
- Save Department Fields. Form fields are then rendered dynamically.

Users:
- Submit reports for their assigned department.
- View their own reports.

HOD / Department Admin:
- View department reports.
- Approve or reject submitted reports.

Master Admin can select a department to view its reports. Backend checks department context and role.
Deploy V2.5 Worker source before using this portal. No SQL schema change is required.
