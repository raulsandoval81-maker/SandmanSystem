import { HttpsError } from "firebase-functions/v2/https";
import { normalizeStaffRole, normalizeStaffStatus } from "../services/staffAuthorization";

export const CANONICAL_STAFF_ROLES = Object.freeze(["admin", "management", "coach"]);
export const CANONICAL_STAFF_STATUSES = Object.freeze(["active", "inactive"]);
export const CANONICAL_LOCATION_IDS = Object.freeze([
  "lompoc",
  "santa-ynez-valley",
  "elk-grove",
]);

export type StaffGovernanceUpdate = Readonly<{
  staffUid: string;
  role: "admin" | "management" | "coach";
  status: "active" | "inactive";
  locationIds: string[];
}>;

export function validateStaffGovernanceUpdate(input: unknown): StaffGovernanceUpdate {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const staffUid = String(source.staffUid ?? "").trim();
  const role = String(source.role ?? "").trim().toLowerCase();
  const status = String(source.status ?? "").trim().toLowerCase();
  if (!staffUid) throw new HttpsError("invalid-argument", "staffUid is required.");
  if (!CANONICAL_STAFF_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "A canonical staff role is required.");
  }
  if (!CANONICAL_STAFF_STATUSES.includes(status)) {
    throw new HttpsError("invalid-argument", "A canonical staff status is required.");
  }
  if (!Array.isArray(source.locationIds)) {
    throw new HttpsError("invalid-argument", "locationIds must be an array.");
  }
  const locationIds = source.locationIds.map((value) => String(value ?? "").trim());
  if (locationIds.some((value) => !value || !CANONICAL_LOCATION_IDS.includes(value))) {
    throw new HttpsError("invalid-argument", "locationIds contains an unknown location.");
  }
  if (new Set(locationIds).size !== locationIds.length) {
    throw new HttpsError("invalid-argument", "locationIds cannot contain duplicates.");
  }
  if (role !== "admin" && locationIds.length === 0) {
    throw new HttpsError("invalid-argument", "Management and Coach require explicit location scope.");
  }
  return { staffUid, role: role as StaffGovernanceUpdate["role"], status: status as StaffGovernanceUpdate["status"], locationIds };
}

export function removesActiveAdmin(
  current: Record<string, unknown>,
  update: Pick<StaffGovernanceUpdate, "role" | "status">
): boolean {
  return normalizeStaffRole(current.role) === "admin"
    && normalizeStaffStatus(current.status) === "active"
    && (update.role !== "admin" || update.status !== "active");
}
