import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const OPERATIONAL_STAFF_ROLES = Object.freeze([
  "admin", "management", "coach",
]);
export const MANAGEMENT_STAFF_ROLES = Object.freeze([
  "admin", "management",
]);
export const COACH_STAFF_ROLES = Object.freeze([
  "admin", "coach",
]);

export function normalizeStaffRole(value: unknown): string {
  const role = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "system_admin") return "admin";
  if (role === "manager" || role === "location_manager") return "management";
  return role;
}

export function normalizeStaffStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeStaffList(...values: unknown[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const clean = String(item ?? "").trim();
      if (clean) normalized.add(clean);
    }
  }
  return [...normalized];
}

export function normalizeStaffScope(staff: Record<string, unknown>) {
  return {
    organizationIds: normalizeStaffList(staff.organizationIds, staff.organizationId),
    academyIds: normalizeStaffList(staff.academyIds, staff.academyId),
    locationIds: normalizeStaffList(staff.locationIds, staff.locations, staff.locationId),
    programIds: normalizeStaffList(staff.programIds, staff.programs, staff.programId),
  };
}

export function normalizeStaffRecord(staff: Record<string, unknown>) {
  return {
    ...staff,
    rawRole: String(staff.role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_"),
    role: normalizeStaffRole(staff.role),
    status: normalizeStaffStatus(staff.status),
    scope: normalizeStaffScope(staff),
  };
}

export function staffLocationIds(staff: Record<string, unknown>): string[] {
  return normalizeStaffScope(staff).locationIds;
}

export function staffHasLocation(staff: Record<string, unknown>, locationId: unknown): boolean {
  const location = String(locationId ?? "").trim();
  return Boolean(location) && staffLocationIds(staff).includes(location);
}

export function requireStaffLocation(
  actor: { role: string; staff: Record<string, unknown> },
  locationId: unknown,
  message = "This location is outside the staff member's authorized scope."
): string {
  const location = String(locationId ?? "").trim();
  if (!location) throw new HttpsError("failed-precondition", "A valid location is required.");
  if (normalizeStaffRole(actor.role) !== "admin" && !staffHasLocation(actor.staff, location)) {
    throw new HttpsError("permission-denied", message);
  }
  return location;
}

export function requireCoachAthleteAccess(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  athlete: Record<string, unknown>,
  message = "This athlete is outside the Coach's authorized training scope."
): void {
  if (normalizeStaffRole(actor.role) === "admin") return;
  if (normalizeStaffRole(actor.role) !== "coach") {
    throw new HttpsError("permission-denied", message);
  }

  const assignedCoachIds = normalizeStaffList(
    athlete.coachUid,
    athlete.coachIds
  );
  const directlyAssigned = assignedCoachIds.includes(actor.uid);
  const locationId = String(athlete.locationId ?? "").trim();
  if (!directlyAssigned && !staffHasLocation(actor.staff, locationId)) {
    throw new HttpsError("permission-denied", message);
  }
}

export async function requireCoachAthleteAccessById(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  athleteId: unknown,
  message?: string
) {
  const id = String(athleteId ?? "").trim();
  if (!id) throw new HttpsError("invalid-argument", "A valid athlete ID is required.");
  const snap = await getFirestore().doc(`athletes/${id}`).get();
  if (!snap.exists) throw new HttpsError("not-found", `Athlete not found: ${id}`);
  const athlete = snap.data() || {};
  requireCoachAthleteAccess(actor, athlete, message);
  return athlete;
}

export function isAuthorizedStaffRecord(
  staff: Record<string, unknown>,
  allowedRoles: readonly string[]
): boolean {
  const normalizedAllowedRoles = allowedRoles.map(normalizeStaffRole);
  return normalizeStaffStatus(staff.status) === "active"
    && normalizedAllowedRoles.includes(normalizeStaffRole(staff.role));
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
  const source = snap.data() || {};
  const staff = normalizeStaffRecord(source);
  const role = staff.role;
  const status = staff.status;
  if (!isAuthorizedStaffRecord(source, allowedRoles)) {
    throw new HttpsError("permission-denied", message);
  }
  return { uid: staffUid, role, status, staff, scope: staff.scope };
}
