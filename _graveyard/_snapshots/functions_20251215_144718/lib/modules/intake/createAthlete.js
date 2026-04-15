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
exports.createAthlete = void 0;
// functions/src/modules/intake/createAthlete.ts
const functions = __importStar(require("firebase-functions"));
const firestore_1 = require("firebase-admin/firestore");
// Decide starting tier + cap by lane
function getInitialProgress(foundry) {
    if (foundry === "F8") {
        // Foundry 8 Youth — T0 Shadow (800 cap)
        return {
            tier: 0,
            tierName: "Shadow",
            xpCap: 800,
            rankName: "Shadow",
            rankColor: "#ffffff",
        };
    }
    // Foundry 4 Teen/Adult — T0 Apprentice (1200 cap)
    return {
        tier: 0,
        tierName: "Apprentice",
        xpCap: 1200,
        rankName: "Apprentice",
        rankColor: "#ffffff",
    };
}
exports.createAthlete = functions.https.onCall(async (request) => {
    const data = request.data;
    const db = (0, firestore_1.getFirestore)();
    const { firstName, lastName, team, city, state, foundry, nickname, mintVirtueTag, } = data || {};
    if (!firstName || !lastName) {
        throw new functions.https.HttpsError("invalid-argument", "firstName and lastName are required.");
    }
    if (foundry !== "F8" && foundry !== "F4") {
        throw new functions.https.HttpsError("invalid-argument", "foundry must be 'F8' or 'F4'.");
    }
    const fullName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const publicName = String((nickname || fullName)).trim();
    const { tier, tierName, xpCap, rankName, rankColor } = getInitialProgress(foundry);
    const mintedTag = (mintVirtueTag || "").trim() ||
        `${foundry}-${Date.now().toString(36).toUpperCase().slice(-4)}-FOCUS`;
    const now = firestore_1.FieldValue.serverTimestamp();
    const docData = {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        fullName,
        publicName,
        team: team ? String(team).trim() : null,
        city: city ? String(city).trim() : null,
        state: state ? String(state).trim() : null,
        foundry,
        trackCode: `${foundry}-COMBAT`,
        tier,
        tierName,
        xp: 0,
        xpCap,
        xpHonor: 0,
        xpStrength: 0,
        stripeCount: 0,
        rankName,
        rankColor,
        mintVirtueTag: mintedTag,
        active: false,
        createdAt: now,
        updatedAt: now,
    };
    const ref = await db.collection("athletes").add(docData);
    return {
        athleteId: ref.id,
        fullName,
        publicName,
        tier,
        tierName,
        xpCap,
        trackCode: docData.trackCode,
        mintVirtueTag: mintedTag,
    };
});
