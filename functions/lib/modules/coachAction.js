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
exports.coachAction = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.coachAction = (0, https_1.onRequest)(async (req, res) => {
    try {
        const db = (0, firestore_1.getFirestore)();
        const { type, athleteId } = req.body;
        const athleteRef = db.collection("athletes").doc(athleteId);
        const athlete = await athleteRef.get();
        if (!athlete.exists) {
            res.status(404).json({ error: "Athlete not found" });
            return;
        }
        let update = {};
        switch (type) {
            case "SCHEDULE_TEST":
                update = { "testing.state": "SCHEDULED" };
                break;
            case "START_TEST":
                update = { "testing.state": "ACTIVE" };
                break;
            case "FREEZE":
                update = { "testing.state": "FROZEN" };
                break;
            case "RETEST":
                update = { "testing.state": "RETEST" };
                break;
            case "APPROVE_PROMOTION":
                update = {
                    "testing.lastTestResult": "pass",
                    promotionCompletedAt: Date.now()
                };
                break;
            case "DELAY_PROMOTION":
                update = { promotionDelayed: true };
                break;
            case "TRIGGER_CEREMONY":
                update = { ceremonyCompletedAt: Date.now() };
                break;
            default:
                res.status(400).json({ error: "Unknown action" });
                return;
        }
        await athleteRef.update(update);
        res.json({
            ok: true,
            athleteId,
            type,
            update
        });
        return; // IMPORTANT: end function cleanly
    }
    catch (err) {
        res.status(500).json({ error: err.message });
        return;
    }
});
