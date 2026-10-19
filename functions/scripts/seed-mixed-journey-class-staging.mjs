import { Firestore, FieldValue } from "@google-cloud/firestore";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { assertSyntheticWriteSafety, commitSyntheticManifestTransaction } from "./staging-seed-safety.mjs";

// Additive, staging-only acceptance roster. Never rewrites the original
// three historical AUTO fixtures, their evidence, or any practice/attendance.
const { projectId } = await verifyStagingBoundary();
const existingIds = [
  "staging-athlete-beginner",
  "staging-athlete-intermediate",
  "staging-athlete-advanced",
];
const scenarios = [
  ...["T0","T0","T0","T0","T1","T1","T1","T2","T2","T2","T3","T3"]
    .map((scenarioTier, i) => ({ id: `staging-r2c-class-${String(i + 1).padStart(2, "0")}`, journey: "Z2H", profileType: "youth", scenarioTier })),
  ...["T0","T0","T0","T1","T1","T2","T2","T3","T4"]
    .map((scenarioTier, i) => ({ id: `staging-p2l-class-${String(i + 1).padStart(2, "0")}`, journey: "P2L", profileType: "teen", scenarioTier })),
];
const rosterIds = [...existingIds, ...scenarios.map(({ id }) => id)];
if (rosterIds.length !== 24 || new Set(rosterIds).size !== 24) {
  throw new Error("Expected 24 unique staging athlete IDs.");
}
if (scenarios.filter(a => a.journey === "Z2H").length !== 12 ||
    scenarios.filter(a => a.journey === "P2L").length !== 9) {
  throw new Error("Expected 12 added R2C and 9 added P2L athletes.");
}

const db = new Firestore({ projectId });
try {
  const existingPaths = existingIds.map(id => `athletes/${id}`);
  const existing = await db.getAll(...existingPaths.map(path => db.doc(path)));
  assertSyntheticWriteSafety(existing, existingPaths);
  for (const [i, snap] of existing.entries()) {
    if (!snap.exists || snap.get("synthetic") !== true ||
        snap.get("journey") !== "Z2H" ||
        snap.get("locationId") !== "santa-ynez-valley") {
      throw new Error(`Existing synthetic Wrestling fixture is missing or changed: ${existingIds[i]}`);
    }
  }
  const writes = new Map();
  for (const [i, athlete] of scenarios.entries()) {
    const isYouth = athlete.journey === "Z2H";
    const displayName = `Synthetic ${isYouth ? "R2C Youth" : "P2L Teen"} ${String(i + 1).padStart(2, "0")}`;
    writes.set(`athletes/${athlete.id}`, {
      name: displayName,
      displayName,
      synthetic: true,
      syntheticDataOnly: true,
      locationId: "santa-ynez-valley",
      academyId: "staging-academy",
      coachIds: ["staging-coach-wrestling"],
      discipline: "wrestling",
      journey: athlete.journey,
      profileType: athlete.profileType,
      // Test scenario only. NOT an earned official tier, verified skill,
      // authoritative training ability, rank, XP, or promotion.
      syntheticScenarioTier: athlete.scenarioTier,
    });
  }
  writes.set("stagingMetadata/wrestling-class-roster-v1", {
    synthetic: true,
    syntheticDataOnly: true,
    projectId,
    purpose: "Mixed Road2Champion and Path2Legend class acceptance",
    originalAthleteIds: existingIds,
    addedAthleteIds: scenarios.map(a => a.id),
    expectedRosterIds: rosterIds,
    expectedTotal: 24,
    journeyCounts: { Z2H: 15, P2L: 9 },
    automaticProgressionAuthorized: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  // This helper repeats synthetic-path validation inside the transaction;
  // no writes to the original athlete docs, live attendance, or history.
  await commitSyntheticManifestTransaction(db, writes);
  console.log(`Staged ${scenarios.length} additional synthetic athletes in ${projectId}; 24 total test IDs (15 R2C / 9 P2L). No practice or progression records altered.`);
} finally {
  await db.terminate();
}
