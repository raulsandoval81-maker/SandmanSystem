"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementAttendance = exports.incrementAttendanceHttp = void 0;
// functions/src/incrementAttendance.ts
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("./infra/admin");
exports.incrementAttendanceHttp = (0, https_1.onRequest)(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "POST only" });
        return;
    }
    const raw = req.body && req.body.data ? req.body.data : (req.body || {});
    const uid = (raw.uid || raw.athleteId || raw.id || "").toString().trim();
    if (!uid) {
        res.status(200).json({
            ok: false,
            error: "uid (or athleteId) required",
            got: raw,
        });
        return;
    }
    try {
        const now = new Date();
        const athRef = admin_1.db.collection("athletes").doc(uid);
        await admin_1.db.runTransaction(async (tx) => {
            const snap = await tx.get(athRef);
            const prev = snap.exists ? Number(snap.data()?.xp || 0) : 0;
            tx.set(athRef, { xp: prev + 10, updatedAt: now }, { merge: true });
        });
        await admin_1.db.collection("xpLogs").add({
            athleteUid: uid,
            event: "attendance",
            delta: 10,
            source: "incrementAttendanceHttp",
            createdAt: now,
        });
        res.status(200).json({ ok: true, uid, delta: 10, event: "attendance" });
    }
    catch (err) {
        console.error("[incrementAttendanceHttp] crash:", err);
        res.status(200).json({ ok: false, error: err?.message || "server error" });
    }
});
// Non-http helper (fine to keep for internal calls/tests)
const incrementAttendance = async (data) => {
    const uid = (data?.uid || "").trim();
    if (!uid)
        throw new Error("uid required");
    const now = new Date();
    const athRef = admin_1.db.collection("athletes").doc(uid);
    await admin_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(athRef);
        const prev = snap.exists ? Number(snap.data()?.xp || 0) : 0;
        tx.set(athRef, { xp: prev + 10, updatedAt: now }, { merge: true });
    });
    await admin_1.db.collection("xpLogs").add({
        athleteUid: uid,
        event: "attendance",
        delta: 10,
        source: "incrementAttendanceCallable",
        createdAt: now,
    });
    return { ok: true, uid, delta: 10, event: "attendance" };
};
exports.incrementAttendance = incrementAttendance;
