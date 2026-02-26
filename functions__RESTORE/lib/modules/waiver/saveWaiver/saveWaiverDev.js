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
exports.saveWaiverDev = void 0;
// functions/src/modules/waiver/saveWaiverDev.ts
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
function allowCors(res) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
}
exports.saveWaiverDev = functions.https.onRequest(async (req, res) => {
    allowCors(res);
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: "method_not_allowed" });
        return;
    }
    try {
        const { intakeId, athleteUid } = (req.body || {});
        if (!intakeId || !athleteUid) {
            res.status(400).json({ ok: false, error: "missing_required_fields" });
            return;
        }
        const db = admin.firestore();
        const ts = admin.firestore.FieldValue.serverTimestamp();
        const waiverId = db.collection("_ids").doc().id;
        await db.collection("intakes").doc(intakeId).set({
            waiver: { status: "accepted", waiverId, filePath: null, ackOnly: true, acceptedAt: ts }
        }, { merge: true });
        await db.collection("waiverLogs").doc(waiverId).set({
            waiverId, intakeId, athleteUid, filePath: null, ackOnly: true, createdAt: ts
        });
        res.json({ ok: true, waiverId, filePath: null, ackOnly: true });
    }
    catch (e) {
        console.error("[saveWaiverDev] error", e);
        res.status(500).json({ ok: false, error: String((e === null || e === void 0 ? void 0 : e.message) || e) });
    }
});
