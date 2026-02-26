"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncrementXp = handleIncrementXp;
// functions/src/modules/xp/incrementXpCore.ts
const admin_1 = require("../../infra/admin");
function eventToDelta(ev) {
    if (ev === "attendance")
        return 10;
    if (ev === "fish")
        return 5;
    return 0;
}
async function handleIncrementXp(data, ctx = {}) {
    const uid = (data?.uid || "").trim();
    if (!uid)
        throw new Error("uid required");
    // decide delta
    const delta = typeof data.amount === "number" ? data.amount : eventToDelta(data.event);
    if (!delta)
        throw new Error("no delta computed");
    const now = new Date();
    const actor = data.actorUid || ctx.authUid || "coach-local";
    const athRef = admin_1.db.collection("athletes").doc(uid);
    // manual increment so we don't rely on FieldValue.increment
    await admin_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(athRef);
        const prev = snap.exists ? Number(snap.data()?.xp || 0) : 0;
        tx.set(athRef, { xp: prev + delta, updatedAt: now }, { merge: true });
    });
    // log
    await admin_1.db.collection("xpLogs").add({
        athleteUid: uid,
        event: data.event || (delta === 10 ? "attendance" : "fish"),
        delta,
        note: data.note || null,
        meta: data.meta || null,
        by: actor,
        source: data?.meta?.source || "daily-grind",
        createdAt: now,
    });
    return {
        ok: true,
        uid,
        delta,
        event: data.event || (delta === 10 ? "attendance" : "fish"),
    };
}
