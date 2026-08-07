import {
  auth,
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";


const MANAGEMENT_ROLES = new Set([
  "management",
  "manager",
  "location_manager"
]);


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


export function managementLoginUrl() {
  const returnUrl =
    window.location.pathname +
    window.location.search;

  return (
    "/management/auth/?returnUrl=" +
    encodeURIComponent(returnUrl)
  );
}


export async function requireManagement() {
  const user =
    auth.currentUser ||
    await waitForAuthUser();

  if (!user || user.isAnonymous) {
    throw new Error(
      "Management authentication required."
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

  const staff = staffSnapshot.data();

  const role =
    clean(staff.role).toLowerCase();

  const status =
    clean(staff.status).toLowerCase();

  const isSystemAdmin =
    role === "admin";

  const isManagement =
    MANAGEMENT_ROLES.has(role);

  if (!isSystemAdmin && !isManagement) {
    throw new Error(
      "Management access required."
    );
  }

  if (status !== "active") {
    throw new Error(
      "Management profile is not active."
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

    staff: {
      id: staffSnapshot.id,
      ...staff
    },

    role,
    isSystemAdmin,
    isManagement,

    scope: {
      organizationIds,
      academyIds,
      locationIds,
      programIds
    }
  };
}
