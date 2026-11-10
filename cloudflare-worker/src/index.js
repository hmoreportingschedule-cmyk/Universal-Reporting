const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: {...cors, "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store"}
});
const fail = (message, status=400) => json({ok:false,error:message},status);
const enc = s => new TextEncoder().encode(s);
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map(x=>parseInt(x,16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw",enc(password),"PBKDF2",false,["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},key,256);
  return {salt:[...salt].map(x=>x.toString(16).padStart(2,"0")).join(""),hash:b64(bits)};
}
async function verifyPassword(password,salt,expected) {
  const actual=await hashPassword(password,salt); return actual.hash===expected;
}
async function sign(payload,secret) {
  const body=b64(enc(JSON.stringify(payload)));
  const key=await crypto.subtle.importKey("raw",enc(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return body+"."+b64(await crypto.subtle.sign("HMAC",key,enc(body)));
}
async function auth(req,env) {
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return null;
  const [body,sig]=token.split(".");
  if(!body||!sig) return null;
  const key=await crypto.subtle.importKey("raw",enc(env.JWT_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  if(!await crypto.subtle.verify("HMAC",key,unb64(sig),enc(body))) return null;
  let u; try{u=JSON.parse(new TextDecoder().decode(unb64(body)))}catch{return null}
  if(!u.exp||u.exp<Date.now()/1000) return null;
  const row=await env.CONTROL_DB.prepare("SELECT id,name,role,department_id,status FROM users WHERE id=?").bind(u.sub).first();
  return row&&row.status==="Active"?row:null;
}
const isMaster=u=>u?.role==="Master Admin";
const id=prefix=>prefix+"_"+crypto.randomUUID().replace(/-/g,"");
async function body(req){try{return await req.json()}catch{return null}}
async function route(req,env) {
  if(req.method==="OPTIONS") return new Response(null,{headers:cors});
  if(!env.CONTROL_DB||!env.JWT_SECRET) return fail("Worker secrets/database bindings are not configured",503);
  const url=new URL(req.url), path=url.pathname.replace(/\/+$/,"")||"/";
  if(path==="/api/health"&&req.method==="GET") return json({ok:true,service:"URS Live API",version:"2.4",mode:"live-backend"});
  if(path==="/api/setup"&&req.method==="POST") {
    const x=await body(req);
    if(!x||!env.BOOTSTRAP_SECRET||x.bootstrapSecret!==env.BOOTSTRAP_SECRET) return fail("Invalid setup authorization",403);
    const count=await env.CONTROL_DB.prepare("SELECT COUNT(*) n FROM users").first();
    if(count.n) return fail("Initial setup has already been completed",409);
    if(!x.name||!x.email||!x.password||x.password.length<12) return fail("Name, email and a password of at least 12 characters are required");
    const {salt,hash}=await hashPassword(x.password);
    await env.CONTROL_DB.prepare("INSERT INTO users(id,name,email,password_salt,password_hash,role,department_id,status,created_at) VALUES(?,?,?,?,?,'Master Admin',NULL,'Active',?)")
      .bind(id("USR"),x.name,x.email.toLowerCase(),salt,hash,new Date().toISOString()).run();
    return json({ok:true,message:"Master Admin created. Remove BOOTSTRAP_SECRET after setup."},201);
  }
  if(path==="/api/login"&&req.method==="POST") {
    const x=await body(req); if(!x?.email||!x?.password) return fail("Email and password are required");
    const u=await env.CONTROL_DB.prepare("SELECT * FROM users WHERE email=?").bind(x.email.toLowerCase()).first();
    if(!u||u.status!=="Active"||!await verifyPassword(x.password,u.password_salt,u.password_hash)) return fail("Invalid credentials",401);
    const token=await sign({sub:u.id,exp:Math.floor(Date.now()/1000)+28800},env.JWT_SECRET);
    return json({ok:true,token,user:{id:u.id,name:u.name,email:u.email,role:u.role,departmentId:u.department_id}});
  }
  const user=await auth(req,env); if(!user) return fail("Authentication required",401);
  if(path==="/api/me"&&req.method==="GET") return json({ok:true,user});
  if(path==="/api/admin/departments"&&req.method==="GET") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const {results}=await env.CONTROL_DB.prepare("SELECT id,name,code,status,db_binding FROM departments ORDER BY name").all();
    return json({ok:true,departments:results});
  }
  if(path==="/api/admin/departments"&&req.method==="POST") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const x=await body(req); if(!x?.name||!x?.code) return fail("Department name and code are required");
    const code=x.code.toUpperCase().replace(/[^A-Z0-9_]/g,"");
    try {
      await env.CONTROL_DB.prepare("INSERT INTO departments(id,name,code,status,db_binding,created_at) VALUES(?,?,?,'Active',?,?)")
       .bind(id("DEP"),x.name.trim(),code,x.dbBinding||("DEPT_"+code),new Date().toISOString()).run();
    } catch {return fail("Department code already exists or data is invalid",409)}
    return json({ok:true,message:"Department created. Create and bind its separate D1 database before enabling reports."},201);
  }
  if(path==="/api/admin/config"&&req.method==="GET") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const {results}=await env.CONTROL_DB.prepare("SELECT config_key,config_json,updated_at FROM system_config").all();
    return json({ok:true,config:results.map(r=>({key:r.config_key,value:JSON.parse(r.config_json),updatedAt:r.updated_at}))});
  }
  if(path==="/api/admin/config"&&req.method==="PUT") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const x=await body(req); if(!x?.key||x.value===undefined) return fail("Config key and value are required");
    await env.CONTROL_DB.prepare("INSERT INTO system_config(config_key,config_json,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(config_key) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
      .bind(x.key,JSON.stringify(x.value),new Date().toISOString(),user.id).run();
    await audit(env,user,"CONFIG_UPDATE",x.key);
    return json({ok:true});
  }
  if(path==="/api/admin/users"&&req.method==="GET") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const {results}=await env.CONTROL_DB.prepare("SELECT id,name,email,role,department_id,status,created_at FROM users ORDER BY created_at DESC").all();
    return json({ok:true,users:results});
  }
  if(path==="/api/admin/users"&&req.method==="POST") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const x=await body(req); if(!x?.name||!x?.email||!x?.password||x.password.length<12) return fail("Name, email and password (minimum 12 characters) are required");
    const allowed=["Master Admin","Department Admin","HOD","User"];
    if(!allowed.includes(x.role)|| (x.role!=="Master Admin"&&!x.departmentId)) return fail("Valid role and department are required");
    const {salt,hash}=await hashPassword(x.password);
    try{await env.CONTROL_DB.prepare("INSERT INTO users(id,name,email,password_salt,password_hash,role,department_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id("USR"),x.name,x.email.toLowerCase(),salt,hash,x.role,x.role==="Master Admin"?null:x.departmentId,x.status==="Inactive"?"Inactive":"Active",new Date().toISOString()).run()}
    catch{return fail("Email already exists or data is invalid",409)}
    await audit(env,user,"USER_CREATE",x.email);
    return json({ok:true},201);
  }
  const userMatch=path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if(userMatch && (req.method==="PUT" || req.method==="PATCH")) {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const targetId=decodeURIComponent(userMatch[1]);
    const target=await env.CONTROL_DB.prepare("SELECT id,name,email,role,department_id,status FROM users WHERE id=?").bind(targetId).first();
    if(!target) return fail("User not found",404);
    const x=await body(req); if(!x) return fail("Invalid request body");
    if(req.method==="PUT") {
      if(!x.name || !x.email || !x.role) return fail("Name, email and role are required");
      const allowed=["Master Admin","Department Admin","HOD","User"];
      if(!allowed.includes(x.role) || (x.role!=="Master Admin"&&!x.departmentId)) return fail("Valid role and department are required");
      if(target.id===user.id && (x.role!=="Master Admin" || x.status==="Inactive")) return fail("You cannot remove your own Master Admin access or deactivate your own account",409);
      try {
        await env.CONTROL_DB.prepare("UPDATE users SET name=?,email=?,role=?,department_id=?,status=? WHERE id=?")
          .bind(x.name.trim(),x.email.toLowerCase().trim(),x.role,x.role==="Master Admin"?null:x.departmentId,
            x.status==="Inactive"?"Inactive":"Active",targetId).run();
      } catch { return fail("Email already exists or user data is invalid",409); }
      if(x.password) {
        if(x.password.length<12) return fail("New password must be at least 12 characters");
        const ph=await hashPassword(x.password);
        await env.CONTROL_DB.prepare("UPDATE users SET password_salt=?,password_hash=? WHERE id=?")
          .bind(ph.salt,ph.hash,targetId).run();
      }
      await audit(env,user,"USER_UPDATE",target.email+" -> "+x.email);
      return json({ok:true,message:"User updated"});
    }
    if(req.method==="PATCH") {
      if(!["Active","Inactive"].includes(x.status)) return fail("Status must be Active or Inactive");
      if(target.id===user.id && x.status==="Inactive") return fail("You cannot deactivate your own account",409);
      await env.CONTROL_DB.prepare("UPDATE users SET status=? WHERE id=?").bind(x.status,targetId).run();
      await audit(env,user,"USER_STATUS",target.email+" -> "+x.status);
      return json({ok:true,message:"User status updated"});
    }
  }
  if(path==="/api/department/users"&&req.method==="GET") {
    if(!["Master Admin","Department Admin","HOD"].includes(user.role)) return fail("Department management permission required",403);
    const depId=isMaster(user)?url.searchParams.get("departmentId"):user.department_id;
    if(!depId) return fail("Department context is required");
    if(!isMaster(user) && depId!==user.department_id) return fail("Cross-department access denied",403);
    const {results}=await env.CONTROL_DB.prepare("SELECT id,name,email,role,department_id,status,created_at FROM users WHERE department_id=? ORDER BY name").bind(depId).all();
    return json({ok:true,users:results});
  }
  async function departmentContext(requestedId) {
    const depId=isMaster(user)?requestedId:user.department_id;
    if(!depId) throw new Error("Department context is required");
    if(!isMaster(user)&&depId!==user.department_id) throw new Error("Cross-department access denied");
    const dep=await env.CONTROL_DB.prepare("SELECT id,name,code,db_binding,status FROM departments WHERE id=?").bind(depId).first();
    if(!dep||dep.status!=="Active") throw new Error("Department is unavailable");
    const db=env[dep.db_binding];
    if(!db) throw new Error("Department D1 binding is not configured");
    return {dep,db};
  }
  async function reportSchema(depId) {
    const specific=await env.CONTROL_DB.prepare("SELECT config_json FROM system_config WHERE config_key=?").bind("report_fields:"+depId).first();
    const common=await env.CONTROL_DB.prepare("SELECT config_json FROM system_config WHERE config_key='report_fields'").first();
    const fields=JSON.parse(specific?.config_json || common?.config_json || "[]");
    if(!Array.isArray(fields)) throw new Error("Report field configuration must be a JSON array");
    return fields;
  }
  const schemaMatch=path.match(/^\/api\/admin\/departments\/([^/]+)\/report-schema$/);
  if(schemaMatch&&req.method==="PUT") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const depId=decodeURIComponent(schemaMatch[1]);
    const dep=await env.CONTROL_DB.prepare("SELECT id FROM departments WHERE id=?").bind(depId).first();
    if(!dep) return fail("Department not found",404);
    const x=await body(req);
    if(!Array.isArray(x?.fields)) return fail("Fields must be a JSON array");
    const keys=new Set();
    for(const f of x.fields) {
      if(!f?.key||!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(f.key)||keys.has(f.key)) return fail("Each field needs a unique valid key");
      if(!["text","textarea","number","date","select"].includes(f.type||"text")) return fail("Unsupported field type: "+f.type);
      if(f.type==="select"&&(!Array.isArray(f.options)||!f.options.length||f.options.length>100)) return fail("Select fields need 1–100 options");
      if(typeof f.label!=="string"||!f.label.trim()||f.label.length>100) return fail("Each field needs a label of up to 100 characters");
      keys.add(f.key);
    }
    await env.CONTROL_DB.prepare("INSERT INTO system_config(config_key,config_json,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT(config_key) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
      .bind("report_fields:"+depId,JSON.stringify(x.fields),new Date().toISOString(),user.id).run();
    await audit(env,user,"REPORT_SCHEMA_UPDATE",depId);
    return json({ok:true,message:"Department report schema saved"});
  }
  if(path==="/api/report-schema"&&req.method==="GET") {
    try {
      const {dep}=await departmentContext(url.searchParams.get("departmentId"));
      return json({ok:true,department:{id:dep.id,name:dep.name},fields:await reportSchema(dep.id)});
    } catch(e){return fail(e.message,403)}
  }
  if(path==="/api/reports"&&req.method==="POST") {
    if(user.role==="Master Admin") return fail("Master Admin should select a department context to submit a report",400);
    const x=await body(req);
    if(!x?.payload||typeof x.payload!=="object"||Array.isArray(x.payload)||!x?.period||String(x.period).length>40) return fail("A valid report period and payload object are required");
    try {
      const {dep,db}=await departmentContext();
      const fields=await reportSchema(dep.id);
      const allowed=new Set(fields.map(f=>f.key).filter(Boolean));
      for(const f of fields) {
        if(!f.key || !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(f.key)) return fail("Invalid report field configuration",500);
        const v=x.payload[f.key];
        if(f.required && (v===undefined || v===null || String(v).trim()==="")) return fail("Required field missing: "+(f.label||f.key));
        if(v!==undefined && v!==null && typeof v!=="string" && typeof v!=="number" && typeof v!=="boolean") return fail("Invalid value for field: "+f.key);
        if(f.type==="number" && v!==undefined && v!==null && v!=="" && !Number.isFinite(Number(v))) return fail("Numeric value required for: "+(f.label||f.key));
        if(f.type==="select" && v!==undefined && v!==null && v!=="" && Array.isArray(f.options) && !f.options.includes(v)) return fail("Invalid selection for: "+(f.label||f.key));
      }
      for(const k of Object.keys(x.payload)) if(!allowed.has(k)) return fail("Unknown report field: "+k);
      const reportId=id("RPT");
      await db.prepare("INSERT INTO reports(id,user_id,period,payload_json,status,created_at) VALUES(?,?,?,?,'Submitted',?)")
        .bind(reportId,user.id,String(x.period),JSON.stringify(x.payload),new Date().toISOString()).run();
      await audit(env,user,"REPORT_SUBMIT",reportId);
      return json({ok:true,reportId,status:"Submitted"},201);
    } catch(e){return fail(e.message,e.message.includes("Cross-department")?403:400)}
  }
  if(path==="/api/reports"&&req.method==="GET") {
    try {
      const {dep,db}=await departmentContext(url.searchParams.get("departmentId"));
      let sql="SELECT id,user_id,period,payload_json,status,created_at,reviewed_by,reviewed_at,review_note FROM reports";
      let args=[];
      if(user.role==="User") {sql+=" WHERE user_id=?";args.push(user.id)}
      if(url.searchParams.get("status")) {sql+=(args.length||sql.includes("WHERE")?" AND":" WHERE")+" status=?";args.push(url.searchParams.get("status"))}
      sql+=" ORDER BY created_at DESC LIMIT 500";
      const {results}=await db.prepare(sql).bind(...args).all();
      const ids=[...new Set(results.map(r=>r.user_id))];
      let names={};
      if(ids.length) {
        const placeholders=ids.map(()=>"?").join(",");
        const found=await env.CONTROL_DB.prepare(`SELECT id,name,email FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
        names=Object.fromEntries(found.results.map(u=>[u.id,{name:u.name,email:u.email}]));
      }
      return json({ok:true,department:{id:dep.id,name:dep.name},reports:results.map(r=>({...r,payload:JSON.parse(r.payload_json),employee:names[r.user_id]||null}))});
    } catch(e){return fail(e.message,e.message.includes("Cross-department")?403:400)}
  }
  const reportMatch=path.match(/^\/api\/reports\/([^/]+)\/status$/);
  if(reportMatch&&req.method==="PUT") {
    if(!["HOD","Department Admin","Master Admin"].includes(user.role)) return fail("Approval permission required",403);
    const x=await body(req);
    if(!["Approved","Rejected"].includes(x?.status)) return fail("Status must be Approved or Rejected");
    if(x.note!==undefined && (typeof x.note!=="string"||x.note.length>1000)) return fail("Review note must be text up to 1000 characters");
    try {
      const {dep,db}=await departmentContext(url.searchParams.get("departmentId"));
      const reportId=decodeURIComponent(reportMatch[1]);
      const report=await db.prepare("SELECT id,status FROM reports WHERE id=?").bind(reportId).first();
      if(!report) return fail("Report not found",404);
      if(report.status!=="Submitted") return fail("Only submitted reports can be reviewed",409);
      await db.prepare("UPDATE reports SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=?")
        .bind(x.status,user.id,new Date().toISOString(),x.note||"",reportId).run();
      await audit(env,user,"REPORT_"+x.status.toUpperCase(),reportId+" @ "+dep.code);
      return json({ok:true,status:x.status,reviewedAt:new Date().toISOString()});
    } catch(e){return fail(e.message,e.message.includes("Cross-department")?403:400)}
  }
  if(path==="/api/analytics/summary"&&req.method==="GET") {
    try {
      const {dep,db}=await departmentContext(url.searchParams.get("departmentId"));
      const total=await db.prepare("SELECT COUNT(*) total FROM reports").first();
      const statuses=await db.prepare("SELECT status,COUNT(*) count FROM reports GROUP BY status").all();
      const active=await db.prepare("SELECT COUNT(DISTINCT user_id) count FROM reports").first();
      const byPeriod=await db.prepare("SELECT period,COUNT(*) count FROM reports GROUP BY period ORDER BY period DESC LIMIT 12").all();
      const statusCounts=Object.fromEntries(statuses.results.map(x=>[x.status,x.count]));
      return json({ok:true,department:{id:dep.id,name:dep.name},metrics:{
        totalReports:total.total||0,submitted:statusCounts.Submitted||0,approved:statusCounts.Approved||0,
        rejected:statusCounts.Rejected||0,activeContributors:active.count||0
      },byPeriod:byPeriod.results});
    } catch(e){return fail(e.message,e.message.includes("Cross-department")?403:400)}
  }
  if(path==="/api/analytics/ranking"&&req.method==="GET") {
    try {
      const {dep,db}=await departmentContext(url.searchParams.get("departmentId"));
      const {results}=await db.prepare("SELECT user_id,COUNT(*) total,SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) rejected FROM reports GROUP BY user_id ORDER BY approved DESC,total DESC LIMIT 20").all();
      const ids=results.map(x=>x.user_id);
      let users={};
      if(ids.length) {
        const placeholders=ids.map(()=>"?").join(",");
        const found=await env.CONTROL_DB.prepare(`SELECT id,name,email FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
        users=Object.fromEntries(found.results.map(x=>[x.id,x]));
      }
      return json({ok:true,department:{id:dep.id,name:dep.name},ranking:results.map((x,i)=>({
        rank:i+1,userId:x.user_id,name:users[x.user_id]?.name||"Unknown user",
        total:x.total,approved:x.approved||0,rejected:x.rejected||0
      }))});
    } catch(e){return fail(e.message,e.message.includes("Cross-department")?403:400)}
  }
  if(path==="/api/audit"&&req.method==="GET") {
    if(!isMaster(user)) return fail("Master Admin permission required",403);
    const {results}=await env.CONTROL_DB.prepare("SELECT actor_id,action,entity,created_at FROM audit_log ORDER BY created_at DESC LIMIT 500").all();
    return json({ok:true,events:results});
  }
  return fail("Route not found",404);
}
async function audit(env,user,action,entity) {
  await env.CONTROL_DB.prepare("INSERT INTO audit_log(actor_id,action,entity,created_at) VALUES(?,?,?,?)")
    .bind(user.id,action,entity,new Date().toISOString()).run();
}
export default {fetch:route};
