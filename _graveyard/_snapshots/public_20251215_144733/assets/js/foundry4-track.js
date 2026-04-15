// foundry4-track.js  — one tiny tracker for ALL Foundry4 pages
// Usage: set data-track & (optionally) data-event on <body>, and add id="enterProgram" on the CTA.

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const KEY   = body?.dataset?.track || "foundry4_page";
  const EVT   = body?.dataset?.event || `${KEY}_enter`;
  const cta   = document.querySelector("#enterProgram");

  prime(KEY);
  if (cta) {
    cta.addEventListener("click", () => {
      bump(KEY, "ctaClicks");
      track(EVT);
    });
  }

  // mark page view
  bump(KEY, "views");
  track(`${KEY}_view`);
  console.log(`[Foundry4] Ready: key=${KEY}, event=${EVT}`);
});

function prime(key) {
  const now = new Date().toISOString();
  const stash = read(key);
  write(key, { ...stash, lastVisit: now, visits: (stash.visits || 0) + 1 });
}

function bump(key, field) {
  const stash = read(key);
  stash[field] = (stash[field] || 0) + 1;
  write(key, stash);
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); }
  catch { return {}; }
}

function write(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

// Swap this later for Firebase/Analytics
export function track(eventName, payload = {}) {
  // Example future hook:
  // import { analytics, logEvent } from './firebase-init.js'
  // logEvent(analytics, eventName, payload)
  console.debug("[track]", eventName, payload);
}
