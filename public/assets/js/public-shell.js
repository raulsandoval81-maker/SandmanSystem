(() => {
  const THEME_KEY = "sandman-public-theme";
  const LANG_KEY = "sandman-public-lang";

  const body = document.body;
  if (!body) return;

  const themeBtn = document.querySelector(".theme-toggle");
  const langButtons = [...document.querySelectorAll(".lang-btn")];

  function getTranslatableBlocks() {
    return [...document.querySelectorAll("[data-lang-block]")];
  }

  function getTranslatableImages() {
    return [
      ...document.querySelectorAll(
        "img[data-lang-src-en][data-lang-src-es]"
      ),
    ];
  }

  function applyTheme(theme) {
    const mode = theme === "night" ? "night" : "day";

    body.classList.toggle("day-mode", mode === "day");

    if (themeBtn) {
      themeBtn.textContent = mode === "day" ? "☀" : "☾";

      themeBtn.setAttribute(
        "aria-label",
        mode === "day"
          ? "Switch to night mode"
          : "Switch to day mode"
      );

      themeBtn.setAttribute(
        "title",
        mode === "day"
          ? "Day mode"
          : "Night mode"
      );
    }

    localStorage.setItem(THEME_KEY, mode);
  }

  function applyLanguage(lang) {
    const activeLang = lang === "es" ? "es" : "en";

    getTranslatableBlocks().forEach((node) => {
      const nodeLang = node.getAttribute("data-lang-block");

      node.classList.toggle(
        "hidden-lang",
        nodeLang !== activeLang
      );
    });

    getTranslatableImages().forEach((image) => {
      const nextSource =
        activeLang === "es"
          ? image.dataset.langSrcEs
          : image.dataset.langSrcEn;

      if (nextSource && image.getAttribute("src") !== nextSource) {
        image.setAttribute("src", nextSource);
      }

      const englishAlt = image.dataset.langAltEn;
      const spanishAlt = image.dataset.langAltEs;

      const nextAlt =
        activeLang === "es"
          ? spanishAlt
          : englishAlt;

      if (nextAlt) {
        image.setAttribute("alt", nextAlt);
      }
    });

    langButtons.forEach((btn) => {
      const isActive = btn.dataset.lang === activeLang;

      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    document.documentElement.lang = activeLang;
    localStorage.setItem(LANG_KEY, activeLang);
  }

  const savedTheme =
    localStorage.getItem(THEME_KEY) || "night";

  const savedLang =
    localStorage.getItem(LANG_KEY) || "en";

  applyTheme(savedTheme);
  applyLanguage(savedLang);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const nextTheme =
        body.classList.contains("day-mode")
          ? "night"
          : "day";

      applyTheme(nextTheme);
    });
  }

  langButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyLanguage(btn.dataset.lang || "en");
    });
  });

  window.SandmanPublic = {
    applyTheme,
    applyLanguage,
    getLanguage() {
      return localStorage.getItem(LANG_KEY) || "en";
    },
    getTheme() {
      return localStorage.getItem(THEME_KEY) || "night";
    },
  };
})();