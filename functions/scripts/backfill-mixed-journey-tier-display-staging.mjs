import { Firestore } from "@google-cloud/firestore";
import { verifyStagingBoundary } from "../../scripts/staging/verify-staging-boundary.mjs";
import { assertSyntheticWriteSafety } from "./staging-seed-safety.mjs";
import {
  ADDED_STAGING_ATHLETE_FIXTURES,
  ORIGINAL_STAGING_ATHLETE_IDS,
  syntheticTierDisplayPatch,
  validateSyntheticFixtureRecord,
} from "./staging-mixed-journey-tier-fixtures.mjs";

const FORBIDDEN_PROGRESSION_FIELDS = Object.freeze([
  "progressionTier", "curriculumTier", "rankName", "xp", "xpCap", "stripeCount",
  "verifiedSkills", "testing", "certificates", "promotionHistory", "progressionCycle",
]);

function assertNoProgressionEvidence(record, athleteId) {
  const unexpected = FORBIDDEN_PROGRESSION_FIELDS.filter((field) => record[field] !== undefined);
  if (unexpected.length) throw new Error(`${athleteId} already contains progression evidence: ${unexpected.join(", ")}.`);
}

const { projectId } = await verifyStagingBoundary();
if (process.env.SANDMAN_STAGING_TIER_BACKFILL_ACK !== "BACKFILL-21-SYNTHETIC-TIERS") {
  throw new Error("Explicit synthetic tier backfill acknowledgement is required.");
}

const targetPaths = ADDED_STAGING_ATHLETE_FIXTURES.map(({ id }) => `athletes/${id}`);
const originalPaths = ORIGINAL_STAGING_ATHLETE_IDS.map((id) => `athletes/${id}`);
const db = new Firestore({ projectId });

try {
  const before = await db.getAll(...[...originalPaths, ...targetPaths].map((path) => db.doc(path)));
  const originals = before.slice(0, ORIGINAL_STAGING_ATHLETE_IDS.length);
  const targets = before.slice(ORIGINAL_STAGING_ATHLETE_IDS.length);
  assertSyntheticWriteSafety(originals, originalPaths);
  assertSyntheticWriteSafety(targets, targetPaths);

  const originalUpdateTimes = new Map(originals.map((snap) => [snap.id, snap.updateTime?.toMillis?.() || 0]));
  originals.forEach((snap, index) => {
    if (!snap.exists || snap.get("synthetic") !== true || snap.get("journey") !== "Z2H" || snap.get("locationId") !== "santa-ynez-valley") {
      throw new Error(`Original synthetic fixture is missing or changed: ${ORIGINAL_STAGING_ATHLETE_IDS[index]}`);
    }
  });

  const patches = new Map();
  targets.forEach((snap, index) => {
    const fixture = ADDED_STAGING_ATHLETE_FIXTURES[index];
    if (!snap.exists) throw new Error(`Synthetic backfill target does not exist: ${fixture.id}`);
    const record = snap.data() || {};
    assertNoProgressionEvidence(record, fixture.id);
    const patch = validateSyntheticFixtureRecord(record, fixture);
    if (FORBIDDEN_PROGRESSION_FIELDS.some((field) => Object.hasOwn(patch, field))) throw new Error("Synthetic placement patch contains progression evidence.");
    if (Object.entries(patch).some(([key, value]) => record[key] !== value)) patches.set(snap.ref.path, patch);
  });

  if (patches.size) {
    await db.runTransaction(async (transaction) => {
      const refs = [...patches.keys()].map((path) => db.doc(path));
      const current = await transaction.getAll(...refs);
      assertSyntheticWriteSafety(current, [...patches.keys()]);
      current.forEach((snap) => {
        const fixture = ADDED_STAGING_ATHLETE_FIXTURES.find(({ id }) => id === snap.id);
        if (!fixture || !snap.exists) throw new Error(`Synthetic backfill target disappeared: ${snap.id}`);
        const record = snap.data() || {};
        validateSyntheticFixtureRecord(record, fixture);
        assertNoProgressionEvidence(record, fixture.id);
        transaction.set(snap.ref, patches.get(snap.ref.path), { merge: true });
      });
    });
  }

  const verified = await db.getAll(...[...originalPaths, ...targetPaths].map((path) => db.doc(path)));
  for (const snap of verified.slice(0, ORIGINAL_STAGING_ATHLETE_IDS.length)) {
    if ((snap.updateTime?.toMillis?.() || 0) !== originalUpdateTimes.get(snap.id)) throw new Error(`Original synthetic fixture was modified: ${snap.id}`);
  }
  verified.slice(ORIGINAL_STAGING_ATHLETE_IDS.length).forEach((snap, index) => {
    const fixture = ADDED_STAGING_ATHLETE_FIXTURES[index];
    const expected = syntheticTierDisplayPatch(fixture);
    for (const [field, value] of Object.entries(expected)) if (snap.get(field) !== value) throw new Error(`${fixture.id} failed ${field} verification.`);
    for (const field of FORBIDDEN_PROGRESSION_FIELDS) if (snap.get(field) !== undefined) throw new Error(`${fixture.id} unexpectedly contains ${field}.`);
  });
  const r2c = verified.filter((snap) => snap.get("journey") === "Z2H").length;
  const p2l = verified.filter((snap) => snap.get("journey") === "P2L").length;
  if (verified.length !== 24 || r2c !== 15 || p2l !== 9) throw new Error(`Roster verification failed: ${verified.length} total, ${r2c} R2C, ${p2l} P2L.`);
  console.log(`Verified synthetic tier display backfill in ${projectId}: ${patches.size} updated, ${21 - patches.size} already current; 24 identities (15 R2C / 9 P2L).`);
} finally {
  await db.terminate();
}
