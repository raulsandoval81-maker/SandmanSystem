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
exports.handleIncrementXp = handleIncrementXp;
// functions/src/modules/xp/incrementXpCore.ts
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function eventToDelta(ev) {
    if (ev === "attendance")
        return 10;
    if (ev === "fish")
        return 5;
    return 0;
}
async function handleIncrementXp(data, ctx = {}) {
    var _a;
    const uid = ((data === null || data === void 0 ? void 0 : data.uid) || "").trim();
    if (!uid) {
        throw new Error("uid required");
    }
    // decide delta
    let delta = 0;
    if (typeof data.amount === "number") {
        delta = data.amount;
    }
    else {
        delta = eventToDelta(data.event);
    }
    if (!delta) {
        throw new Error("no delta computed");
    }
    const now = new Date();
    const actor = data.actorUid || ctx.authUid || "coach-local";
    const athRef = db.collection("athletes").doc(uid);
    // manual increment so we don't rely on FieldValue.increment
    await db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(athRef);
        const prev = snap.exists ? Number(((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.xp) || 0) : 0;
        const next = prev + delta;
        tx.set(athRef, {
            xp: next,
            updatedAt: now,
        }, { merge: true });
    });
    // log
    await db.collection("xpLogs").add({
        athleteUid: uid,
        event: data.event || (delta === 10 ? "attendance" : "fish"),
        delta,
        note: data.note || null,
        meta: data.meta || null,
        by: actor,
        source: ((_a = data.meta) === null || _a === void 0 ? void 0 : _a.source) || "daily-grind",
        createdAt: now,
    });
    return {
        ok: true,
        uid,
        delta,
        event: data.event || (delta === 10 ? "attendance" : "fish"),
    };
}
