import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MANAGEMENT_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff,
  requireStaffLocation,
} from "../../services/staffAuthorization";

const clean = (value: unknown) => String(value ?? "").trim();

export function assertCanMarkManagementResponded(
  message: Record<string, any>,
  actor: { uid: string; role: string; staff: Record<string, unknown> }
) {
  requireStaffLocation(actor, message.locationId);
  if ([message.status, message.messageStatus, message.routingStage]
    .some((value) => clean(value).toUpperCase() === "CLOSED")) {
    throw new HttpsError("failed-precondition", "This message is already closed.");
  }
  if (normalizeStaffRole(actor.role) === "management") {
    const assigned = clean(message.assignedManagerUid) === actor.uid;
    const pending = !clean(message.assignedManagerUid)
      && clean(message.assignmentStatus) === "PENDING_MANAGEMENT";
    if (!assigned && !pending) {
      throw new HttpsError("permission-denied", "This message is outside your Management queue.");
    }
  }
}

export const markManagementMessageResponded = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Management sign-in required.");
  const messageId = clean(request.data?.messageId);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
    throw new HttpsError("invalid-argument", "A valid messageId is required.");
  }
  const actor = await requireActiveStaff(uid, MANAGEMENT_STAFF_ROLES);
  const ref = getFirestore().collection("general_messages").doc(messageId);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Message not found.");
    const message = snap.data() || {};
    assertCanMarkManagementResponded(message, actor);
    if (clean(message.messageStatus).toUpperCase() === "RESPONDED") return;
    tx.update(ref, {
      assignedManagerUid: uid,
      status: "RESPONDED",
      messageStatus: "RESPONDED",
      routingStage: "MANAGEMENT_RESPONDED",
      assignmentStatus: "ASSIGNED",
      respondedByUid: uid,
      respondedByRole: normalizeStaffRole(actor.role) === "admin" ? "SYSTEM_ADMIN" : "MANAGEMENT",
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true, messageId };
});
