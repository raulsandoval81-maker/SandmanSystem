import { functions, httpsCallable } from "/assets/js/firebase-init.js";
import { requireCoach } from "/assets/js/coach-guard.js";
const $ = id => document.getElementById(id);
const submit = httpsCallable(functions, "submitCoachPaperXpReport");
const list = httpsCallable(functions, "listCoachPaperXpReports");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function refresh() {
  try {
    const rows = (await list({view:"coach"})).data?.reports || [];
    $("reports").innerHTML = rows.length ? rows.map(r =>
      `<article><strong>${esc(r.reportId)}</strong> — ${esc(r.status)} · ${r.athletes?.length || 0} athletes · ${(r.athletes || []).reduce((sum,a)=>sum+Number(a.paperXp||0),0)} paper XP<p>${esc(r.managementNote || "Awaiting Management review")}</p></article>`).join("") : "<p>No paper XP reports submitted.</p>";
  } catch (e) { $("reports").textContent = "Unable to load reports: " + e.message; }
}
$("paperForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = $("submit"); button.disabled = true;
  try {
    const athletes = $("entries").value.trim().split(/\n+/).map((line,i) => {
      const [name,xp,...evidence] = line.split("|").map(x=>x.trim());
      const paperXp = Number(xp);
      if (!name || !Number.isSafeInteger(paperXp) || paperXp < 1) throw Error("Invalid name or XP on line " + (i+1));
      return {name,paperXp,evidence:evidence.join(" | ")};
    });
    const total = athletes.reduce((sum,a)=>sum+a.paperXp,0);
    if (!confirm(`Submit ${athletes.length} athletes / ${total} PAPER XP to Management? This does not award XP.`)) return;
    const r = await submit({locationId:$("location").value.trim(),athletes,note:$("note").value.trim()});
    $("result").textContent = "Report sent to Management: " + r.data.reportId + ". No XP awarded.";
    $("entries").value = ""; await refresh();
  } catch (err) { $("result").textContent = "Submission failed: " + err.message; }
  finally { button.disabled = false; }
});
$("refresh").addEventListener("click",refresh);
try { await requireCoach(); $("access").textContent = "Coach verified — reports are sent for Management review only."; $("submit").disabled = false; await refresh(); }
catch (e) { $("access").textContent = "Coach authorization required: " + e.message; }
