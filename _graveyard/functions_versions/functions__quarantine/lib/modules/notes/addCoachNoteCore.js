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
exports.handleAddCoachNote = handleAddCoachNote;
// functions/src/modules/notes/addCoachNoteCore.ts
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function defaultVisibility(type) {
    switch (type) {
        case "injury":
            return { coach: true, parent: true, athlete: false };
        case "parent":
            return { coach: true, parent: true, athlete: false };
        case "coachPrivate":
            return { coach: true, parent: false, athlete: false };
        case "athlete":
        case "goal":
            return { coach: true, parent: false, athlete: true };
        case "conduct":
        case "eventSummary":
            return { coach: true, parent: true, athlete: true };
        default:
            return { coach: true, parent: false, athlete: false };
    }
}
async function handleAddCoachNote(req, ctx = {}) {
    const athleteUid = (req.athleteUid || "").trim();
    if (!athleteUid)
        throw new Error("athleteUid required");
    const type = (req.type || "athlete");
    const body = (req.body || "").trim();
    if (!body)
        throw new Error("body required");
    const visibility = defaultVisibility(type);
    const actorUid = req.actorUid || ctx.authUid || "coach-local";
    const docRef = db.collection("coachNotes").doc();
    await docRef.set({
        id: docRef.id,
        athleteUid,
        type,
        title: req.title || null,
        body,
        visibility,
        linkedXp: req.linkedXp || null,
        linkedEventId: req.linkedEventId || null,
        meta: req.meta || null,
        createdBy: actorUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "coach-notes",
    });
    return {
        ok: true,
        id: docRef.id,
        athleteUid,
        type,
    };
}
