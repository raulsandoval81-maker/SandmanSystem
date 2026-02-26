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
exports.approveIntake = void 0;
// functions/src/modules/intake/approve.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
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
    const value = t !== null && t !== void 0 ? t : "T0";
    return order.includes(value) ? value : "T0";
};
exports.approveIntake = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const data = request.data;
    const auth = request.auth;
    const actorUid = auth === null || auth === void 0 ? void 0 : auth.uid;
    if (!actorUid) {
        throw new Error("Sign in required.");
    }
    if (!data || typeof data !== "object") {
        throw new Error("Missing payload.");
    }
    const { uid, intakeId, track, publicName, privateName, team, city, state, exFastTrack, exDualProg, clientTs, } = data;
    if (!uid || !intakeId || !(publicName === null || publicName === void 0 ? void 0 : publicName.trim())) {
        throw new Error("uid, intakeId, publicName required");
    }
    if (track !== "F8" && track !== "F4") {
        throw new Error("track must be F8 or F4");
    }
    const intakeRef = db.collection("intakes").doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) {
        throw new Error("intake not found");
    }
    const intake = intakeSnap.data();
    const waiverOk = IS_EMULATOR ||
        ((_a = intake === null || intake === void 0 ? void 0 : intake.waiver) === null || _a === void 0 ? void 0 : _a.status) === "accepted" ||
        ((_b = intake === null || intake === void 0 ? void 0 : intake.waiver) === null || _b === void 0 ? void 0 : _b.accepted) === true;
    if (!waiverOk) {
        throw new Error("waiver-required");
    }
    const wantsFastTrack = !!(exFastTrack === null || exFastTrack === void 0 ? void 0 : exFastTrack.requested) && track === "F4";
    const wantsDualProg = !!(exDualProg === null || exDualProg === void 0 ? void 0 : exDualProg.requested) && track === "F8";
    const dualTier = wantsDualProg
        ? clampDualProgTier(exDualProg === null || exDualProg === void 0 ? void 0 : exDualProg.startTier)
        : null;
    // padlock from counter
    const padlock = await db.runTransaction(async (tx) => {
        var _a;
        const ref = db.doc("counters/padlock");
        const snap = await tx.get(ref);
        const cur = snap.exists ? Number(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.last) || 0) : 0;
        const next = cur + 1;
        tx.set(ref, { last: next }, { merge: true });
        return zpad(next, 6);
    });
    const status = wantsFastTrack || wantsDualProg ? "pending-exception" : "active";
    const athRef = db.collection("athletes").doc(uid);
    const approvalsRef = db.collection("approvals").doc(uid);
    const exRef = db.collection("exceptionRequests").doc(uid);
    const batch = db.batch();
    batch.set(athRef, {
        uid,
        track,
        publicName: publicName.trim(),
        privateName: (privateName === null || privateName === void 0 ? void 0 : privateName.trim()) || null,
        org: { team: team || null, city: city || null, state: state || null },
        padlock,
        tier: "T0",
        rank: track === "F8" ? "Shadow" : "Apprentice",
        status,
        approvedBy: actorUid,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
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
        serverTs: admin.firestore.FieldValue.serverTimestamp(),
        exceptionFlags: {
            fastTrack: wantsFastTrack,
            dualProg: wantsDualProg,
        },
    }, { merge: true });
    if (wantsFastTrack || wantsDualProg) {
        const now = admin.firestore.Timestamp.now();
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 48 * 60 * 60 * 1000);
        batch.set(exRef, {
            uid,
            track,
            createdAt: now,
            expiresAt,
            status: "pending",
            fastTrack: wantsFastTrack
                ? {
                    requested: true,
                    yearsTrained: (_c = exFastTrack === null || exFastTrack === void 0 ? void 0 : exFastTrack.yearsTrained) !== null && _c !== void 0 ? _c : null,
                    proofLink: (_d = exFastTrack === null || exFastTrack === void 0 ? void 0 : exFastTrack.proofLink) !== null && _d !== void 0 ? _d : null,
                }
                : null,
            dualProg: wantsDualProg
                ? {
                    requested: true,
                    startTier: dualTier,
                    parentAck: !!(exDualProg === null || exDualProg === void 0 ? void 0 : exDualProg.parentAck),
                    coachNote: (_e = exDualProg === null || exDualProg === void 0 ? void 0 : exDualProg.coachNote) !== null && _e !== void 0 ? _e : null,
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
