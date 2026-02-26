// public/assets/js/prestige-styleiq.js
// Bonus IQ (Style/IQ) — V1
// - Hidden until +5 pressed
// - First press of +5 opens selector (blocks award)
// - If open and no style picked, +5 is blocked
// - After successful award, panel collapses + clears
// - Pills show: Bull “Pressure”, etc.
// - Exports: getCurrentStyle(), onStyleIqAwarded(), initStyleIqUi()

const IQ_TRAITS = Object.freeze({
  bull:     "Pressure",
  matador:  "Precision",
  snake:    "Constriction",
  mongoose: "Scramble",
  gorilla:  "Control",
  shark:    "Hunt",
});

let currentStyle = null;
let panelOpen = false;

let styleBtn = null;
let iqBar = null;
let onStateChanged = null;

export function getCurrentStyle(){
  return currentStyle;
}

function setOpen(on){
  panelOpen = !!on;
  if (!iqBar) return;

  iqBar.style.display = panelOpen ? "flex" : "none";
  iqBar.classList.toggle("open", panelOpen);

  if (!panelOpen){
    // clear selection when closing
    currentStyle = null;
    iqBar.querySelectorAll(".iq-pill").forEach(b => b.classList.remove("active"));
  }

  if (typeof onStateChanged === "function") onStateChanged();
}

function pickStyle(style){
  if (!iqBar) return;
  const s = (style || "").toLowerCase().trim();
  if (!s) return;

  iqBar.querySelectorAll(".iq-pill").forEach(b => b.classList.remove("active"));

  const btn = iqBar.querySelector(`.iq-pill[data-style="${s}"]`);
  if (btn) btn.classList.add("active");

  currentStyle = s;
  if (typeof onStateChanged === "function") onStateChanged();
}

export function onStyleIqAwarded(){
  // after successful +5 award
  setOpen(false);
}

function formatPillLabel(styleKey, fallbackText){
  const trait = IQ_TRAITS[styleKey];
  const base = (fallbackText || styleKey || "").trim();
  return trait ? `${base} “${trait}”` : base;
}

export function initStyleIqUi({
  styleBtnId = "bulkStyle",
  iqBarId = "iqBar",
  onStateChanged: onChanged = null,
} = {}){
  styleBtn = document.getElementById(styleBtnId);
  iqBar = document.getElementById(iqBarId);
  onStateChanged = onChanged;

  if (!iqBar) return;

  // Start hidden + neutral
  setOpen(false);

  // Render labels + tooltips once
  iqBar.querySelectorAll(".iq-pill").forEach(btn => {
    const s = (btn.dataset.style || "").toLowerCase();
    const raw = (btn.textContent || "").trim() || s;
    btn.textContent = formatPillLabel(s, raw);

    const trait = IQ_TRAITS[s];
    if (trait) btn.title = `${raw} — ${trait}`;
  });

  // CAPTURE click FIRST so we can block the award when needed
  if (styleBtn){
    styleBtn.addEventListener("click", (e) => {
      // If panel closed: first click opens it and blocks award
      if (!panelOpen){
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(true);
        return;
      }

      // Panel open but no style: block award
      if (!currentStyle){
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Otherwise: allow the normal award handler to run
    }, true);
  }

  // Pick a style
  iqBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".iq-pill");
    if (!btn) return;

    const style = btn.dataset.style || "";
    pickStyle(style);

    // stays open; award happens on next +5 press (your call)
  });
}
