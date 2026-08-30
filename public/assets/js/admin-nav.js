const ADMIN_HOME = "/admin/hub/dashboard.html";
const sections = [
  { label: "Workspace", links: [{ label: "Admin Home", href: ADMIN_HOME }] },
  { label: "Governance & Access", links: [
    { label: "Staff & Roles", href: "/admin/people/staff.html" }
  ] },
  { label: "Operations Oversight", links: [
    { label: "Reception", href: "/admin/reception/" }
  ] },
  { label: "System", links: [
    { label: "Progression Audit", href: "/admin/system/progression-audit.html" },
    { label: "XP Master Log", href: "/admin/system/xp-master-log.html" },
    { label: "XP Adjustments", href: "/admin/system/xp-adjustments.html" }
  ] },
  { label: "Reference", links: [
    { label: "Doctrine", href: "/admin/hub/" },
    { label: "Documents", href: "/admin/docs/" }
  ] }
];

function isCurrent(path, href) {
  if (href === ADMIN_HOME) return path === href || path === "/admin/";
  if (href === "/admin/people/staff.html") return path === href || path === "/admin/people/" || path === "/admin/people/index.html";
  if (href === "/admin/hub/") return path === href || path === "/admin/hub/index.html" || path.startsWith("/admin/doctrine/");
  return href.endsWith("/") ? path.startsWith(href) : path === href;
}

function closeNavigation() {
  document.body.classList.remove("admin-nav-open");
  document.querySelector(".admin-menu-toggle")?.setAttribute("aria-expanded", "false");
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-admin-nav]").forEach((nav) => {
    sections.forEach((section) => {
      const group = document.createElement("section");
      group.className = "admin-nav-group";
      const heading = document.createElement("h2");
      heading.textContent = section.label;
      group.append(heading);

      section.links.forEach((item) => {
        const link = document.createElement("a");
        link.href = item.href;
        link.textContent = item.label;
        if (isCurrent(window.location.pathname, item.href)) link.setAttribute("aria-current", "page");
        link.addEventListener("click", closeNavigation);
        group.append(link);
      });
      nav.append(group);
    });

    const signOutButton = document.createElement("button");
    signOutButton.type = "button";
    signOutButton.className = "admin-nav__signout";
    signOutButton.textContent = "Sign Out";
    signOutButton.addEventListener("click", async () => {
      const { auth } = await import("/assets/js/firebase-init.js");
      const { signOut } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
      await signOut(auth);
      window.location.replace("/login/");
    });
    nav.append(signOutButton);
  });

  const toggle = document.querySelector(".admin-menu-toggle");
  const backdrop = document.querySelector(".admin-sidebar-backdrop");
  toggle?.addEventListener("click", () => {
    const opening = !document.body.classList.contains("admin-nav-open");
    document.body.classList.toggle("admin-nav-open", opening);
    toggle.setAttribute("aria-expanded", String(opening));
  });
  backdrop?.addEventListener("click", closeNavigation);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
  });
});
