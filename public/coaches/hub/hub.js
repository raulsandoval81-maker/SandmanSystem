(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;

  const langEN = document.getElementById("langEN");
  const langES = document.getElementById("langES");
  const themeToggle = document.getElementById("themeToggle");

  const menuToggle = document.getElementById("menuToggle");
  const coachDrawer = document.getElementById("coachDrawer");
  const drawerBackdrop = document.getElementById("drawerBackdrop");

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

    if (langEN) {
      langEN.classList.toggle("active", !spanish);

      langEN.setAttribute(
        "aria-pressed",
        String(!spanish)
      );
    }

    if (langES) {
      langES.classList.toggle("active", spanish);

      langES.setAttribute(
        "aria-pressed",
        String(spanish)
      );
    }

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

    if (themeToggle) {
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
    }

    localStorage.setItem(
      "coachHubTheme",
      lightTheme ? "light" : "dark"
    );
  }

  function openDrawer() {
    body.classList.add("drawer-open");

    if (menuToggle) {
      menuToggle.setAttribute(
        "aria-expanded",
        "true"
      );

      menuToggle.setAttribute(
        "aria-label",
        "Close Coach navigation"
      );
    }

    if (drawerBackdrop) {
      drawerBackdrop.hidden = false;
    }
  }

  function closeDrawer() {
    body.classList.remove("drawer-open");

    if (menuToggle) {
      menuToggle.setAttribute(
        "aria-expanded",
        "false"
      );

      menuToggle.setAttribute(
        "aria-label",
        "Open Coach navigation"
      );
    }

    if (drawerBackdrop) {
      drawerBackdrop.hidden = true;
    }
  }

  function toggleDrawer() {
    if (body.classList.contains("drawer-open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  langEN?.addEventListener("click", () => {
    setLanguage("en");
  });

  langES?.addEventListener("click", () => {
    setLanguage("es");
  });

  themeToggle?.addEventListener("click", () => {
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

  menuToggle?.addEventListener(
    "click",
    toggleDrawer
  );

  drawerBackdrop?.addEventListener(
    "click",
    closeDrawer
  );

  coachDrawer
    ?.querySelectorAll("a")
    .forEach((link) => {
      link.addEventListener("click", () => {
        if (window.innerWidth <= 900) {
          closeDrawer();
        }
      });
    });

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        body.classList.contains("drawer-open")
      ) {
        closeDrawer();
      }
    }
  );

  window.addEventListener(
    "resize",
    () => {
      if (window.innerWidth > 900) {
        closeDrawer();
      }
    }
  );

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

  closeDrawer();
})();
