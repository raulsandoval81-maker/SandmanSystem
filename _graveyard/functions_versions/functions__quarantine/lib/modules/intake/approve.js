"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveIntake = void 0;
// functions/src/modules/intake/approve.ts
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../../infra/admin");
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true" ||
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !!process.env.FIRESTORE_EMULATOR_HOST ||
    !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
let logIntakeApprove = async () => { };
try {
    ({ logIntakeApprove } = require("../../infra/logAdmin"));
}
catch {
    // ignore
}
const zpad = (n, width = 6) => String(n).padStart(width, "0");
const clampDualProgTier = (t) => {
    const order = ["T0", "T1", "T2", "T3"];
    const value = t ?? "T0";
    return order.includes(value) ? value : "T0";
};
exports.approveIntake = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const auth = request.auth;
    const actorUid = auth?.uid;
    if (!actorUid) {
        throw new Error("Sign in required.");
    }
    if (!data || typeof data !== "object") {
        throw new Error("Missing payload.");
    }
    const { uid, intakeId, track, publicName, privateName, team, city, state, exFastTrack, exDualProg, clientTs, } = data;
    if (!uid || !intakeId || !publicName?.trim()) {
        throw new Error("uid, intakeId, publicName required");
    }
    if (track !== "F8" && track !== "F4") {
        throw new Error("track must be F8 or F4");
    }
    const intakeRef = admin_1.db.collection("intakes").doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) {
        throw new Error("intake not found");
    }
    const intake = intakeSnap.data();
    const waiverOk = IS_EMULATOR ||
        intake?.waiver?.status === "accepted" ||
        intake?.waiver?.accepted === true;
    if (!waiverOk) {
        throw new Error("waiver-required");
    }
    const wantsFastTrack = !!exFastTrack?.requested && track === "F4";
    const wantsDualProg = !!exDualProg?.requested && track === "F8";
    const dualTier = wantsDualProg
        ? clampDualProgTier(exDualProg?.startTier)
        : null;
    // padlock from counter (meta/padlockCounter.seq) => A000001
    const padlock = await admin_1.db.runTransaction(async (tx) => {
        const ref = admin_1.db.collection("meta").doc("padlockCounter");
        const snap = await tx.get(ref);
        const cur = snap.exists ? Number(snap.data()?.seq ?? 0) : 0;
        const next = cur + 1;
        tx.set(ref, { seq: next }, { merge: true });
        return `A${zpad(next, 6)}`;
    });
    const status = wantsFastTrack || wantsDualProg ? "pending-exception" : "active";
    const athRef = admin_1.db.collection("athletes").doc(uid);
    const approvalsRef = admin_1.db.collection("approvals").doc(uid);
    const exRef = admin_1.db.collection("exceptionRequests").doc(uid);
    const batch = admin_1.db.batch();
    batch.set(athRef, {
        uid,
        track,
        publicName: publicName.trim(),
        privateName: privateName?.trim() || null,
        org: { team: team || null, city: city || null, state: state || null },
        padlock,
        tier: "T0",
        rank: track === "F8" ? "Shadow" : "Apprentice",
        status,
        approvedBy: actorUid,
        approvedAt: admin_1.FieldValue.serverTimestamp(),
        sourceIntakeId: intakeId,
    }, { merge: true });
    batch.set(approvalsRef, {
        uid,
        track,
        padlock,
        publicName,
        privateName: privateName || null,
        team: team || null,
        city: city || null,
        state: state || null,
        actorUid,
        clientTs: clientTs || null,
        serverTs: admin_1.FieldValue.serverTimestamp(),
        exceptionFlags: {
            fastTrack: wantsFastTrack,
            dualProg: wantsDualProg,
        },
    }, { merge: true });
    if (wantsFastTrack || wantsDualProg) {
        const now = admin_1.Timestamp.now();
        const expiresAt = admin_1.Timestamp.fromMillis(now.toMillis() + 48 * 60 * 60 * 1000);
        batch.set(exRef, {
            uid,
            track,
            createdAt: now,
            expiresAt,
            status: "pending",
            fastTrack: wantsFastTrack
                ? {
                    requested: true,
                    yearsTrained: exFastTrack?.yearsTrained ?? null,
                    proofLink: exFastTrack?.proofLink ?? null,
                }
                : null,
            dualProg: wantsDualProg
                ? {
                    requested: true,
                    startTier: dualTier,
                    parentAck: !!exDualProg?.parentAck,
                    coachNote: exDualProg?.coachNote ?? null,
                }
                : null,
            publicName,
            privateName: privateName || null,
            intakeId,
            org: { team: team || null, city: city || null, state: state || null },
        }, { merge: true });
    }
    await batch.commit();
    await logIntakeApprove({
        actorUid,
        intakeId,
        athleteUid: uid,
        track,
        padlock,
        status,
    }).catch(() => { });
    return {
        ok: true,
        uid,
        track,
        padlock,
        status,
        exceptionId: wantsFastTrack || wantsDualProg ? uid : null,
    };
});
