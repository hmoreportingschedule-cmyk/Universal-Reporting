const $=s=>document.querySelector(s);let token="",me=null,departments=[],fields=[],reportCache=[];
const base=()=>$("#api").value.trim().replace(/\/+$/,"");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function note(s,bad=false){$("#notice").textContent=s;$("#notice").className=bad?"err":"ok"}
async function api(path,method="GET",data){const r=await fetch(base()+path,{method,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},...(data?{body:JSON.stringify(data)}:{})});const j=await r.json().catch(()=>({error:"Invalid response"}));if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j}
const depId=()=>me.role==="Master Admin"?$("#department").value:me.department_id;
const depQuery=()=>me.role==="Master Admin"?"?departmentId="+encodeURIComponent(depId()):"";
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{const j=await api("/api/login","POST",{email:$("#email").value,password:$("#password").value});token=j.token;me=j.user;$("#login").hidden=true;$("#main").hidden=false;$("#identity").textContent=`${me.name} · ${me.role}`;if(me.role==="Master Admin"){const d=await api("/api/admin/departments");departments=d.departments;$("#department").innerHTML=departments.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");$("#departmentPanel").hidden=false;$("#schemaPanel").hidden=false;$("#comparisonPanel").hidden=false;$("#targetEntry").hidden=false;$("#saveTarget").hidden=false;$("#department").onchange=()=>loadAll();}await loadAll();note("Connected to live reporting API.");}catch(e){note(e.message,true)}};
$("#logout").onclick=()=>{token="";me=null;$("#main").hidden=true;$("#login").hidden=false;note("Signed out.")};
async function loadAll(){if(!depId()){note("Create/select a department first.",true);return}await loadSchema();await loadReports();await loadAnalytics();if($("#period").value)$("#targetPeriod").value=$("#period").value;await loadTarget()}
async function loadSchema(){const j=await api("/api/report-schema"+depQuery());fields=j.fields||[];if(me.role==="Master Admin")$("#schemaJson").value=JSON.stringify(fields,null,2);renderFields()}
function renderFields(){$("#dynamicFields").innerHTML=fields.map(f=>{const req=f.required?"required":"";let el;if(f.type==="textarea")el=`<textarea name="${esc(f.key)}" ${req}></textarea>`;else if(f.type==="select")el=`<select name="${esc(f.key)}" ${req}><option value="">Select</option>${(f.options||[]).map(v=>`<option>${esc(v)}</option>`).join("")}</select>`;else el=`<input name="${esc(f.key)}" type="${["text","number","date"].includes(f.type)?f.type:"text"}" ${req}>`;return `<div class="field"><label>${esc(f.label)}${f.required?" *":""}</label>${el}</div>`}).join("")||'<p class="muted">No report fields configured. Ask Master Admin to configure fields.</p>'}
$("#saveSchema").onclick=async()=>{try{const schema=JSON.parse($("#schemaJson").value);await api("/api/admin/departments/"+encodeURIComponent(depId())+"/report-schema","PUT",{fields:schema});await loadSchema();note("Department report fields saved.");}catch(e){note(e.message,true)}};
$("#reportForm").onsubmit=async e=>{e.preventDefault();try{const payload={};for(const f of fields){const el=e.target.elements.namedItem(f.key);if(el)payload[f.key]=el.value}const j=await api("/api/reports","POST",{period:$("#period").value.trim(),payload});e.target.reset();await loadReports();note("Report submitted: "+j.reportId)}catch(e){note(e.message,true)}};
async function loadReports(){const j=await api("/api/reports"+depQuery());reportCache=j.reports;$("#reports").innerHTML=j.reports.map(r=>{const detail=Object.entries(r.payload||{}).map(([k,v])=>`${k}: ${v}`).join(" · ");const canReview=["HOD","Department Admin","Master Admin"].includes(me.role)&&r.status==="Submitted";return `<tr><td>${esc(r.id)}</td><td>${esc(r.employee?.name||r.user_id)}</td><td>${esc(r.period)}</td><td title="${esc(detail)}">${esc(detail.slice(0,110))}</td><td>${esc(r.status)}</td><td>${esc(r.created_at)}</td><td class="actions">${canReview?`<button data-id="${esc(r.id)}" data-status="Approved">Approve</button><button class="light" data-id="${esc(r.id)}" data-status="Rejected">Reject</button>`:"—"}</td></tr>`}).join("")||'<tr><td colspan="7">No reports found.</td></tr>'}
$("#reports").addEventListener("click",async e=>{const b=e.target.closest("button[data-id]");if(!b)return;try{const noteText=prompt("Review note (optional):","") ;if(noteText===null)return;await api("/api/reports/"+encodeURIComponent(b.dataset.id)+"/status"+depQuery(),"PUT",{status:b.dataset.status,note:noteText});await loadAll();note("Report "+b.dataset.status.toLowerCase()+".")}catch(err){note(err.message,true)}});
async function loadAnalytics(){
 const [s,r]=await Promise.all([api("/api/analytics/summary"+depQuery()),api("/api/analytics/ranking"+depQuery())]);
 const m=s.metrics;
 $("#metrics").innerHTML=[["Total Reports",m.totalReports],["Pending Review",m.submitted],["Approved",m.approved],["Rejected",m.rejected],["Contributors",m.activeContributors]].map(x=>`<div class="metric"><small>${esc(x[0])}</small><strong>${esc(x[1])}</strong></div>`).join("");
 $("#periodTrend").innerHTML=s.byPeriod.map(x=>`<div class="trendrow"><span>${esc(x.period)}</span><div class="track"><i style="width:${Math.max(2,Math.round(x.count/Math.max(1,...s.byPeriod.map(y=>y.count))*100))}%"></i></div><b>${esc(x.count)}</b></div>`).join("")||'<p class="muted">No reporting activity yet.</p>';
 $("#ranking").innerHTML=r.ranking.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.name)}</td><td>${x.total}</td><td>${x.approved}</td><td>${x.rejected}</td></tr>`).join("")||'<tr><td colspan="5">No contributors yet.</td></tr>';
}
$("#refreshAnalytics").onclick=()=>loadAnalytics().then(()=>note("Analytics refreshed.")).catch(e=>note(e.message,true));
$("#reload").onclick=()=>loadAll().then(()=>note("Reports refreshed.")).catch(e=>note(e.message,true));

function csvCell(v){const x=String(v??"");return '"'+x.replace(/"/g,'""')+'"'}
$("#exportCsv").onclick=()=>{
 const rows=[["Report ID","Employee","Period","Status","Submitted At","Report Details"]];
 for(const r of reportCache)rows.push([r.id,r.employee?.name||r.user_id,r.period,r.status,r.created_at,Object.entries(r.payload||{}).map(([k,v])=>k+": "+v).join(" | ")]);
 const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
 const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="URS-Reports-"+(depId()||"department")+".csv";a.click();URL.revokeObjectURL(url);
};
$("#printPdf").onclick=()=>window.print();
async function loadTarget(){
 const period=$("#targetPeriod").value.trim();if(!period)return;
 const t=await api("/api/analytics/target"+(me.role==="Master Admin"?"?departmentId="+encodeURIComponent(depId())+"&":"?")+"period="+encodeURIComponent(period));
 const pct=Math.min(100,t.achievementPercent);
 $("#targetResult").innerHTML=`<div class="targetnumbers"><div><small>Target</small><strong>${t.target}</strong></div><div><small>Approved Achievement</small><strong>${t.actual}</strong></div><div><small>Remaining</small><strong>${t.remaining}</strong></div><div><small>Achievement</small><strong>${t.achievementPercent}%</strong></div></div><div class="progress"><i style="width:${pct}%"></i></div><small>${t.totalSubmitted} reports submitted in ${esc(period)}; only approved reports count toward achievement.</small>`;
 if(me.role==="Master Admin")$("#targetValue").value=t.target;
}
$("#loadTarget").onclick=()=>loadTarget().then(()=>note("Target data refreshed.")).catch(e=>note(e.message,true));
$("#saveTarget").onclick=async()=>{try{const period=$("#targetPeriod").value.trim(),target=Number($("#targetValue").value);if(!period||!Number.isFinite(target)||target<0)throw Error("Enter a valid period and target");await api("/api/admin/departments/"+encodeURIComponent(depId())+"/targets","PUT",{period,target,unit:"approved reports"});await loadTarget();note("Department target saved.");}catch(e){note(e.message,true)}};
$("#loadComparison").onclick=async()=>{try{const period=$("#targetPeriod").value.trim();if(!period)throw Error("Enter target period first");const j=await api("/api/analytics/department-comparison?period="+encodeURIComponent(period));$("#comparison").innerHTML=j.departments.map(d=>`<tr><td>${esc(d.department)}</td><td>${d.target??"—"}</td><td>${d.approved??"—"}</td><td>${d.total??"—"}</td><td>${d.achievementPercent===undefined?"DB unavailable":d.achievementPercent+"%"}</td></tr>`).join("");note("Department comparison loaded.");}catch(e){note(e.message,true)}};
