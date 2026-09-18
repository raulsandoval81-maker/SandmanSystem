import {
  auth,
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { normalizeStaffContext } from "/assets/js/staff-context.js";

export class CoachAccessError extends Error {
  constructor(code, message, diagnostic = {}) {
    super(message);
    this.name = "CoachAccessError";
    this.code = code;
    this.diagnostic = diagnostic;
  }
}

export function isCoachAuthenticationError(error) {
  return error?.code === "coach/authentication-required";
}


function clean(value) {
  return String(value ?? "").trim();
}


function waitForAuthUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}


export function coachLoginUrl() {
  const returnUrl =
    window.location.pathname +
    window.location.search;

  return (
    "/coaches/auth/login.html?returnUrl=" +
    encodeURIComponent(returnUrl)
  );
}


export async function requireCoach() {
  const user =
    auth.currentUser ||
    await waitForAuthUser();

  if (!user || user.isAnonymous) {
    throw new CoachAccessError(
      "coach/authentication-required",
      "Coach authentication required.",
      { authenticated: false }
    );
  }

  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims || {};
  const diagnostic = {
    authenticated: true,
    uid: user.uid,
    email: user.email || "",
    claims: {
      role: clean(claims.role).toLowerCase(),
      coach: claims.coach === true,
      admin: claims.admin === true
    },
    staffExists: false,
    staffRole: "",
    staffStatus: "",
    locationIds: []
  };

  const staffRef = doc(
    db,
    "staff",
    user.uid
  );

  const staffSnapshot =
    await getDoc(staffRef);

  if (!staffSnapshot.exists()) {
    throw new CoachAccessError(
      "coach/staff-profile-missing",
      "No active Coach staff profile was found for this account.",
      diagnostic
    );
  }

  const staff = normalizeStaffContext(staffSnapshot.data() || {});
  const { role, status, scope } = staff;

  diagnostic.staffExists = true;
  diagnostic.staffRole = role;
  diagnostic.staffStatus = status;

  const isSystemAdmin = role === "admin";
  const isCoach = role === "coach";

  if (!isSystemAdmin && !isCoach) {
    throw new CoachAccessError(
      "coach/staff-role-denied",
      "This signed-in account does not have Coach access.",
      diagnostic
    );
  }

  if (status !== "active") {
    throw new CoachAccessError(
      "coach/staff-inactive",
      "This Coach staff profile is not active.",
      diagnostic
    );
  }

  diagnostic.locationIds = scope.locationIds;

  return {
    user,

    uid: user.uid,
    email: user.email || "",

    staff: {
      id: staffSnapshot.id,
      ...staff
    },

    role,
    status,
    isSystemAdmin,
    isCoach,

    scope,
    diagnostic
  };
}
