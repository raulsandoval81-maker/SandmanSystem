import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
const $ = id => document.getElementById(id);
const submit = httpsCallable(functions, "submitCoachXpRecoveryRequest");
const list = httpsCallable(functions, "listCoachXpRecoveryRequests");
function esc(s) {return String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
async function refresh() {
 try {
  const r = await list({view:"coach"});
  const rows = r.data?.requests || [];
  $("reports").innerHTML = rows.length ? rows.map(x =>
   `<article><p><strong>${esc(x.requestId)}</strong> — ${esc(x.status)} · ${esc(x.entries?.length)} entries</p><p>${esc(x.managementNote || "Waiting for Management review")}</p></article>`).join("") :
   "<p>No submitted recovery reports.</p>";
 } catch(e) { $("reports").textContent = e.message; }
}
$("recoveryForm").addEventListener("submit", async e => {
 e.preventDefault();
 const button = $("submit"); button.disabled = true; $("result").textContent = "Submitting report…";
 try {
  const entries = $("entries").value.trim().split(/\n+/).map((line,i) => {
   const [athleteId,practiceDate,xp,...note] = line.split("|").map(s=>s.trim());
   if (!athleteId || !practiceDate || !xp) throw Error("Missing required fields on row " + (i+1));
   return {athleteId,practiceDate,requestedXp:Number(xp),note:note.join(" | ")};
  });
  if (!window.confirm(`Send ${entries.length} missing-practice entries to Management? No XP will be awarded by this report.`)) {
   $("result").textContent = "Report not submitted."; return;
  }
  const r = await submit({locationId:$("location").value.trim(),entries,note:$("note").value.trim()});
  $("result").textContent = "✓ Report sent to Management. Reference: " + r.data.requestId + ". No XP awarded yet.";
  $("entries").value = ""; $("note").value = ""; await refresh();
 } catch(err) {$("result").textContent = "⚠ " + err.message;}
 finally {button.disabled = false;}
});
$("refresh").addEventListener("click",refresh);
try {await requireCoach();$("access").textContent="Coach verified — submit missing attendance for Management review.";await refresh();}
catch(e){$("access").textContent="Coach authorization required: "+e.message;$("submit").disabled=true;}
