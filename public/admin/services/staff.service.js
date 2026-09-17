import { db, functions, httpsCallable } from "/assets/js/firebase-init.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { normalizeStaffContext } from "/assets/js/staff-context.js";

const ALLOWED_ROLES = new Set([
  "coach",
  "admin",
  "management"
]);

const ALLOWED_STATUSES = new Set([
  "active",
  "inactive"
]);

export async function loadStaffRows() {
  const snap = await getDocs(collection(db, "staff"));

  return snap.docs.map(d => {
    const normalized = normalizeStaffContext(d.data() || {});
    return {
      uid: d.id,
      ...normalized,
      locationIds: normalized.scope.locationIds
    };
  });
}

export async function saveStaffAccess(
  uid,
  {
    role,
    status,
    locationIds = []
  }
) {
  if (!uid) {
    throw new Error("Missing UID");
  }

  if (!ALLOWED_ROLES.has(role)) {
    throw new Error("Invalid role");
  }

  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error("Invalid status");
  }

  if (!Array.isArray(locationIds)) throw new Error("Invalid location scope");
  const call = httpsCallable(functions, "updateStaffGovernance");
  const result = await call({ staffUid: uid, role, status, locationIds });
  return result.data;
}
