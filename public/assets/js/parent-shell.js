const langBtns = document.querySelectorAll(".lang-btn");
const themeBtns = document.querySelectorAll(".theme-btn");
const toggle = document.getElementById("themeToggle");

function setLang(lang) {
  const normalized = lang === "sp" ? "es" : (lang || "en");
  const isSpanish = normalized === "es";

  localStorage.setItem("lang", normalized);
  document.body.classList.toggle("lang-es", isSpanish);

  langBtns.forEach((btn) => {
    const btnLang = btn.dataset.lang === "sp" ? "es" : btn.dataset.lang;
    btn.classList.toggle("active", btnLang === normalized);
  });

  document.querySelectorAll(".en").forEach((el) => {
    el.style.display = isSpanish ? "none" : "";
  });

  document.querySelectorAll(".es").forEach((el) => {
    el.style.display = isSpanish ? "" : "none";
  });
}

function setTheme(theme) {
  const normalized = theme === "day" ? "day" : "night";
  const isDay = normalized === "day";

  localStorage.setItem("parent-theme", normalized);

  document.body.classList.toggle("day", isDay);
  document.body.classList.toggle("theme-day", isDay);
  document.body.classList.toggle("theme-night", !isDay);

  themeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === normalized);
  });

  if (toggle) {
    toggle.textContent = isDay ? "🌙" : "☀️";
  }
}

function getParentAthleteUidFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(
    params.get("uid") ||
    params.get("id") ||
    params.get("athleteUid") ||
    ""
  ).trim().toUpperCase();
}

function wireParentTabsGlobal() {
  const athleteUid = getParentAthleteUidFromUrl();
  if (!athleteUid) return;

  document
    .querySelectorAll(".hub-mark, .parent-tab, .parent-tabs a, .parent-subtabs a")
    .forEach((a) => {
      const href = a.getAttribute("href");
      if (!href) return;

      const url = new URL(href, window.location.origin);
      url.searchParams.set("uid", athleteUid);
      a.setAttribute("href", url.pathname + url.search);
    });
}

function initParentShell() {
  langBtns.forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  themeBtns.forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.dataset.theme));
  });

  toggle?.addEventListener("click", () => {
    const isDay = document.body.classList.contains("day");
    setTheme(isDay ? "night" : "day");
  });

  setLang(localStorage.getItem("lang") || "en");
  setTheme(localStorage.getItem("parent-theme") || "night");
  wireParentTabsGlobal();
}

document.addEventListener("DOMContentLoaded", initParentShell);