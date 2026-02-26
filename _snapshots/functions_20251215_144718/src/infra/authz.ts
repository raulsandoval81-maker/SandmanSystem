// functions/src/infra/authz.ts
import * as functions from "firebase-functions";

export function requireCoachOrAdmin(ctx: functions.https.CallableContext) {
  const uid = ctx.auth?.uid;
  const claims = (ctx.auth?.token || {}) as Record<string, any>;
  const roles: string[] = Array.isArray(claims.roles) ? claims.roles : [];

  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Sign-in required.");
  if (!roles.includes("admin") && !roles.includes("coach")) {
    throw new functions.https.HttpsError("permission-denied", "Coach or Admin role required.");
  }
  return { uid, roles };
}
