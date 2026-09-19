"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markManagementMessageResponded = void 0;
exports.assertCanMarkManagementResponded = assertCanMarkManagementResponded;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../../services/staffAuthorization");
const clean = (value) => String(value ?? "").trim();
function assertCanMarkManagementResponded(message, actor) {
    (0, staffAuthorization_1.requireStaffLocation)(actor, message.locationId);
    if ([message.status, message.messageStatus, message.routingStage]
        .some((value) => clean(value).toUpperCase() === "CLOSED")) {
        throw new https_1.HttpsError("failed-precondition", "This message is already closed.");
    }
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) === "management") {
        const assigned = clean(message.assignedManagerUid) === actor.uid;
        const pending = !clean(message.assignedManagerUid)
            && clean(message.assignmentStatus) === "PENDING_MANAGEMENT";
        if (!assigned && !pending) {
            throw new https_1.HttpsError("permission-denied", "This message is outside your Management queue.");
        }
    }
}
exports.markManagementMessageResponded = (0, https_1.onCall)(async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError("unauthenticated", "Management sign-in required.");
    const messageId = clean(request.data?.messageId);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid messageId is required.");
    }
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES);
    const ref = (0, firestore_1.getFirestore)().collection("general_messages").doc(messageId);
    await (0, firestore_1.getFirestore)().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Message not found.");
        const message = snap.data() || {};
        assertCanMarkManagementResponded(message, actor);
        if (clean(message.messageStatus).toUpperCase() === "RESPONDED")
            return;
        tx.update(ref, {
            assignedManagerUid: uid,
            status: "RESPONDED",
            messageStatus: "RESPONDED",
            routingStage: "MANAGEMENT_RESPONDED",
            assignmentStatus: "ASSIGNED",
            respondedByUid: uid,
            respondedByRole: (0, staffAuthorization_1.normalizeStaffRole)(actor.role) === "admin" ? "SYSTEM_ADMIN" : "MANAGEMENT",
            respondedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return { ok: true, messageId };
});
