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

  const staff = normalizeStaffContext(staffSnapshot.data() || {});
  const { role, status, scope } = staff;
  const isSystemAdmin = role === "admin";
  const isManagement = role === "management";

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

  const centralManagement =
    staff.centralManagement === true;

  return {
    user,

    staff: {
      id: staffSnapshot.id,
      ...staff
    },

    role,
    isSystemAdmin,
    isManagement,
    centralManagement,

    scope
  };
}
