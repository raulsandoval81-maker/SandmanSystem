import {
  auth
} from "/assets/js/firebase-init.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

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

function setStatus(
  message = "",
  isError = false
) {
  statusEl.textContent = message;

  statusEl.classList.toggle(
    "error",
    isError
  );
}

function formatScope(
  value,
  fallback
) {
  if (
    Array.isArray(value) &&
    value.length
  ) {
    return value.join(", ");
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  return fallback;
}

async function verifyManagementUser(
  user
) {
  const token =
    await user.getIdTokenResult(true);

  const claims =
    token.claims || {};

  const isSystemAdmin =
    claims.admin === true;

  const isManager =
    claims.manager === true;

  if (
    !isSystemAdmin &&
    !isManager
  ) {
    throw new Error(
      "Management permission required."
    );
  }

  managerIdentity.textContent =
    user.email || "Approved Management Account";

  locationScope.textContent =
    isSystemAdmin
      ? "All locations"
      : formatScope(
          claims.locationIds ||
          claims.locations,
          "Assigned locations"
        );

  programScope.textContent =
    isSystemAdmin
      ? "All programs"
      : formatScope(
          claims.programIds ||
          claims.programs,
          "Assigned programs"
        );

  accessScope.textContent =
    isSystemAdmin
      ? "System Admin"
      : "Location / Program Manager";

  setStatus(
    "Management access verified."
  );
}

onAuthStateChanged(
  auth,
  async (user) => {
    if (!user) {
      const destination =
        "/management/auth/" +
        "?returnUrl=" +
        encodeURIComponent(
          window.location.pathname +
          window.location.search
        );

      window.location.replace(
        destination
      );

      return;
    }

    try {
      await verifyManagementUser(
        user
      );
    } catch (error) {
      console.error(
        "[management-hub] access denied:",
        error
      );

      setStatus(
        "This account does not have Management access.",
        true
      );

      setTimeout(
        () => {
          window.location.replace(
            "/login/"
          );
        },
        1200
      );
    }
  }
);

signOutBtn.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);
