// /public/assets/js/ladder-test.js
import {
  LADDER_YOUTH, LADDER_F4,
  formatTierLine, getStripeInfo
} from "./ladder.service.js";

// ---- helpers
const $ = id => document.getElementById(id);

function renderTable(ladder, elId){
  const el = $(elId);
  el.innerHTML = ladder.map(t =>
    `<tr>
      <td>${t.name}</td>
      <td>${t.cap}</td>
      <td>${t.stripes}</td>
      <td>${t.stripeStep}</td>
    </tr>`).join("");
}

function runOne(ladder, total, lineElId){
  const line = formatTierLine(ladder, total);
  $(lineElId).textContent = line;

  // debug details to console if you want to peek:
  const info = getStripeInfo(ladder, total);
  console.log("[LADDER TEST]", { total, info });
}

// ---- init tables
renderTable(LADDER_YOUTH, "yTable");
renderTable(LADDER_F4, "fTable");

// ---- bind buttons
$("yRun").addEventListener("click", ()=>{
  const total = +$("yInput").value || 0;
  runOne(LADDER_YOUTH, total, "yLine");
});

$("fRun").addEventListener("click", ()=>{
  const total = +$("fInput").value || 0;
  runOne(LADDER_F4, total, "fLine");
});

// ---- first paint
runOne(LADDER_YOUTH, +$("yInput").value || 0, "yLine");
runOne(LADDER_F4,   +$("fInput").value || 0, "fLine");
