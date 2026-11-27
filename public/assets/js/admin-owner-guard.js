import { requireAdmin } from "/assets/js/admin-guard.js";

export async function requireCommandCenterOwner() {
  const admin = await requireAdmin();
  if (admin.staff?.commandCenterOwner !== true) {
    throw new Error("Command Center owner access required.");
  }
  return admin;
}
