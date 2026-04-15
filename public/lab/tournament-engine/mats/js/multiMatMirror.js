/* ============================================================
   MULTI-MAT MIRROR ENGINE
   Location: /public/mats/js/multiMatMirror.js
   Purpose:  Receive events from ANY mat, store state by Mat #,
             and update the Table Console display instantly.
   ============================================================ */

export const matState = {}; // dynamic bucket { 1:{...}, 2:{...}, ... }

/* Main entry point all mats send into */
window.multiMatPush = function(matNumber, event) {
  if (!matNumber || !event || !event.type) return;

  if (!matState[matNumber]) matState[matNumber] = getEmptyState();

  const state = matState[matNumber];

  switch (event.type) {

    case "score":
      state.red = event.payload.red;
      state.green = event.payload.green;
      break;

    case "clock":
      state.clock = event.payload.time;
      break;

    case "special":
      state[event.payload.id] = event.payload.value;
      break;

    case "log":
      if (!state.log) state.log = [];
      state.log.unshift(event.payload.text);
      break;

    case "boutsheet":
      state[event.payload.cell] = {
        color: event.payload.color,
        choice: event.payload.choice
      };
      break;

    case "match-info":
      Object.assign(state, event.payload);
      break;
  }

  updateVisibleMat(matNumber);
};


/* ============================================================
   EMPTY STATE TEMPLATE
   ============================================================ */
function getEmptyState() {
  return {
    red: 0,
    green: 0,
    clock: "2:00",
    log: []
  };
}


/* ============================================================
   UPDATE UI WHEN ACTIVE MAT CHANGES
   ============================================================ */
function updateVisibleMat(matNumber) {
  // all your selectors here
  if (!matState[matNumber]) return;

  const m = matState[matNumber];

  safeSet("redScore",   m.red);
  safeSet("greenScore", m.green);
  safeSet("mainTimer",  m.clock);

  if (m.event) safeSet("eventName", m.event);
  if (m.mat)   safeSet("matNumber", m.mat);
  if (m.bout)  safeSet("boutNumber", m.bout);

  // rebuild log
  const box = document.getElementById("active-log");
  if (box) {
    box.innerHTML = "";
    m.log.forEach(t => {
      const div = document.createElement("div");
      div.classList.add("log-row");
      div.textContent = t;
      box.appendChild(div);
    });
  }

  // filmroom refresh
  if (window.refreshFilmroom) window.refreshFilmroom();
}


/* ============================================================
   SAFETY SETTER
   ============================================================ */
function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

console.log("%cMULTI-MAT MIRROR READY","color:#00ddff;font-weight:bold;");
