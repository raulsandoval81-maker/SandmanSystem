(() => {
  const LANGUAGE_KEYS = [
    "sandman-language",
    "sandman-public-lang",
  ];

  function normalizeLanguage(value) {
    return value === "es" ? "es" : "en";
  }

  function getSavedLanguage() {
    for (const key of LANGUAGE_KEYS) {
      const value = localStorage.getItem(key);

      if (value === "en" || value === "es") {
        return value;
      }
    }

    return "en";
  }

  function saveLanguage(language) {
    LANGUAGE_KEYS.forEach((key) => {
      localStorage.setItem(key, language);
    });
  }

  function applyLanguage(language) {
    const selectedLanguage =
      normalizeLanguage(language);

    document.documentElement.lang =
      selectedLanguage;

    if (document.body) {
      document.body.dataset.language =
        selectedLanguage;
    }

    /*
     * English/Spanish content blocks
     */
    document
      .querySelectorAll("[data-lang-block]")
      .forEach((element) => {
        const blockLanguage =
          normalizeLanguage(
            element.dataset.langBlock
          );

        element.classList.toggle(
          "hidden-lang",
          blockLanguage !== selectedLanguage
        );
      });

    /*
     * English/Spanish PNGs and other images
     */
    document
      .querySelectorAll(
        "[data-lang-src-en][data-lang-src-es]"
      )
      .forEach((image) => {
        const source =
          selectedLanguage === "es"
            ? image.dataset.langSrcEs
            : image.dataset.langSrcEn;

        if (
          source &&
          image.getAttribute("src") !== source
        ) {
          image.setAttribute("src", source);
        }

        const alt =
          selectedLanguage === "es"
            ? image.dataset.langAltEs
            : image.dataset.langAltEn;

        if (alt) {
          image.setAttribute("alt", alt);
        }
      });

    /*
     * Minimal marketing toggle:
     * one button showing the language available next.
     */
    document
      .querySelectorAll("[data-language-toggle]")
      .forEach((button) => {
        button.textContent =
          selectedLanguage === "en"
            ? "ES"
            : "EN";

        button.setAttribute(
          "aria-label",
          selectedLanguage === "en"
            ? "Cambiar el sitio a español"
            : "Switch site to English"
        );

        button.setAttribute(
          "title",
          selectedLanguage === "en"
            ? "Español"
            : "English"
        );
      });

    /*
     * Older two-button public control:
     * buttons use data-lang="en" or data-lang="es".
     */
    document
      .querySelectorAll(".lang-btn[data-lang]")
      .forEach((button) => {
        const isActive =
          normalizeLanguage(button.dataset.lang) ===
          selectedLanguage;

        button.classList.toggle(
          "is-active",
          isActive
        );

        button.setAttribute(
          "aria-pressed",
          String(isActive)
        );
      });

    saveLanguage(selectedLanguage);

    document.dispatchEvent(
      new CustomEvent(
        "sandman:language-changed",
        {
          detail: {
            language: selectedLanguage,
          },
        }
      )
    );
  }

  function connectLanguageButtons() {
    document
      .querySelectorAll("[data-language-toggle]")
      .forEach((button) => {
        if (
          button.dataset.languageReady === "true"
        ) {
          return;
        }

        button.dataset.languageReady = "true";

        button.addEventListener("click", () => {
          const currentLanguage =
            document.documentElement.lang === "es"
              ? "es"
              : "en";

          applyLanguage(
            currentLanguage === "en"
              ? "es"
              : "en"
          );
        });
      });

    document
      .querySelectorAll(".lang-btn[data-lang]")
      .forEach((button) => {
        if (
          button.dataset.languageReady === "true"
        ) {
          return;
        }

        button.dataset.languageReady = "true";

        button.addEventListener("click", () => {
          applyLanguage(
            button.dataset.lang
          );
        });
      });
  }

  function initializeLanguage() {
    connectLanguageButtons();
    applyLanguage(getSavedLanguage());
  }

  document.addEventListener(
    "DOMContentLoaded",
    initializeLanguage
  );

  document.addEventListener(
    "sandman:component-loaded",
    initializeLanguage
  );

  document.addEventListener(
    "sandman:components-ready",
    initializeLanguage
  );

  window.SandmanLanguage = {
    applyLanguage,
    getLanguage: getSavedLanguage,
  };
})();
