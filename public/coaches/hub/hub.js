(() => {
  "use strict";

  const root = document.documentElement;

  const langEN = document.getElementById("langEN");
  const langES = document.getElementById("langES");
  const hubImage = document.getElementById("coachHubImage");
  const themeToggle = document.getElementById("themeToggle");

  if (
    !langEN ||
    !langES ||
    !hubImage ||
    !themeToggle
  ) {
    return;
  }

  function setLanguage(language) {
    const spanish = language === "es";

    root.lang = spanish ? "es" : "en";

    document
      .querySelectorAll("[data-en][data-es]")
      .forEach((element) => {
        element.textContent = spanish
          ? element.dataset.es
          : element.dataset.en;
      });

    hubImage.src = spanish
      ? "/assets/images/sandman-coaches-hub-es.png?v-2"
      : "/assets/images/sandman-coaches-hub-en.png?v-2";

    hubImage.alt = spanish
      ? "Misión, credo, código, meta y estándares del Centro de Entrenadores Sandman"
      : "Sandman Coaches Hub mission, creed, code, goal, and standards";

    langEN.classList.toggle("active", !spanish);
    langES.classList.toggle("active", spanish);

    langEN.setAttribute(
      "aria-pressed",
      String(!spanish)
    );

    langES.setAttribute(
      "aria-pressed",
      String(spanish)
    );

    localStorage.setItem(
      "coachHubLanguage",
      spanish ? "es" : "en"
    );
  }

  function setTheme(theme) {
    const lightTheme = theme === "light";

    root.dataset.theme = lightTheme
      ? "light"
      : "dark";

    themeToggle.textContent = lightTheme
      ? "🌙"
      : "☀️";

    themeToggle.setAttribute(
      "aria-label",
      lightTheme
        ? "Switch to dark theme"
        : "Switch to light theme"
    );

    themeToggle.title = lightTheme
      ? "Switch to dark theme"
      : "Switch to light theme";

    localStorage.setItem(
      "coachHubTheme",
      lightTheme ? "light" : "dark"
    );
  }

  langEN.addEventListener("click", () => {
    setLanguage("en");
  });

  langES.addEventListener("click", () => {
    setLanguage("es");
  });

  themeToggle.addEventListener("click", () => {
    const currentTheme =
      root.dataset.theme === "light"
        ? "light"
        : "dark";

    setTheme(
      currentTheme === "light"
        ? "dark"
        : "light"
    );
  });

  setLanguage(
    localStorage.getItem("coachHubLanguage") === "es"
      ? "es"
      : "en"
  );

  setTheme(
    localStorage.getItem("coachHubTheme") === "light"
      ? "light"
      : "dark"
  );
})();