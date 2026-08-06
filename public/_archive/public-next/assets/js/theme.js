(() => {
  const STORAGE_KEY = "sandman-theme";

  function getPreferredTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY);

    if (savedTheme === "light" || savedTheme === "dark") {
      return savedTheme;
    }

    return window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches
      ? "light"
      : "dark";
  }

  function applyTheme(theme) {
    const selectedTheme =
      theme === "light" ? "light" : "dark";

    document.documentElement.dataset.theme =
      selectedTheme;

    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach((button) => {
        button.textContent =
          selectedTheme === "dark" ? "☀" : "☾";

        button.setAttribute(
          "aria-label",
          selectedTheme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme"
        );
      });

    localStorage.setItem(
      STORAGE_KEY,
      selectedTheme
    );
  }

  function initializeTheme() {
    applyTheme(
      document.documentElement.dataset.theme ||
        getPreferredTheme()
    );

    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach((button) => {
        if (button.dataset.themeReady === "true") {
          return;
        }

        button.dataset.themeReady = "true";

        button.addEventListener("click", () => {
          const currentTheme =
            document.documentElement.dataset.theme ===
            "light"
              ? "light"
              : "dark";

          applyTheme(
            currentTheme === "dark"
              ? "light"
              : "dark"
          );
        });
      });
  }

  document.addEventListener(
    "DOMContentLoaded",
    initializeTheme
  );

  document.addEventListener(
    "sandman:component-loaded",
    initializeTheme
  );

  document.addEventListener(
    "sandman:components-ready",
    initializeTheme
  );
})();