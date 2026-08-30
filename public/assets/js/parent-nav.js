const navGroups = [
  { label: "", links: [
    { label: "Home", href: "/parent/" },
    { label: "My Athletes", href: "/parent/my-athlete/" },
    { label: "Schedule", href: "/parent/schedule/" }
  ] },
  { label: "Communications", links: [
    { label: "Messages", href: "/parent/messages/" },
    { label: "Announcements", href: "/communications/parent/announcements-feed.html" },
    { label: "Updates", href: "/parent/updates/" }
  ] },
  { label: "", links: [
    { label: "Resources", href: "/parent/system/" },
    { label: "Settings", href: "/parent/settings/" }
  ] }
];

function current(path, href) {
  if (href === "/parent/") return path === href || path === "/parent/index.html";
  if (href === "/parent/messages/") return path.startsWith(href) || path === "/communications/parent/" || path.endsWith("/communications/parent/index.html") || path.endsWith("/communications/parent/compose.html") || path.endsWith("/communications/parent/thread.html");
  return href.endsWith("/") ? path.startsWith(href) : path === href;
}

function closeParentNav(returnFocus = false) {
  document.body.classList.remove("parent-nav-open");
  const toggle = document.querySelector(".parent-menu-toggle");
  toggle?.setAttribute("aria-expanded", "false");
  if (returnFocus) toggle?.focus();
}

export function initParentNavigation() {
  if (document.querySelector(".parent-member-header")) return;
  if (!document.querySelector('link[href="/parent/parent.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/parent/parent.css";
    document.head.append(link);
  }

  document.body.classList.add("parent-member-app");
  const header = document.createElement("header");
  header.className = "parent-member-header";
  header.innerHTML = `<div><p>Sandman Family</p><a href="/parent/">Parent</a></div><button class="parent-menu-toggle" type="button" aria-expanded="false" aria-controls="parentSidebar"><span aria-hidden="true">☰</span><span>Menu</span></button>`;

  const aside = document.createElement("aside");
  aside.id = "parentSidebar";
  aside.className = "parent-member-sidebar";
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Parent navigation");

  navGroups.forEach((groupData) => {
    const group = document.createElement("section");
    group.className = "parent-nav-group";
    const heading = document.createElement("h2");
    if (groupData.label) {
      heading.textContent = groupData.label;
      group.append(heading);
    }
    groupData.links.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.label;
      if (current(window.location.pathname, item.href)) link.setAttribute("aria-current", "page");
      link.addEventListener("click", () => closeParentNav(false));
      group.append(link);
    });
    nav.append(group);
  });

  const signOutButton = document.createElement("button");
  signOutButton.type = "button";
  signOutButton.className = "parent-signout";
  signOutButton.textContent = "Sign Out";
  signOutButton.addEventListener("click", async () => {
    const { auth } = await import("/assets/js/firebase-init.js");
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js");
    await signOut(auth);
    window.location.replace("/login/");
  });
  nav.append(signOutButton);
  aside.append(nav);

  const backdrop = document.createElement("button");
  backdrop.className = "parent-nav-backdrop";
  backdrop.type = "button";
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-label", "Close Parent navigation");

  document.body.prepend(backdrop);
  document.body.prepend(aside);
  document.body.prepend(header);

  const toggle = header.querySelector(".parent-menu-toggle");
  toggle.addEventListener("click", () => {
    const opening = !document.body.classList.contains("parent-nav-open");
    document.body.classList.toggle("parent-nav-open", opening);
    toggle.setAttribute("aria-expanded", String(opening));
    if (opening) window.setTimeout(() => aside.querySelector("a")?.focus(), 0);
  });
  backdrop.addEventListener("click", () => closeParentNav(true));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("parent-nav-open")) closeParentNav(true);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initParentNavigation);
} else {
  initParentNavigation();
}
