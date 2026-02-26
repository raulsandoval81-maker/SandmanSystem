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
exports.handleLogArena = handleLogArena;
// functions/src/modules/arena/logArenaCore.ts
const admin = __importStar(require("firebase-admin"));
const incrementXpCore_1 = require("../xp/incrementXpCore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
async function handleLogArena(data, ctx = {}) {
    const athleteUid = (data.athleteUid || "").trim();
    if (!athleteUid)
        throw new Error("athleteUid required");
    const eventName = (data.eventName || "").trim();
    const division = data.division || null;
    // 1) figure XP from flags
    let totalXp = 0;
    if (data.battle)
        totalXp += 10; // showed up / competed
    if (data.podium)
        totalXp += 5; // placed
    if (data.matchIq)
        totalXp += 5; // style / IQ
    if (data.penalty)
        totalXp -= 5; // coach penalty
    const actor = ctx.authUid || "coach-local";
    // 2) write arena log
    const logRef = db.collection("arenaLogs").doc();
    await logRef.set({
        id: logRef.id,
        athleteUid,
        eventName,
        division,
        battle: !!data.battle,
        podium: !!data.podium,
        matchIq: !!data.matchIq,
        style: data.style || null,
        penalty: !!data.penalty,
        totalXp,
        note: data.note || null,
        tournamentId: data.tournamentId || null,
        by: actor,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "coach-arena-log",
    });
    // 3) push XP through your existing XP core
    if (totalXp !== 0) {
        await (0, incrementXpCore_1.handleIncrementXp)({
            uid: athleteUid,
            amount: totalXp, // forces this amount
            event: "ARENA", // ok, core will keep it
            note: data.note || `Arena: ${eventName}`,
            meta: {
                source: "coach-arena-log",
                eventName,
                division,
                battle: !!data.battle,
                podium: !!data.podium,
                matchIq: !!data.matchIq,
                style: data.style || null,
                penalty: !!data.penalty,
                tournamentId: data.tournamentId || null,
            },
        }, { authUid: actor });
    }
    return {
        ok: true,
        id: logRef.id,
        athleteUid,
        eventName,
        totalXp,
    };
}
