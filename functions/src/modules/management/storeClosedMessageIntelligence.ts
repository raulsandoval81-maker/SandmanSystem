import * as functions from "firebase-functions";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

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

    const uid = context.auth.uid;

    const staffSnap =
      await db.collection("staff").doc(uid).get();

    const staff = staffSnap.data() || {};
    const role = clean(staff.role).toLowerCase();
    const status = clean(staff.status).toLowerCase();

    const isAdmin =
      role === "admin" ||
      role === "system_admin";

    const isManagement =
      role === "management" ||
      role === "manager" ||
      role === "location_manager";

    if (
      status !== "active" ||
      (!isAdmin && !isManagement)
    ) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Management access required."
      );
    }

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

    const locationId =
      clean(message.locationId);

    if (isManagement && !isAdmin) {
      const locationIds =
        Array.isArray(staff.locationIds)
          ? staff.locationIds.map(clean)
          : [];

      if (
        !locationId ||
        !locationIds.includes(locationId)
      ) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Message is outside Management scope."
        );
      }
    }

    const intelligenceRef =
      db
        .collection("management_intelligence")
        .doc(messageId);

    await db.runTransaction(async (tx) => {
      tx.set(
        intelligenceRef,
        {
          intelligenceType: "MESSAGE",
          sourceCollection: "general_messages",
          sourceMessageId: messageId,

          locationId:
            clean(message.locationId) || null,

          preferredOrganization:
            clean(message.preferredOrganization) || null,

          topic:
            clean(message.topic) || null,

          passType:
            clean(message.passType) || null,

          fullName:
            clean(message.fullName) || null,

          email:
            clean(message.email) || null,

          phone:
            clean(message.phone) || null,

          message:
            clean(message.message) || null,

          responseEmail:
            clean(message.responseEmail) || null,

          responseSubject:
            clean(message.responseSubject) || null,

          responseBody:
            clean(message.responseBody) || null,

          assignedManagerUid:
            clean(message.assignedManagerUid) || null,

          respondedByUid:
            clean(message.respondedByUid) || null,

          respondedByRole:
            clean(message.respondedByRole) || null,

          originalCreatedAt:
            message.createdAt || null,

          respondedAt:
            message.respondedAt || null,

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
  });
