import {
  auth,
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";


function clean(value) {
  return String(value ?? "").trim();
}


function normalizeList(...values) {
  const result = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const cleaned = clean(item);

        if (
          cleaned &&
          !result.includes(cleaned)
        ) {
          result.push(cleaned);
        }
      }

      continue;
    }

    const cleaned = clean(value);

    if (
      cleaned &&
      !result.includes(cleaned)
    ) {
      result.push(cleaned);
    }
  }

  return result;
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
    throw new Error(
      "Coach authentication required."
    );
  }

  const staffRef = doc(
    db,
    "staff",
    user.uid
  );

  const staffSnapshot =
    await getDoc(staffRef);

  if (!staffSnapshot.exists()) {
    throw new Error(
      "No staff profile found."
    );
  }

  const staff =
    staffSnapshot.data() || {};

  const role =
    clean(staff.role).toLowerCase();

  const status =
    clean(staff.status).toLowerCase();

  const isSystemAdmin =
    role === "admin";

  const isCoach =
    role === "coach";

  if (!isSystemAdmin && !isCoach) {
    throw new Error(
      "Coach access required."
    );
  }

  if (status !== "active") {
    throw new Error(
      "Coach profile is not active."
    );
  }

  const organizationIds = normalizeList(
    staff.organizationIds,
    staff.organizationId
  );

  const academyIds = normalizeList(
    staff.academyIds,
    staff.academyId
  );

  const locationIds = normalizeList(
    staff.locationIds,
    staff.locations,
    staff.locationId
  );

  const programIds = normalizeList(
    staff.programIds,
    staff.programs,
    staff.programId
  );

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

    scope: {
      organizationIds,
      academyIds,
      locationIds,
      programIds
    }
  };
}
