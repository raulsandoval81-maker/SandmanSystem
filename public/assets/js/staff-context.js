export function cleanStaffValue(value) {
  return String(value ?? "").trim();
}

export function normalizeStaffRole(value) {
  const role = cleanStaffValue(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "system_admin") return "admin";
  if (role === "manager" || role === "location_manager") return "management";
  return role;
}

export function normalizeStaffStatus(value) {
  return cleanStaffValue(value).toLowerCase();
}

export function normalizeStaffList(...values) {
  const normalized = new Set();
  for (const value of values) {
    for (const item of Array.isArray(value) ? value : [value]) {
      const clean = cleanStaffValue(item);
      if (clean) normalized.add(clean);
    }
  }
  return [...normalized];
}

export function normalizeStaffScope(staff = {}) {
  return {
    organizationIds: normalizeStaffList(staff.organizationIds, staff.organizationId),
    academyIds: normalizeStaffList(staff.academyIds, staff.academyId),
    locationIds: normalizeStaffList(staff.locationIds, staff.locations, staff.locationId),
    programIds: normalizeStaffList(staff.programIds, staff.programs, staff.programId),
  };
}

export function normalizeStaffContext(staff = {}) {
  const rawRole = cleanStaffValue(staff.role).toLowerCase().replace(/[\s-]+/g, "_");
  return {
    ...staff,
    rawRole,
    role: normalizeStaffRole(rawRole),
    status: normalizeStaffStatus(staff.status),
    scope: normalizeStaffScope(staff),
  };
}

export const isActiveAdmin = (staff) => staff.status === "active" && staff.role === "admin";
export const isActiveManagement = (staff) => staff.status === "active" && staff.role === "management";
export const isActiveCoach = (staff) => staff.status === "active" && staff.role === "coach";
