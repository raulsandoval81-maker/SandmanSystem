// athletes-corner.js — 20% shell, no Firebase

console.log('[Athletes Corner] loaded');

const $ = (sel) => document.querySelector(sel);
const status = (msg) => {
  const el = $('#status');
  if (el) el.textContent = msg;
};

// sanity check required links exist
const REQUIRED_LINKS = [
  'a[href="./athlete-live-log.html"]',
  'a[href="./motivation.html"]',
  'a[href="./badge-ladder.html"]',
  'a[href="./calendar.html"]',
];

const missing = REQUIRED_LINKS.filter(sel => !$(sel));
if (missing.length) {
  console.warn('[Athletes Corner] Missing links:', missing);
  status(`Missing: ${missing.join(', ')}`);
} else {
  status('Ready.');
}
