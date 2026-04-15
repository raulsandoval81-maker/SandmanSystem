const body = document.body;
const themeToggle = document.getElementById("themeToggle");
const langEN = document.getElementById("langEN");
const langES = document.getElementById("langES");

// DEFAULT STATE
let theme = localStorage.getItem("coach_hub_theme") || "night";
let lang = localStorage.getItem("coach_hub_lang") || "en";

// APPLY THEME
function applyTheme() {
  body.dataset.theme = theme;

  if (!themeToggle) return;

  themeToggle.textContent = theme === "night" ? "🌙" : "☀️";

  themeToggle.setAttribute(
    "aria-label",
    theme === "night"
      ? "Switch to day mode"
      : "Switch to night mode"
  );
}

// APPLY LANGUAGE
function applyLang() {
  document.documentElement.lang = lang;

  if (langEN && langES) {
    langEN.classList.toggle("active", lang === "en");
    langES.classList.toggle("active", lang === "es");
  }

  document.querySelectorAll("[data-en]").forEach((el) => {
    el.textContent = lang === "es" ? el.dataset.es : el.dataset.en;
  });
}

// EVENTS
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    theme = theme === "night" ? "day" : "night";
    localStorage.setItem("coach_hub_theme", theme);
    applyTheme();
  });
}

if (langEN) {
  langEN.addEventListener("click", () => {
    lang = "en";
    localStorage.setItem("coach_hub_lang", lang);
    applyLang();
  });
}

if (langES) {
  langES.addEventListener("click", () => {
    lang = "es";
    localStorage.setItem("coach_hub_lang", lang);
    applyLang();
  });
}

// INIT
applyTheme();
applyLang();