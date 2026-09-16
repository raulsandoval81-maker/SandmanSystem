import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { MANAGEMENT_STAFF_ROLES, requireActiveStaff } from "../../services/staffAuthorization";
import { assertManagementPassMessage } from "./managementPassCheckoutPolicy";

type Actor = Awaited<ReturnType<typeof requireActiveStaff>>;

export type PassAttendanceDependencies = {
  loadActor(uid: string): Promise<Actor>;
  confirm(messageId: string, actor: Actor): Promise<boolean>;
};

export async function runConfirmManagementPassAttendance(
  input: { authUid?: string; messageId?: string },
  deps: PassAttendanceDependencies
) {
  if (!input.authUid) throw new HttpsError("unauthenticated", "Management authentication required.");
  const messageId = String(input.messageId ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
    throw new HttpsError("invalid-argument", "A valid messageId is required.");
  }
  const actor = await deps.loadActor(input.authUid);
  const alreadyConfirmed = await deps.confirm(messageId, actor);
  return { ok: true, messageId, alreadyConfirmed };
}

export const confirmManagementPassAttendance = onCall(async (request) => {
  const db = getFirestore();
  return runConfirmManagementPassAttendance({
    authUid: request.auth?.uid,
    messageId: request.data?.messageId,
  }, {
    loadActor: (uid) => requireActiveStaff(uid, MANAGEMENT_STAFF_ROLES,
      "Active Management or Admin access required."),
    confirm: async (messageId, actor) => {
      const ref = db.collection("general_messages").doc(messageId);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Pass request not found.");
        const message = snap.data() || {};
        assertManagementPassMessage(message, actor);
        if (message.passAttendanceConfirmedAt) return true;
        tx.update(ref, {
          passAttendanceConfirmedAt: FieldValue.serverTimestamp(),
          passAttendanceConfirmedBy: actor.uid,
        });
        return false;
      });
    },
  });
});
