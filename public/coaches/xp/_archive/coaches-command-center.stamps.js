import { isDevMode } from "/assets/js/dev-mode.js";

/* ---------------------------------------
   Command Center — State Stamps (V1)
   Uses your real IDs: xpMode, xpLane, and picks (.pick)
   DEV state comes from isDevMode() (no guessing toggle ID)
--------------------------------------- */

const STAMP_BAR_ID = "stampBar";
const MODE_ID = "xpMode";
const LANE_ID = "xpLane";

function $(id){ return document.getElementById(id); }

function stamp(key, value, cls=""){
  return `<span class="stamp ${cls}"><span class="k">${key}</span>${value}</span>`;
}

function selectText(id){
  const el = $(id);
  if (!el) return "—";
  const text = el.options?.[el.selectedIndex]?.textContent;
  return (text || el.value || "—").trim();
}

function pickedCount(){
  return document.querySelectorAll(".pick:checked").length;
}

function paintStamps(){
  const bar = $(STAMP_BAR_ID);
  if (!bar) return;

  const mode = selectText(MODE_ID);
  const lane = selectText(LANE_ID);
  const devOn = !!isDevMode();
  const picked = pickedCount();

  bar.innerHTML = [
    stamp("Mode", mode),
    stamp("Lane", lane),
    stamp("DEV", devOn ? "ON" : "OFF", devOn ? "on" : "off"),
    stamp("Picked", String(picked), picked ? "on" : "off"),
  ].join("");
}

function wire(){
  $(MODE_ID)?.addEventListener("change", paintStamps);
  $(LANE_ID)?.addEventListener("change", paintStamps);

  // picks are dynamically rendered, so delegate
  document.addEventListener("change", (e) => {
    if (e.target?.classList?.contains("pick")) paintStamps();
  });

  // after Select All / Clear, update stamp
  document.addEventListener("click", (e) => {
    const id = e.target?.id || "";
    if (id === "pickAll" || id === "clearAll") setTimeout(paintStamps, 0);
  });

  // also repaint when the roster table re-renders
  document.addEventListener("sandman:roster-rendered", paintStamps);
}

wire();
paintStamps();
