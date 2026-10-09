import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireManagement } from "/management/shared/guards/management-guard.js";
const $ = id => document.getElementById(id);
const list = httpsCallable(functions,"listCoachXpRecoveryRequests");
const review = httpsCallable(functions,"reviewCoachXpRecoveryRequest");
function esc(v) {return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function reload() {
 $("coachRecoveryStatus").textContent="Loading reports…";
 try {
  const data = (await list({view:"management"})).data?.requests || [];
  $("coachRecoveryList").innerHTML = data.length ? data.map(r=>`
  <details style="margin:12px 0;padding:14px;border:1px solid #aaa5;border-radius:9px">
  <summary><strong>${esc(r.requestId)}</strong> · ${esc(r.status==="REVIEWED"?"REVIEWED — NOT CREDITED":r.status)} · ${esc(r.locationId)} · ${r.entries?.length||0} attendance entries</summary>
  <p>Coach: ${esc(r.coachUid)} · ${r.createdAt ? new Date(r.createdAt).toLocaleString():""}</p>
  <p>${esc(r.note)}</p>
  <div style="overflow:auto"><table style="width:100%"><thead><tr><th>Athlete ID</th><th>Practice Date</th><th>XP Requested</th><th>Evidence</th></tr></thead>
  <tbody>${(r.entries||[]).map(e=>`<tr><td>${esc(e.athleteId)}</td><td>${esc(e.practiceDate)}</td><td>${esc(e.requestedXp)}</td><td>${esc(e.note)}</td></tr>`).join("")}</tbody></table></div>
  ${r.status==="PENDING_MANAGEMENT" ? `
  <label>Management review notes (required)<textarea data-review-note="${esc(r.requestId)}" rows="3" style="width:100%" placeholder="Attendance verified, already credited, or what to correct."></textarea></label>
  <button type="button" data-review="${esc(r.requestId)}" data-decision="REVIEWED">Record Review Only — No XP Awarded</button>
  <button type="button" data-review="${esc(r.requestId)}" data-decision="REJECTED">Reject Report</button>` :
  `<p>Management decision: ${esc(r.managementNote||"")} · No XP was awarded by this review.</p>`}
  </details>`).join(""):"<p>No Coach XP recovery reports yet.</p>";
  $("coachRecoveryStatus").textContent=data.length+" report(s). Management must apply verified XP through the correction tool; marking reviewed does not credit XP.";
 } catch(e) {$("coachRecoveryStatus").textContent="Unable to load recovery reports: "+e.message;}
}
$("coachRecoveryList").addEventListener("click",async e=>{
 const b=e.target.closest("[data-review]");if(!b)return;
 const id=b.dataset.review,decision=b.dataset.decision;
 const note=document.querySelector('[data-review-note="'+CSS.escape(id)+'"]')?.value.trim()||"";
 if(note.length<8){alert("Write a Management review note (at least 8 characters).");return;}
 if(!confirm("Record "+decision+" for this report? This does not award any XP."))return;
 b.disabled=true;
 try{await review({requestId:id,decision,note});await reload();}
 catch(err){alert("Review failed: "+err.message);b.disabled=false;}
});
$("refreshCoachRecovery").addEventListener("click",reload);
try {await requireManagement();await reload();}
catch(e) {$("coachRecoveryStatus").textContent="Management authorization required: "+e.message;}
