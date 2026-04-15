(() => {
  const THEME_KEY = "sandman-public-theme";
  const LANG_KEY = "sandman-public-lang";

  const body = document.body;
  if (!body) return;

  const themeBtn = document.querySelector(".theme-toggle");
  const langButtons = [...document.querySelectorAll(".lang-btn")];
  const translatable = [...document.querySelectorAll("[data-lang-block]")];

  function applyTheme(theme) {
    const mode = theme === "night" ? "night" : "day";
    body.classList.toggle("day-mode", mode === "day");

    if (themeBtn) {
      themeBtn.textContent = mode === "day" ? "☀" : "☾";
      themeBtn.setAttribute(
        "aria-label",
        mode === "day" ? "Switch to night mode" : "Switch to day mode"
      );
      themeBtn.setAttribute("title", mode === "day" ? "Day mode" : "Night mode");
    }

    localStorage.setItem(THEME_KEY, mode);
  }

  function applyLanguage(lang) {
    const activeLang = lang === "es" ? "es" : "en";

    translatable.forEach((node) => {
      const nodeLang = node.getAttribute("data-lang-block");
      node.classList.toggle("hidden-lang", nodeLang !== activeLang);
    });

    langButtons.forEach((btn) => {
      const isActive = btn.dataset.lang === activeLang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    localStorage.setItem(LANG_KEY, activeLang);
    document.documentElement.lang = activeLang;
  }

  const savedTheme = localStorage.getItem(THEME_KEY) || "night";
  const savedLang = localStorage.getItem(LANG_KEY) || "en";

  applyTheme(savedTheme);
  applyLanguage(savedLang);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = body.classList.contains("day-mode") ? "night" : "day";
      applyTheme(next);
    });
  }

  langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyLanguage(btn.dataset.lang || "en");
    });
  });
})();