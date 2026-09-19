"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeClosedMessageIntelligence = void 0;
exports.closeManagementMessageById = closeManagementMessageById;
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
const managementPassClosePolicy_1 = require("./managementPassClosePolicy");
const managementPassCheckoutPolicy_1 = require("./managementPassCheckoutPolicy");
const staffAuthorization_1 = require("../../services/staffAuthorization");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
exports.storeClosedMessageIntelligence = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }
    const messageId = clean(data?.messageId);
    if (!messageId) {
        throw new functions.https.HttpsError("invalid-argument", "messageId is required.");
    }
    return closeManagementMessageById(messageId, context.auth.uid);
});
async function closeManagementMessageById(messageId, uid) {
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Management access required.");
    const staff = actor.staff;
    const role = (0, staffAuthorization_1.normalizeStaffRole)(actor.role);
    const isAdmin = role === "admin";
    const isManagement = role === "management";
    const messageRef = db.collection("general_messages").doc(messageId);
    const messageSnap = await messageRef.get();
    if (!messageSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Message not found.");
    }
    const message = messageSnap.data() || {};
    const passActor = clean(message.topic) === "request-pass"
        ? await (0, staffAuthorization_1.requireActiveStaff)(uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management or Admin access required.")
        : null;
    const locationId = clean(message.locationId);
    if (isManagement && !isAdmin && !passActor) {
        (0, staffAuthorization_1.requireStaffLocation)(actor, locationId, "Message is outside Management scope.");
    }
    const intelligenceRef = db
        .collection("management_intelligence")
        .doc(messageId);
    await db.runTransaction(async (tx) => {
        const currentSnap = await tx.get(messageRef);
        if (!currentSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Message not found.");
        }
        const current = currentSnap.data() || {};
        if (clean(current.topic) === "request-pass") {
            if (!passActor)
                throw new functions.https.HttpsError("failed-precondition", "Pass request changed during closure.");
            (0, managementPassCheckoutPolicy_1.assertManagementPassMessage)(current, passActor);
            (0, managementPassClosePolicy_1.assertPassReadyToClose)(current);
        }
        const snapshotMessage = clean(current.topic) === "request-pass" ? current : message;
        tx.set(intelligenceRef, {
            intelligenceType: "MESSAGE",
            sourceCollection: "general_messages",
            sourceMessageId: messageId,
            locationId: clean(snapshotMessage.locationId) || null,
            preferredOrganization: clean(snapshotMessage.preferredOrganization) || null,
            topic: clean(snapshotMessage.topic) || null,
            passType: clean(snapshotMessage.passType) || null,
            ...(0, managementPassClosePolicy_1.passIntelligenceSummary)(snapshotMessage),
            fullName: clean(snapshotMessage.fullName) || null,
            email: clean(snapshotMessage.email) || null,
            phone: clean(snapshotMessage.phone) || null,
            message: clean(snapshotMessage.message) || null,
            responseEmail: clean(snapshotMessage.responseEmail) || null,
            responseSubject: clean(snapshotMessage.responseSubject) || null,
            responseBody: clean(snapshotMessage.responseBody) || null,
            assignedManagerUid: clean(snapshotMessage.assignedManagerUid) || null,
            respondedByUid: clean(snapshotMessage.respondedByUid) || null,
            respondedByRole: clean(snapshotMessage.respondedByRole) || null,
            originalCreatedAt: snapshotMessage.createdAt || null,
            respondedAt: snapshotMessage.respondedAt || null,
            status: "CLOSED",
            closedByUid: uid,
            closedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.update(messageRef, {
            status: "CLOSED",
            messageStatus: "CLOSED",
            routingStage: "CLOSED",
            closedByUid: uid,
            closedAt: firestore_1.FieldValue.serverTimestamp(),
            intelligenceStored: true,
            intelligenceRecordId: messageId,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    return {
        ok: true,
        intelligenceRecordId: messageId,
    };
}
