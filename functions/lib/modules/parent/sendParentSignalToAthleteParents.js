"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendParentSignalToAthleteParents = sendParentSignalToAthleteParents;
const firestore_1 = require("firebase-admin/firestore");
const sendParentSignal_1 = require("./sendParentSignal");
async function sendParentSignalToAthleteParents(input) {
    const db = (0, firestore_1.getFirestore)();
    const snap = await db
        .collection("parentAthleteLinks")
        .where("athleteUid", "==", input.athleteId)
        .where("status", "==", "active")
        .get();
    if (snap.empty) {
        return {
            ok: true,
            sent: 0,
            parentUids: [],
        };
    }
    const parentUids = [
        ...new Set(snap.docs
            .map((doc) => String(doc.data()?.parentUid || "").trim())
            .filter(Boolean)),
    ];
    for (const parentUid of parentUids) {
        await (0, sendParentSignal_1.sendParentSignal)({
            parentUid,
            athleteId: input.athleteId,
            athleteName: input.athleteName,
            type: input.type,
            testingDate: input.testingDate,
            nextTier: input.nextTier,
            note: input.note,
            amount: input.amount,
            stripeCount: input.stripeCount,
            source: input.source,
            sourceId: input.sourceId,
        });
    }
    return {
        ok: true,
        sent: parentUids.length,
        parentUids,
    };
}
