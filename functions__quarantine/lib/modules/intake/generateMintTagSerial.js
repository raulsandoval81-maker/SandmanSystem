"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMintTagSerial = generateMintTagSerial;
async function generateMintTagSerial(db, track, lane, virtue) {
    const t = (track || "F8").toUpperCase();
    const l = (lane || "CB").toUpperCase();
    const v = (virtue || "").toUpperCase().trim();
    if (!v) {
        throw new Error("Missing virtue for mint serial");
    }
    // Counter doc is NOT a folder. It's a Firestore doc at: meta/mintCounters
    // It will contain fields like: F8_CB_FOCUS: 12
    const ref = db.collection("meta").doc("mintCounters");
    const out = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? (snap.data() || {}) : {};
        const key = `${t}_${l}_${v}`; // field name
        const current = typeof data[key] === "number" ? data[key] : 0;
        const next = current + 1;
        tx.set(ref, { [key]: next }, { merge: true });
        // Build tag: F8_CB0001_FOCUS
        const serial = String(next).padStart(4, "0");
        const tag = `${t}_${l}${serial}_${v}`;
        return { seq: next, tag };
    });
    return out;
}
