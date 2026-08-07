export function getManagementContext(staff = {}) {
  return {
    organizationId:
      staff.organizationId ||
      staff.academyId ||
      null,

    locationId:
      staff.locationId ||
      null,

    role:
      staff.role ||
      null
  };
}
