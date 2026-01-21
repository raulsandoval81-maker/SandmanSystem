/* ===================================================== */
/* SANDMAN HYBRID THEME ENGINE v1                        */
/* ===================================================== */

const root = document.documentElement;

/* Auto-mode defaults */
export function setAutoTheme(pageMode) {
  // pageMode = "day" or "night"
  root.dataset.theme = pageMode;
  localStorage.setItem("sandman-theme-auto", pageMode);
}

/* Manual override */
export function setManualTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("sandman-theme-override", theme);
}

/* Called on every page load */
export function initTheme(defaultMode) {
  const override = localStorage.getItem("sandman-theme-override");

  if (override) {
    root.dataset.theme = override;
  } else {
    // run auto
    root.dataset.theme = defaultMode;
    localStorage.setItem("sandman-theme-auto", defaultMode);
  }
}
