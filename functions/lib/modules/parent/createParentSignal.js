"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARENT_SIGNAL_TYPES = void 0;
exports.createParentSignal = createParentSignal;
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
    const batch = db.batch();
    parentUids.forEach((parentUid) => {
        const ref = db.collection("parentInbox").doc();
        batch.set(ref, {
            athleteId,
            athleteName: input.athleteName || athleteId,
            parentUid,
            type: input.type,
            title: built.title,
            message: built.message,
            note: input.note || null,
            read: false,
            source: input.source || "system",
            sourceId: input.sourceId || athleteId,
            tournamentId: input.tournamentId || null,
            meta: input.meta || null,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    await batch.commit();
    return {
        ok: true,
        sent: parentUids.length,
        parentUids,
    };
}
