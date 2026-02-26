// functions/src/modules/intake/createAthlete.ts
import * as functions from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

type FoundryTrack = "F8" | "F4";

interface CreateAthleteData {
  firstName: string;
  lastName: string;
  team?: string;
  city?: string;
  state?: string;
  foundry: FoundryTrack; // "F8" (youth) or "F4" (older)
  nickname?: string;
  mintVirtueTag?: string;
}

interface AthleteDoc {
  firstName: string;
  lastName: string;
  fullName: string;
  publicName: string;
  team: string | null;
  city: string | null;
  state: string | null;
  foundry: FoundryTrack;
  trackCode: string;      // e.g. "F8-COMBAT"
  tier: number;           // 0 = Shadow / Apprentice
  tierName: string;       // "Shadow" or "Apprentice"
  xp: number;
  xpCap: number;
  xpHonor: number;
  xpStrength: number;
  stripeCount: number;
  rankName: string;
  rankColor: string;
  mintVirtueTag: string;
  active: boolean;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
}

// Decide starting tier + cap by lane
function getInitialProgress(foundry: FoundryTrack): {
  tier: number;
  tierName: string;
  xpCap: number;
  rankName: string;
  rankColor: string;
} {
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

export const createAthlete = functions.https.onCall(async (request) => {
  const data = request.data as CreateAthleteData;
  const db = getFirestore();

  const {
    firstName,
    lastName,
    team,
    city,
    state,
    foundry,
    nickname,
    mintVirtueTag,
  } = data || ({} as any);

  if (!firstName || !lastName) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "firstName and lastName are required."
    );
  }

  if (foundry !== "F8" && foundry !== "F4") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "foundry must be 'F8' or 'F4'."
    );
  }

  const fullName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
  const publicName = String((nickname || fullName)).trim();

  const { tier, tierName, xpCap, rankName, rankColor } = getInitialProgress(foundry);

  const mintedTag =
    (mintVirtueTag || "").trim() ||
    `${foundry}-${Date.now().toString(36).toUpperCase().slice(-4)}-FOCUS`;

  const now = FieldValue.serverTimestamp();

  const docData: AthleteDoc = {
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
