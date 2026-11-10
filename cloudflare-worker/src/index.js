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
  if(path==="/api/health"&&req.method==="GET") return json({ok:true,service:"URS Live API",version:"2.2",mode:"live-backend"});
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
  if(path==="/api/reports"&&req.method==="POST") {
    if(user.role==="Master Admin") return fail("Master Admin should select a department context to submit a report",400);
    const x=await body(req);
    if(!x?.payload||!x?.period) return fail("Report period and payload are required");
    const dep=await env.CONTROL_DB.prepare("SELECT code,db_binding,status FROM departments WHERE id=?").bind(user.department_id).first();
    if(!dep||dep.status!=="Active") return fail("Department is unavailable",403);
    const deptDb=env[dep.db_binding];
    if(!deptDb) return fail("Department D1 binding is not configured. Ask Master Admin to provision it.",503);
    const reportId=id("RPT");
    await deptDb.prepare("INSERT INTO reports(id,user_id,period,payload_json,status,created_at) VALUES(?,?,?,?,'Submitted',?)")
      .bind(reportId,user.id,x.period,JSON.stringify(x.payload),new Date().toISOString()).run();
    return json({ok:true,reportId},201);
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
