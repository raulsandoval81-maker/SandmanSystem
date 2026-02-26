/* ============================================================
   Parent Fight Night JS — Arena Live Display (2026)
   Mirrors tableConsole + matConsolePRO unified events
   ============================================================ */

console.log("%cFIGHT NIGHT — READY", "color:#ffdd48;font-weight:bold;");

window.fightNightPush = function (ev) {
  if (!ev || !ev.type) return;

  switch (ev.type) {

    case "score":
      renderScore(ev.payload);
      break;

    case "period":
      renderPeriod(ev.payload);
      break;

    case "clock":
      renderClock(ev.payload);
      break;

    case "match-info":
      renderMatch(ev.payload);
      break;

    case "name-update":
      renderNames(ev.payload);
      break;

    case "action":
      renderAction(ev.payload.note);
      break;

    default:
      console.warn("Unknown FN event:", ev);
  }
};

/* ---------------- Renderers ---------------- */

function renderScore(p) {
  document.getElementById("redScore").textContent   = p.red ?? 0;
  document.getElementById("greenScore").textContent = p.green ?? 0;
}

function renderClock(p) {
  document.getElementById("fnClock").textContent = p.time || "0:00";
}

function renderPeriod(p) {
  document.getElementById("fnPeriod").textContent = `P${p.period || 1}`;
}

function renderAction(note) {
  document.getElementById("fnAction").textContent = note || "—";
}

function renderMatch(info) {
  if (info.event) document.getElementById("fn-event").textContent = info.event;
  if (info.mat)   document.getElementById("fn-mat").textContent   = `Mat ${info.mat}`;
}

function renderNames(p) {
  if (p.red)   document.getElementById("redName").textContent   = p.red;
  if (p.green) document.getElementById("greenName").textContent = p.green;
}
