(() => {
  const STORAGE_KEY = "sandman-language";

  function getSavedLanguage() {
    const savedLanguage = localStorage.getItem(STORAGE_KEY);

    return savedLanguage === "es" ? "es" : "en";
  }

  function applyLanguage(language) {
    const selectedLanguage =
      language === "es" ? "es" : "en";

    document.documentElement.lang = selectedLanguage;
    document.body.dataset.language = selectedLanguage;

    document
      .querySelectorAll('[data-lang-block="en"]')
      .forEach((element) => {
        element.classList.toggle(
          "hidden-lang",
          selectedLanguage !== "en"
        );
      });

    document
      .querySelectorAll('[data-lang-block="es"]')
      .forEach((element) => {
        element.classList.toggle(
          "hidden-lang",
          selectedLanguage !== "es"
        );
      });

    document
      .querySelectorAll("[data-language-toggle]")
      .forEach((button) => {
        button.textContent =
          selectedLanguage === "en" ? "ES" : "EN";

        button.setAttribute(
          "aria-label",
          selectedLanguage === "en"
            ? "Cambiar el sitio a español"
            : "Switch site to English"
        );
      });

    localStorage.setItem(
      STORAGE_KEY,
      selectedLanguage
    );
  }

  function initializeLanguage() {
    const buttons = document.querySelectorAll(
      "[data-language-toggle]"
    );

    applyLanguage(getSavedLanguage());

    buttons.forEach((button) => {
      if (button.dataset.languageReady === "true") {
        return;
      }

      button.dataset.languageReady = "true";

      button.addEventListener("click", () => {
        const currentLanguage =
          document.documentElement.lang === "es"
            ? "es"
            : "en";

        applyLanguage(
          currentLanguage === "en" ? "es" : "en"
        );
      });
    });
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
})();