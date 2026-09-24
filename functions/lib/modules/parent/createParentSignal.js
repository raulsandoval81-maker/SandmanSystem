"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_SIGNAL_TYPES = void 0;
exports.createParentSignal = createParentSignal;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const parentSignalTypes_1 = require("./parentSignalTypes");
Object.defineProperty(exports, "PARENT_SIGNAL_TYPES", { enumerable: true, get: function () { return parentSignalTypes_1.PARENT_SIGNAL_TYPES; } });
const buildParentMessage_1 = require("./buildParentMessage");
async function createParentSignal(input) {
    const db = (0, firestore_1.getFirestore)();
    const athleteId = String(input.athleteId || "").trim();
    if (!athleteId) {
        return {
            ok: false,
            reason: "missing-athleteId",
        };
    }
    const linksSnap = await db
        .collection("parentAthleteLinks")
        .where("athleteUid", "==", athleteId)
        .where("status", "==", "active")
        .get();
    if (linksSnap.empty) {
        return {
            ok: false,
            reason: "no-active-parent-link",
        };
    }
    const built = (0, buildParentMessage_1.buildParentMessage)({
        type: input.type,
        athleteName: input.athleteName,
        testingDate: input.testingDate,
        nextTier: input.nextTier,
        note: input.note,
    });
    const parentUids = [
        ...new Set(linksSnap.docs
            .map((doc) => String(doc.data()?.parentUid || "").trim())
            .filter(Boolean)),
    ];
    if (!parentUids.length) {
        return {
            ok: false,
            reason: "no-parentUid-on-links",
        };
    }
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    const signalPayload = (parentUid) => ({
        athleteId,
        athleteName: input.athleteName || athleteId,
        parentUid,
        type: input.type,
        title: built.title,
        message: built.message,
        note: input.note || null,
        read: false,
        archived: false,
        archivedAt: null,
        retentionClass: (0, parentSignalTypes_1.parentInboxRetentionClass)(input.type),
        source: input.source || "system",
        sourceId: input.sourceId || athleteId,
        tournamentId: input.tournamentId || null,
        meta: input.meta || null,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    if (idempotencyKey) {
        const refs = parentUids.map((parentUid) => db.collection("parentInbox").doc((0, node_crypto_1.createHash)("sha256")
            .update(`${parentUid}|${idempotencyKey}`)
            .digest("hex")));
        await db.runTransaction(async (tx) => {
            const snapshots = [];
            for (const ref of refs) {
                snapshots.push(await tx.get(ref));
            }
            snapshots.forEach((snapshot, index) => {
                if (!snapshot.exists) {
                    tx.create(refs[index], signalPayload(parentUids[index]));
                }
            });
        });
    }
    else {
        const batch = db.batch();
        parentUids.forEach((parentUid) => {
            batch.set(db.collection("parentInbox").doc(), signalPayload(parentUid));
        });
        await batch.commit();
    }
    return {
        ok: true,
        sent: parentUids.length,
        parentUids,
    };
}
