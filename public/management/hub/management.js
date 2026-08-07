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


const managerIdentity =
  document.getElementById("managerIdentity");

const locationScope =
  document.getElementById("locationScope");

const programScope =
  document.getElementById("programScope");

const accessScope =
  document.getElementById("accessScope");

const statusEl =
  document.getElementById("status");

const signOutBtn =
  document.getElementById("signOutBtn");


function clean(value) {
  return String(value ?? "").trim();
}


function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent = message;

  statusEl.classList.toggle(
    "error",
    isError
  );
}


function formatScope(
  values,
  fallback
) {
  if (
    Array.isArray(values) &&
    values.length
  ) {
    return values.join(", ");
  }

  return fallback;
}


function displayName(context) {
  return (
    clean(context.staff.fullName) ||
    clean(context.staff.displayName) ||
    clean(context.user.email) ||
    "Approved Management Account"
  );
}


function renderManagementContext(context) {
  managerIdentity.textContent =
    `${displayName(context)} — ${
      context.user.email || "Authenticated"
    }`;

  if (context.isSystemAdmin) {
    locationScope.textContent =
      "All locations";

    programScope.textContent =
      "All programs";

    accessScope.textContent =
      "System Admin Oversight";

    setStatus(
      "System Admin oversight access verified."
    );

    return;
  }

  locationScope.textContent =
    formatScope(
      context.scope.locationIds,
      "No location assignment"
    );

  programScope.textContent =
    formatScope(
      context.scope.programIds,
      "All assigned-location programs"
    );

  accessScope.textContent =
    "Operational Management";

  setStatus(
    "Management access verified."
  );
}


async function startManagementHub() {
  try {
    const context =
      await requireManagement();

    renderManagementContext(context);

    console.log(
      "[management-hub] access granted:",
      {
        uid: context.user.uid,
        email: context.user.email,
        role: context.role,
        scope: context.scope
      }
    );

  } catch (error) {
    console.error(
      "[management-hub] access denied:",
      error
    );

    setStatus(
      error?.message ||
      "Management access could not be verified.",
      true
    );

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


signOutBtn?.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);


void startManagementHub();
