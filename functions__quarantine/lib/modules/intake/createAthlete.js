"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAthlete = void 0;
// functions/src/modules/intake/createAthlete.ts
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
function getInitialProgress(foundry) {
    if (foundry === "F8") {
        return { tier: 0, tierName: "Shadow", xpCap: 800, rankName: "Shadow", rankColor: "#ffffff" };
    }
    return { tier: 0, tierName: "Apprentice", xpCap: 1200, rankName: "Apprentice", rankColor: "#ffffff" };
}
exports.createAthlete = (0, https_1.onCall)(async (req) => {
    const data = req.data;
    const db = (0, firestore_1.getFirestore)();
    const { firstName, lastName, team, city, state, foundry, nickname, mintVirtueTag } = data || {};
    if (!firstName || !lastName) {
        throw new https_1.HttpsError("invalid-argument", "firstName and lastName are required.");
    }
    if (foundry !== "F8" && foundry !== "F4") {
        throw new https_1.HttpsError("invalid-argument", "foundry must be 'F8' or 'F4'.");
    }
    const fullName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const publicName = String(nickname || fullName).trim();
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
