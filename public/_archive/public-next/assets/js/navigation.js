(() => {
  function initializeNavigation() {
    const navToggle = document.querySelector(".nav-toggle");
    const siteNav = document.querySelector("#primary-navigation");

    if (!navToggle || !siteNav) {
      return;
    }

    /*
     * Prevent duplicate event listeners if initialization
     * runs more than once.
     */
    if (navToggle.dataset.navigationReady === "true") {
      return;
    }

    navToggle.dataset.navigationReady = "true";

    function closeNavigation() {
      siteNav.classList.remove("is-open");
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open navigation");
    }

    function openNavigation() {
      siteNav.classList.add("is-open");
      navToggle.classList.add("is-open");
      navToggle.setAttribute("aria-expanded", "true");
      navToggle.setAttribute("aria-label", "Close navigation");
    }

    navToggle.addEventListener("click", () => {
      const isOpen =
        navToggle.getAttribute("aria-expanded") === "true";

      if (isOpen) {
        closeNavigation();
      } else {
        openNavigation();
      }
    });

    siteNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeNavigation);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) {
        closeNavigation();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeNavigation();
      }
    });
  }

  document.addEventListener(
    "DOMContentLoaded",
    initializeNavigation
  );

  document.addEventListener(
    "sandman:component-loaded",
    initializeNavigation
  );

  document.addEventListener(
    "sandman:components-ready",
    initializeNavigation
  );
})();