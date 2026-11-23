import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireManagement } from "/management/shared/guards/management-guard.js";
const $ = id => document.getElementById(id);
const list = httpsCallable(functions,"listCoachPaperXpReports");
const review = httpsCallable(functions,"reviewCoachPaperXpReport");
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function reload() {
  $("paperReportStatus").textContent = "Loading…";
  try {
    const reports = (await list({view:"management"})).data?.reports || [];
    $("paperReportList").innerHTML = reports.length ? reports.map(r=>`
      <details class="coach-xp-report" data-report-status="${esc(r.status)}">
      <summary class="coach-xp-report__summary"><strong>${esc(r.reportId)}</strong> · <span class="coach-xp-report__status">${esc(r.status)}</span> · ${r.athletes?.length||0} athletes · ${(r.athletes||[]).reduce((s,a)=>s+Number(a.paperXp||0),0)} paper XP</summary>
      <p class="coach-xp-report__meta">Coach: ${esc(r.coachUid)} · Location: ${esc(r.locationId)} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</p>
      <p class="coach-xp-report__description">${esc(r.note)}</p><div class="coach-xp-report__table-wrap"><table class="coach-xp-report__table"><thead><tr><th>Athlete</th><th>Paper XP</th><th>Evidence</th></tr></thead>
      <tbody>${(r.athletes||[]).map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.paperXp)}</td><td>${esc(a.evidence)}</td></tr>`).join("")}</tbody></table></div>
      ${r.status==="PENDING_MANAGEMENT" ? `
      <label class="coach-xp-report__note-label">Management review note<textarea class="coach-xp-report__textarea" data-paper-note="${esc(r.reportId)}" rows="3" placeholder="Document verification and next steps."></textarea></label>
      <button class="coach-xp-report__action" type="button" data-paper-review="${esc(r.reportId)}" data-decision="REVIEWED">Record Review — No XP Awarded</button>
      <button class="coach-xp-report__action coach-xp-report__action--reject" type="button" data-paper-review="${esc(r.reportId)}" data-decision="REJECTED">Reject Report</button>` :
      `<p class="coach-xp-report__management-note">Management note: ${esc(r.managementNote)}. No XP awarded by report.</p>`}
      </details>`).join("") : "<p>No Coach paper XP reports.</p>";
    $("paperReportStatus").textContent = reports.length + " paper report(s). Review and correct each athlete separately in XP Management.";
  } catch (e) { $("paperReportStatus").textContent = "Unable to load: " + e.message; }
}
$("paperReportList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-paper-review]"); if(!b)return;
  const reportId=b.dataset.paperReview,decision=b.dataset.decision;
  const note=Array.from(document.querySelectorAll("[data-paper-note]")).find(el=>el.dataset.paperNote===reportId)?.value.trim()||"";
  if(note.length<8){alert("Write at least 8 characters of Management notes.");return;}
  if(!confirm("Record "+decision+"? This does not award XP."))return;
  b.disabled=true;
  try {await review({reportId,decision,note});await reload();}
  catch(err){alert("Review failed: "+err.message);b.disabled=false;}
});
$("refreshPaperReports").addEventListener("click",reload);
try {await requireManagement();await reload();}
catch(e){$("paperReportStatus").textContent="Management authorization required: "+e.message;}
