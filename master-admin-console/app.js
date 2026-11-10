const $=s=>document.querySelector(s);
let token="", departments=[], users=[];
const keys=["report_fields","hierarchy_levels","approval_workflow","dashboard_layout","targets","system_settings"];
const labels={report_fields:"Report Fields",hierarchy_levels:"Reporting Hierarchy",approval_workflow:"Approval Workflow",dashboard_layout:"Dashboard Layout",targets:"Targets",system_settings:"System Settings"};
function apiBase(){return $("#apiBase").value.trim().replace(/\/+$/,"")}
async function api(path,method="GET",data){
 const r=await fetch(apiBase()+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(data?{body:JSON.stringify(data)}:{})});
 const j=await r.json().catch(()=>({error:"Invalid server response"}));
 if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j;
}
function msg(s,bad=false){$("#message").textContent=s;$("#message").className=bad?"error":"success"}
function showApp(){ $("#login").hidden=true;$("#app").hidden=false;$("#who").textContent="Signed in as "+(window.me?.name||"Master Admin"); }
function parseJson(id){try{return JSON.parse($(id).value)}catch(e){throw Error("Valid JSON required in "+id)}}
$("#loginForm").addEventListener("submit",async e=>{
 e.preventDefault();try{token="";const j=await api("/api/login","POST",{email:$("#email").value,password:$("#password").value});token=j.token;window.me=j.user;if(j.user.role!=="Master Admin")throw Error("Master Admin access required");showApp();await refresh();msg("Connected to live backend.");}catch(e){msg(e.message,true)}
});
$("#logout").onclick=()=>{token="";window.me=null;$("#app").hidden=true;$("#login").hidden=false;msg("Signed out.")};
async function refresh(){
 const [d,u,c]=await Promise.all([api("/api/admin/departments"),api("/api/admin/users"),api("/api/admin/config")]);
 departments=d.departments;users=u.users;
 $("#departments").innerHTML=departments.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.code)}</td><td>${esc(x.status)}</td><td>${esc(x.db_binding)}</td></tr>`).join("")||'<tr><td colspan="4">No departments yet</td></tr>';
 $("#users").innerHTML=users.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.role)}</td><td>${esc(x.department_id||"—")}</td><td>${esc(x.status)}</td></tr>`).join("")||'<tr><td colspan="5">No users yet</td></tr>';
 $("#userDepartment").innerHTML='<option value="">Select department</option>'+departments.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} (${esc(x.code)})</option>`).join("");
 const cfg=Object.fromEntries(c.config.map(x=>[x.key,x.value]));
 for(const k of keys) $("#cfg_"+k).value=JSON.stringify(cfg[k]??defaultConfig(k),null,2);
}
function defaultConfig(k){return ({report_fields:[],hierarchy_levels:["Country","Region","State","Division","District"],approval_workflow:["User submits","HOD reviews","Department Admin final approval"],dashboard_layout:{cards:[],charts:[]},targets:{},system_settings:{date_format:"DD/MM/YYYY",theme:"navy-gold"}})[k]}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("#departmentForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/admin/departments","POST",{name:$("#depName").value,code:$("#depCode").value,dbBinding:$("#depBinding").value||undefined});e.target.reset();await refresh();msg("Department created. Provision its separate D1 database and binding before reporting.");}catch(e){msg(e.message,true)}});
$("#userForm").addEventListener("submit",async e=>{e.preventDefault();try{const role=$("#userRole").value;await api("/api/admin/users","POST",{name:$("#userName").value,email:$("#userEmail").value,password:$("#userPassword").value,role,departmentId:role==="Master Admin"?undefined:$("#userDepartment").value,status:$("#userStatus").value});e.target.reset();await refresh();msg("User created.");}catch(e){msg(e.message,true)}});
$("#saveConfig").onclick=async()=>{try{for(const k of keys){const value=parseJson("#cfg_"+k);await api("/api/admin/config","PUT",{key:k,value})}msg("All customization settings saved to central database.");}catch(e){msg(e.message,true)}};
$("#reload").onclick=()=>refresh().then(()=>msg("Data refreshed.")).catch(e=>msg(e.message,true));
$("#roleHelp").textContent="Roles: Master Admin, Department Admin, HOD, User. Master Admin can configure the whole system; other roles are department-scoped.";
