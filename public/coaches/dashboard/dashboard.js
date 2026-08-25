(() => {
  const rail = document.querySelector(".coach-rail");
  const mobileToggle =
    document.getElementById("mobileRailToggle");
  const backdrop =
    document.getElementById("railBackdrop");

  const toolsToggle =
    document.getElementById("toolsToggle");
  const toolsDrawer =
    document.getElementById("toolsDrawer");
  const toolsClose =
    document.getElementById("toolsClose");

  function openRail() {
    rail?.classList.add("open");
    backdrop?.classList.add("open");
  }

  function closeRail() {
    rail?.classList.remove("open");
    backdrop?.classList.remove("open");
  }

  function openTools() {
    toolsDrawer?.classList.add("open");
    toolsDrawer?.setAttribute("aria-hidden","false");
    toolsToggle?.setAttribute("aria-expanded","true");
  }

  function closeTools() {
    toolsDrawer?.classList.remove("open");
    toolsDrawer?.setAttribute("aria-hidden","true");
    toolsToggle?.setAttribute("aria-expanded","false");
  }

  mobileToggle?.addEventListener("click", openRail);
  backdrop?.addEventListener("click", closeRail);

  toolsToggle?.addEventListener("click", () => {
    if (toolsDrawer?.classList.contains("open")) {
      closeTools();
    } else {
      openTools();
    }
  });

  toolsClose?.addEventListener("click", closeTools);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    closeRail();
    closeTools();
  });
})();
