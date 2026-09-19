import * as functions from "firebase-functions";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import { assertPassReadyToClose, passIntelligenceSummary } from "./managementPassClosePolicy";
import { assertManagementPassMessage } from "./managementPassCheckoutPolicy";
import {
  MANAGEMENT_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff,
  requireStaffLocation,
} from "../../services/staffAuthorization";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

export const storeClosedMessageIntelligence =
  functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const messageId = clean(data?.messageId);

    if (!messageId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "messageId is required."
      );
    }

    return closeManagementMessageById(messageId, context.auth.uid);
  });

export async function closeManagementMessageById(messageId: string, uid: string) {

    const actor =
      await requireActiveStaff(
        uid,
        MANAGEMENT_STAFF_ROLES,
        "Management access required."
      );

    const staff = actor.staff;
    const role = normalizeStaffRole(actor.role);

    const isAdmin =
      role === "admin";

    const isManagement =
      role === "management";

    const messageRef =
      db.collection("general_messages").doc(messageId);

    const messageSnap =
      await messageRef.get();

    if (!messageSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Message not found."
      );
    }

    const message = messageSnap.data() || {};
    const passActor = clean(message.topic) === "request-pass"
      ? await requireActiveStaff(uid, MANAGEMENT_STAFF_ROLES, "Active Management or Admin access required.")
      : null;

    const locationId =
      clean(message.locationId);

    if (isManagement && !isAdmin && !passActor) {
      requireStaffLocation(
        actor,
        locationId,
        "Message is outside Management scope."
      );
    }

    const intelligenceRef =
      db
        .collection("management_intelligence")
        .doc(messageId);

    await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(messageRef);
      if (!currentSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Message not found.");
      }
      const current = currentSnap.data() || {};
      if (clean(current.topic) === "request-pass") {
        if (!passActor) throw new functions.https.HttpsError("failed-precondition", "Pass request changed during closure.");
        assertManagementPassMessage(current, passActor);
        assertPassReadyToClose(current);
      }
      const snapshotMessage = clean(current.topic) === "request-pass" ? current : message;
      tx.set(
        intelligenceRef,
        {
          intelligenceType: "MESSAGE",
          sourceCollection: "general_messages",
          sourceMessageId: messageId,

          locationId:
            clean(snapshotMessage.locationId) || null,

          preferredOrganization:
            clean(snapshotMessage.preferredOrganization) || null,

          topic:
            clean(snapshotMessage.topic) || null,

          passType:
            clean(snapshotMessage.passType) || null,

          ...passIntelligenceSummary(snapshotMessage),

          fullName:
            clean(snapshotMessage.fullName) || null,

          email:
            clean(snapshotMessage.email) || null,

          phone:
            clean(snapshotMessage.phone) || null,

          message:
            clean(snapshotMessage.message) || null,

          responseEmail:
            clean(snapshotMessage.responseEmail) || null,

          responseSubject:
            clean(snapshotMessage.responseSubject) || null,

          responseBody:
            clean(snapshotMessage.responseBody) || null,

          assignedManagerUid:
            clean(snapshotMessage.assignedManagerUid) || null,

          respondedByUid:
            clean(snapshotMessage.respondedByUid) || null,

          respondedByRole:
            clean(snapshotMessage.respondedByRole) || null,

          originalCreatedAt:
            snapshotMessage.createdAt || null,

          respondedAt:
            snapshotMessage.respondedAt || null,

          status: "CLOSED",

          closedByUid: uid,
          closedAt: FieldValue.serverTimestamp(),

          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      tx.update(
        messageRef,
        {
          status: "CLOSED",
          messageStatus: "CLOSED",
          routingStage: "CLOSED",
          closedByUid: uid,
          closedAt: FieldValue.serverTimestamp(),
          intelligenceStored: true,
          intelligenceRecordId: messageId,
          updatedAt: FieldValue.serverTimestamp(),
        }
      );
    });

    return {
      ok: true,
      intelligenceRecordId: messageId,
    };
}
