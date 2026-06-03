// Bootstraps the split without changing your DOM.
// Safe to run even if some elements are missing.

import { initUI }     from "./silver.ui.js";
import { initWaiver } from "./silver.waiver.js";
import { initCore }   from "./silver.core.js";

// expose tiny helper some of your inline code expects
export function coachLockActive() {
  const until = Number(window.__coachLockUntil || 0);
  return Boolean(window.__stayOnCoach && Date.now() < until);
}
window.coachLockActive = coachLockActive;

document.addEventListener("DOMContentLoaded", () => {
  initUI();
  initWaiver();
  initCore();
});
