(() => {
  const THEME_KEYS = [
    "sandman-theme",
    "sandman-public-theme",
  ];

  function normalizeTheme(value) {
    if (value === "light" || value === "day") {
      return "light";
    }

    return "dark";
  }

  function getPreferredTheme() {
    for (const key of THEME_KEYS) {
      const savedTheme =
        localStorage.getItem(key);

      if (
        savedTheme === "light" ||
        savedTheme === "dark" ||
        savedTheme === "day" ||
        savedTheme === "night"
      ) {
        return normalizeTheme(savedTheme);
      }
    }

    return window.matchMedia(
      "(prefers-color-scheme: light)"
    ).matches
      ? "light"
      : "dark";
  }

  function saveTheme(theme) {
    localStorage.setItem(
      "sandman-theme",
      theme
    );

    /*
     * Old public-shell naming:
     * day / night
     */
    localStorage.setItem(
      "sandman-public-theme",
      theme === "light"
        ? "day"
        : "night"
    );
  }

  function applyTheme(theme) {
    const selectedTheme =
      normalizeTheme(theme);

    /*
     * Current system
     */
    document.documentElement.dataset.theme =
      selectedTheme;

    /*
     * Older marketing CSS compatibility
     */
    if (document.body) {
      document.body.classList.toggle(
        "day-mode",
        selectedTheme === "light"
      );
    }

    /*
     * New minimal journey controls
     */
    document
      .querySelectorAll("[data-theme-toggle]")
      .forEach((button) => {
        button.textContent =
          selectedTheme === "dark"
            ? "☀"
            : "☾";

        button.setAttribute(
          "aria-label",
          selectedTheme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme"
        );

        button.setAttribute(
          "title",
          selectedTheme === "dark"
            ? "Light theme"
            : "Dark theme"
        );

        button.setAttribute(
          "aria-pressed",
          String(selectedTheme === "light")
        );
      });

    /*
     * Older public-shell controls
     */
    document
      .querySelectorAll(".theme-toggle")
      .forEach((button) => {
        button.textContent =
          selectedTheme === "light"
            ? "☀"
            : "☾";

        button.setAttribute(
          "aria-label",
          selectedTheme === "light"
            ? "Switch to night mode"
            : "Switch to day mode"
        );

        button.setAttribute(
          "title",
          selectedTheme === "light"
            ? "Day mode"
            : "Night mode"
        );

        button.setAttribute(
          "aria-pressed",
          String(selectedTheme === "light")
        );
      });

    saveTheme(selectedTheme);

    document.dispatchEvent(
      new CustomEvent(
        "sandman:theme-changed",
        {
          detail: {
            theme: selectedTheme,
          },
        }
      )
    );
  }

  function connectThemeButtons() {
    document
      .querySelectorAll(
        "[data-theme-toggle], .theme-toggle"
      )
      .forEach((button) => {
        if (
          button.dataset.themeReady === "true"
        ) {
          return;
        }

        button.dataset.themeReady = "true";

        button.addEventListener("click", () => {
          const currentTheme =
            document.documentElement.dataset
              .theme === "light"
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

  function initializeTheme() {
    connectThemeButtons();

    applyTheme(
      document.documentElement.dataset.theme ||
        getPreferredTheme()
    );
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

  window.SandmanTheme = {
    applyTheme,
    getTheme: getPreferredTheme,
  };
})();
