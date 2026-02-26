// public/coaches/arena/prestige-arena.dev.js
// Prestige Arena — DEV wiring (V1)

import {
  isDevMode,
  patchDevLinks,
  paintDevUi,
  bindDevToggle,
} from "/assets/js/dev-mode.js";

const DEV_DEFAULTS = Object.freeze({
  tournamentId: "DEV_TOURNAMENT_001",
  eventName: "DEV Prestige Event",
  armWord: "WIN",
  wonEvent: true,
  matchIq: "bull", // bull/matador/snake/mongoose/gorilla/shark
});

function $(id) {
  return document.getElementById(id);
}

function setIfEmpty(el, value) {
  if (!el) return;
  if ((el.value || "").trim()) return;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckbox(el, on) {
  if (!el) return;
  el.checked = !!on;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickIq(style) {
  const btn = document.querySelector(`.iq-pill[data-style="${style}"]`);
  if (btn) return btn.click();

  const sel = $("iqSelect");
  if (sel) {
    sel.value = style;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function maybeAutofill() {
  if (!isDevMode()) return;

  setIfEmpty($("tournamentId"), DEV_DEFAULTS.tournamentId);
  setIfEmpty($("eventName"), DEV_DEFAULTS.eventName);
  setCheckbox($("wonEvent"), DEV_DEFAULTS.wonEvent);

  const arm =
    $("armWord") ||
    $("prestigeArm") ||
    $("prestigeCode") ||
    $("winWord") ||
    document.querySelector('input[placeholder*="Type WIN"]');

  if (arm && !(arm.value || "").trim()) {
    arm.value = DEV_DEFAULTS.armWord;
    arm.dispatchEvent(new Event("input", { bubbles: true }));
    arm.dispatchEvent(new Event("change", { bubbles: true }));
  }

  clickIq(DEV_DEFAULTS.matchIq);
}

function boot() {
  paintDevUi();
  patchDevLinks();

  bindDevToggle({
    toggleId: "devModeToggle",
    onChange: () => {
      patchDevLinks();
      // If you want DEV toggle to hard-reload like other pages:
      // location.reload();
      maybeAutofill();
    },
  });

  maybeAutofill();
}

boot();
