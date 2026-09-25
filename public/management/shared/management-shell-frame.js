const NAV_GROUPS = Object.freeze([
  ["Communication / Admissions", [
    ["inbox", "Inbox", "/management/inbox/"],
    ["promotions", "Promotional Deals", "/connect/admissions-requests/"],
  ]],
  ["Operations", [
    ["billing", "Billing", "/management/billing/"],
    ["schedule", "Schedule", "/management/schedule/"],
    ["competition", "Competition Schedule", "/management/competition/"],
    ["attendance", "Attendance", "/management/attendance/"],
    ["logistics", "Logistics", "/management/logistics/"],
    ["reports", "Reports", "/management/reports/"],
  ]],
  ["Tools", [
    ["experience-validation", "Experience Validation", "/management/experience-validation/"],
    ["xp-adjustments", "XP Adjustments", "/management/xp-adjustments/"],
    ["pricing", "Pricing & Estimates", "/management/pricing/"],
    ["membership-tools", "Membership & Competition Tools", "/management/membership-tools/"],
  ]],
  ["Pipeline / Core", [
    ["leads", "Leads", "/connect/leads/"],
    ["appointments", "Appointments", "/connect/appointments/"],
    ["proposals", "Proposals", "/connect/proposals/"],
    ["enrollment", "Enrollment", "/intake-management/"],
    ["members", "Members", "/management/members/"],
    ["pipeline-history", "Pipeline History", "/management/pipeline-history/"],
  ]],
]);

function areaForPath(pathname = window.location.pathname) {
  return [
    ["/management/hub/", "home"],
    ["/connect/leads/", "leads"],
    ["/connect/appointments/", "appointments"],
    ["/connect/proposals/", "proposals"],
    ["/intake-management/", "enrollment"],
    ["/management/members/", "members"],
    ["/management/pipeline-history/", "pipeline-history"],
    ["/management/billing/", "billing"],
    ["/management/inbox/", "inbox"],
    ["/connect/admissions-requests/", "promotions"],
    ["/management/schedule/", "schedule"],
    ["/management/competition/", "competition"],
    ["/management/attendance/", "attendance"],
    ["/management/logistics/", "logistics"],
    ["/management/reports/", "reports"],
    ["/management/experience-validation/", "experience-validation"],
    ["/management/xp-adjustments/", "xp-adjustments"],
    ["/management/pricing/", "pricing"],
    ["/management/membership-tools/", "membership-tools"],
  ].find(([prefix]) => pathname.startsWith(prefix))?.[1] || "";
}

function navMarkup(activeArea) {
  const homeActive = activeArea === "home";
  const groups = NAV_GROUPS.map(([label, links]) => {
    const items = links.map(([area, text, href, pending]) => {
      if (!href) {
        return `<span class="sidebar-link sidebar-link--pending"><span>${text}</span><small>${pending}</small></span>`;
      }
      const active = area === activeArea;
      return `<a class="sidebar-link${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}><span>${text}</span></a>`;
    }).join("");
    return `<p class="sidebar-section-label">${label}</p>${items}`;
  }).join("");

  return `<a class="sidebar-link${homeActive ? " active" : ""}" href="/management/hub/"${homeActive ? ' aria-current="page"' : ""}><span>Management Home</span></a>${groups}`;
}

function sidebarMarkup(activeArea) {
  return `<aside id="managementSidebar" class="management-sidebar" aria-label="Management navigation">
    <div class="sidebar-brand"><p class="eyebrow">Sandman System</p><strong>Academy Management</strong></div>
    <nav class="sidebar-nav">${navMarkup(activeArea)}</nav>
    <div class="sidebar-footer"><button id="sidebarSignOutBtn" class="sidebar-signout" type="button">Sign Out</button></div>
  </aside><div id="sidebarBackdrop" class="sidebar-backdrop" hidden></div>`;
}

function headerMarkup() {
  return `<header class="management-header">
    <button id="menuToggleBtn" class="menu-toggle" type="button" aria-label="Open management navigation" aria-expanded="false" aria-controls="managementSidebar">☰</button>
    <div class="management-header__identity"><p class="eyebrow">Sandman System</p><h1>Academy Management</h1><p id="managementShellIdentity" class="identity">Verifying access...</p></div>
    <div class="header-actions"><button id="signOutBtn" class="button button-secondary" type="button">Sign Out</button></div>
  </header>`;
}

function ensureStyles() {
  if (document.querySelector('link[href="/management/hub/management.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/management/hub/management.css";
  document.head.append(link);
}

function buildLegacyShell(activeArea) {
  const ignored = new Set(["SCRIPT", "STYLE", "LINK"]);
  const contentNodes = [...document.body.children].filter((node) =>
    !ignored.has(node.tagName)
  );

  const shell = document.createElement("div");
  shell.className = "management-shell";
  shell.innerHTML = `${sidebarMarkup(activeArea)}<section class="management-main">${headerMarkup()}<div class="management-page-content"></div></section>`;
  document.body.insertBefore(shell, document.body.querySelector("script"));
  const content = shell.querySelector(".management-page-content");
  contentNodes.forEach((node) => content.append(node));
  document.body.classList.add("management-shell-host");
  return shell;
}

function normalizeShell(shell, activeArea) {
  const sidebar = shell.querySelector(".management-sidebar");
  const nav = sidebar?.querySelector(".sidebar-nav");
  if (nav) nav.innerHTML = navMarkup(activeArea);
  return shell;
}

function ensureManagementShellFrame() {
  ensureStyles();
  const activeArea = document.body.dataset.managementArea || areaForPath();
  const shell = document.querySelector(".management-shell");
  return shell ? normalizeShell(shell, activeArea) : buildLegacyShell(activeArea);
}

ensureManagementShellFrame();

export { NAV_GROUPS, areaForPath, ensureManagementShellFrame };
