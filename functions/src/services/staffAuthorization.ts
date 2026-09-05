import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const OPERATIONAL_STAFF_ROLES = Object.freeze([
  "admin", "system_admin", "management", "manager", "location_manager", "coach",
]);
export const MANAGEMENT_STAFF_ROLES = Object.freeze([
  "admin", "system_admin", "management", "manager", "location_manager",
]);

export function normalizeStaffRole(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isAuthorizedStaffRecord(
  staff: Record<string, unknown>,
  allowedRoles: readonly string[]
): boolean {
  return String(staff.status ?? "").trim().toLowerCase() === "active"
    && allowedRoles.includes(normalizeStaffRole(staff.role));
}

export async function requireActiveStaff(
  uid: unknown,
  allowedRoles: readonly string[],
  message = "Active staff access required."
) {
  const staffUid = String(uid ?? "").trim();
  if (!staffUid) throw new HttpsError("unauthenticated", "Sign-in required.");
  const snap = await getFirestore().doc(`staff/${staffUid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", message);
  const staff = snap.data() || {};
  const role = normalizeStaffRole(staff.role);
  const status = String(staff.status ?? "").trim().toLowerCase();
  if (!isAuthorizedStaffRecord(staff, allowedRoles)) {
    throw new HttpsError("permission-denied", message);
  }
  return { uid: staffUid, role, status, staff };
}
