// functions/src/infra/authzV2.ts
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";

export function requireCoachOrAdminV2(req: CallableRequest) {
  const uid = req.auth?.uid || null;
  const token = (req.auth?.token || {}) as Record<string, any>;

  // support both token.role and token.roles
const role =
  typeof token.role === "string"
    ? token.role
    : (Array.isArray(token.roles) && typeof token.roles[0] === "string" ? token.roles[0] : "");
  const roles = Array.isArray(token.roles) ? token.roles : [];

  const isCoachOrAdmin =
    role === "admin" ||
    role === "coach" ||
    roles.includes("admin") ||
    roles.includes("coach");

  if (!uid) throw new HttpsError("unauthenticated", "Sign-in required.");
  if (!isCoachOrAdmin) {
    throw new HttpsError("permission-denied", "Coach/Admin only");
  }

  return { uid, role, roles };
}
