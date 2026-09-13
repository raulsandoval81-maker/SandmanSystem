import {
  auth
} from "/assets/js/firebase-init.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  managementLoginUrl,
  requireManagement
} from "/management/shared/guards/management-guard.js";

import {
  ensureManagementShellFrame
} from "/management/shared/management-shell-frame.js";

ensureManagementShellFrame();


const managerIdentity =
  document.getElementById("managementShellIdentity") ||
  document.getElementById("managerIdentity");

const signOutBtn =
  document.getElementById("signOutBtn");

const sidebarSignOutBtn =
  document.getElementById("sidebarSignOutBtn");

const managementSidebar =
  document.getElementById("managementSidebar");

const menuToggleBtn =
  document.getElementById("menuToggleBtn");

const sidebarBackdrop =
  document.getElementById("sidebarBackdrop");


function clean(value) {
  return String(value ?? "").trim();
}


function displayName(context) {
  return (
    clean(context.staff?.fullName) ||
    clean(context.staff?.displayName) ||
    clean(context.user?.email) ||
    "Approved Management Account"
  );
}


function setSidebarOpen(open) {
  if (!managementSidebar) return;

  managementSidebar.classList.toggle(
    "is-open",
    open
  );

  menuToggleBtn?.setAttribute(
    "aria-expanded",
    String(open)
  );

  if (sidebarBackdrop) {
    sidebarBackdrop.hidden = !open;
  }

  document.body.style.overflow =
    open ? "hidden" : "";
}


async function handleSignOut() {
  await signOut(auth);

  window.location.replace(
    "/login/"
  );
}


async function startManagementShell() {
  try {
    const context =
      await requireManagement();

    if (managerIdentity) {
      managerIdentity.textContent =
        `${displayName(context)} — ${
          context.user?.email ||
          "Authenticated"
        }`;
    }

    console.log(
      "[management-shell] access granted:",
      {
        uid: context.user?.uid,
        role: context.role,
        scope: context.scope
      }
    );

  } catch (error) {
    console.error(
      "[management-shell] access denied:",
      error
    );

    if (managerIdentity) {
      managerIdentity.textContent =
        error?.message ||
        "Management access could not be verified.";
    }

    const noAuthenticatedUser =
      !auth.currentUser ||
      auth.currentUser.isAnonymous;

    window.setTimeout(
      () => {
        window.location.replace(
          noAuthenticatedUser
            ? managementLoginUrl()
            : "/login/"
        );
      },
      1200
    );
  }
}


menuToggleBtn?.addEventListener(
  "click",
  () => {
    const open =
      !managementSidebar?.classList.contains(
        "is-open"
      );

    setSidebarOpen(open);
  }
);


sidebarBackdrop?.addEventListener(
  "click",
  () => {
    setSidebarOpen(false);
  }
);


document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
    }
  }
);


managementSidebar
  ?.querySelectorAll("a")
  .forEach((link) => {
    link.addEventListener(
      "click",
      () => {
        if (
          window.matchMedia(
            "(max-width: 820px)"
          ).matches
        ) {
          setSidebarOpen(false);
        }
      }
    );
  });


signOutBtn?.addEventListener(
  "click",
  handleSignOut
);


sidebarSignOutBtn?.addEventListener(
  "click",
  handleSignOut
);


void startManagementShell();
