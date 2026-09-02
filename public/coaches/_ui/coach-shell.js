(() => {
  "use strict";
  const root = document.documentElement;
  const body = document.body;
  const content = document.querySelector("[data-coach-shell-content]");
  if (!content || document.querySelector(".coach-shell")) return;

  const pageName = body.dataset.coachPage || document.title || "Coach";
  const activeArea = body.dataset.coachArea || "";
  const navGroups = [
    { links: [["Coach Home", "/coaches/hub/", "home"]] },
    { label: "Daily Work", links: [["Athletes", "/coaches/roster/", "athletes"], ["Practice", "/coaches/execution/session-builder/", "practice"], ["Curriculum", "/coaches/cards/", "curriculum"], ["XP & Progression", "/coaches/daily-xp/", "xp"], ["Competition", "/coaches/arena-xp/", "competition"], ["Communications", "/communications/coach/broadcast.html", "communications"]] },
    { label: "Team", links: [["Team", "/coaches/team/", "team"], ["Safety", "/coaches/safety/", "safety"]] },
    { label: "Workspace", links: [["Operations Dashboard", "/coaches/dashboard/", "dashboard"], ["Command Center", "/coaches/command-center/", "command-center"], ["More Tools", "/coaches/index.html", "tools"]] }
  ];
  const practiceLinks = [["Session Builder", "/coaches/execution/session-builder/", "session-builder"], ["Attendance", "/coaches/attendance/", "attendance"], ["Practice Log", "/coaches/logs/practice-log.html", "practice-log"], ["Execution Tools", "/coaches/execution/", "execution-tools"]];
  const currentPath = window.location.pathname.replace(/\/index\.html$/, "/");
  const declaredContext = String(body.dataset.coachContext || "").trim();
  const routeContext = practiceLinks.find(([, href]) => currentPath === href || currentPath.startsWith(href))?.[2] || "";
  const activePracticeContext = declaredContext || routeContext;
  const shell = document.createElement("div");
  shell.className = "coach-shell";
  shell.innerHTML = `
    <aside id="coachShellDrawer" class="coach-shell__drawer" aria-label="Coach navigation">
      <div class="coach-shell__drawer-header"><span class="coach-shell__drawer-system">Sandman Combat System™</span><span class="coach-shell__drawer-role">Coach</span></div>
      <nav class="coach-shell__nav">${navGroups.map((group) => `${group.label ? `<div class="coach-shell__nav-label">${group.label}</div>` : ""}${group.links.map(([label, href, area]) => `<a class="coach-shell__nav-link${area === activeArea ? " is-active" : ""}" href="${href}"${area === activeArea ? ' aria-current="page"' : ""}>${label}</a>`).join("")}`).join("")}</nav>
    </aside>
    <div id="coachShellBackdrop" class="coach-shell__backdrop" hidden></div>
    <div class="coach-shell__workspace">
      <header class="coach-shell__header"><div class="coach-shell__header-inner"><div class="coach-shell__header-left"><button id="coachShellMenuToggle" class="coach-shell__menu-toggle" type="button" aria-label="Open Coach navigation" aria-expanded="false" aria-controls="coachShellDrawer">☰</button></div><div class="coach-shell__header-center"><a class="coach-shell__brand" href="/coaches/hub/">Sandman Combat System™</a><div class="coach-shell__page-name">${pageName}</div></div><div class="coach-shell__header-right"><button id="coachShellThemeToggle" class="coach-shell__theme-toggle" type="button" aria-label="Switch to light theme" title="Change theme">☀️</button></div></div><div class="coach-shell__header-line"></div></header>
      ${activeArea === "practice" ? `<div class="coach-shell__context-nav-wrap"><nav class="coach-shell__context-nav" aria-label="Practice tools">${practiceLinks.map(([label, href, context]) => { const active = context === activePracticeContext; return `<a class="coach-shell__context-link${active ? " is-active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`; }).join("")}</nav></div>` : ""}
      <div class="coach-shell__main"></div>
    </div>`;
  content.replaceWith(shell);
  shell.querySelector(".coach-shell__main").append(content);

  const menuToggle = shell.querySelector("#coachShellMenuToggle");
  const drawer = shell.querySelector("#coachShellDrawer");
  const backdrop = shell.querySelector("#coachShellBackdrop");
  const themeToggle = shell.querySelector("#coachShellThemeToggle");
  function setTheme(theme) {
    const light = theme === "light";
    root.dataset.theme = light ? "light" : "dark";
    themeToggle.textContent = light ? "🌙" : "☀️";
    themeToggle.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    themeToggle.title = light ? "Switch to dark theme" : "Switch to light theme";
    localStorage.setItem("coachHubTheme", light ? "light" : "dark");
  }
  function closeDrawer({ restoreFocus = false } = {}) {
    body.classList.remove("coach-shell-nav-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open Coach navigation");
    backdrop.hidden = true;
    if (restoreFocus && window.innerWidth <= 900) menuToggle.focus();
  }
  function openDrawer() {
    body.classList.add("coach-shell-nav-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Close Coach navigation");
    backdrop.hidden = false;
    drawer.querySelector("a")?.focus();
  }
  menuToggle.addEventListener("click", () => body.classList.contains("coach-shell-nav-open") ? closeDrawer() : openDrawer());
  backdrop.addEventListener("click", () => closeDrawer({ restoreFocus: true }));
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => { if (window.innerWidth <= 900) closeDrawer(); }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && body.classList.contains("coach-shell-nav-open")) closeDrawer({ restoreFocus: true }); });
  window.addEventListener("resize", () => { if (window.innerWidth > 900) closeDrawer(); });
  themeToggle.addEventListener("click", () => setTheme(root.dataset.theme === "light" ? "dark" : "light"));
  setTheme(localStorage.getItem("coachHubTheme") === "light" ? "light" : "dark");
  closeDrawer();
})();
