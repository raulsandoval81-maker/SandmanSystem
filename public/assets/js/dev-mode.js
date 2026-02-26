// public/assets/js/dev-mode.js
// Sandman DEV Mode (global lens)
// - URL: ?dev=1
// - sessionStorage persists across pages
// - helpers to keep links in-sync

const DEV_KEY = "sandman_dev";

function qp() {
  return new URLSearchParams(location.search);
}

function isDevUrl() {
  return qp().get("dev") === "1";
}

function isDevSession() {
  return sessionStorage.getItem(DEV_KEY) === "1";
}

export function isDevMode() {
  return isDevUrl() || isDevSession();
}

export function setDevMode(on) {
  sessionStorage.setItem(DEV_KEY, on ? "1" : "0");

  const url = new URL(location.href);
  if (on) url.searchParams.set("dev", "1");
  else url.searchParams.delete("dev");

  history.replaceState({}, "", url.toString());
}

export function syncDevFromUrl() {
  if (isDevUrl()) sessionStorage.setItem(DEV_KEY, "1");
}

export function withDev(urlOrPath) {
  const url = new URL(urlOrPath, location.origin);
  if (isDevMode()) url.searchParams.set("dev", "1");
  else url.searchParams.delete("dev");
  return url.pathname + url.search + url.hash;
}

// Patches anchors in-place so navigation carries dev.
export function patchDevLinks(selector = 'a.pill, a[data-devlink="1"]') {
  document.querySelectorAll(selector).forEach(a => {
    const href = a.getAttribute("href");
    if (!href) return;
    // Ignore external
    if (/^https?:\/\//i.test(href)) return;
    a.setAttribute("href", withDev(href));
  });
}

// Shows/hides a banner and body class (optional but recommended)
export function paintDevUi({
  bannerId = "devBanner",
  toggleId = "devModeToggle",
  bodyClass = "dev-on",
} = {}) {
  const on = isDevMode();

  const banner = document.getElementById(bannerId);
  if (banner) banner.hidden = !on;

  const t = document.getElementById(toggleId);
  if (t) t.checked = on;

  document.body.classList.toggle(bodyClass, on);
}

export function bindDevToggle({
  toggleId = "devModeToggle",
  onChange = null, // optional callback (reload data)
} = {}) {
  const t = document.getElementById(toggleId);
  if (!t) return;

  t.addEventListener("change", () => {
    setDevMode(t.checked);
    paintDevUi({ toggleId });
    patchDevLinks();
    if (typeof onChange === "function") onChange(isDevMode());
  });
}

// Auto-sync once on import (so ?dev=1 turns on session)
syncDevFromUrl();
