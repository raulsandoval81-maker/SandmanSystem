import { pathToFileURL } from "node:url";
import {
  calculateF8StripeCount,
  resolveF8RankMetadata,
} from "../../functions/lib/policy/f8ProgressionPolicy.js";
import { classifyF8Candidate } from "./f8-five-rank-migration-core.mjs";

export const MIGRATION_VERSION = "f8-five-rank-production-migration-v1";
export const CURRICULUM_VERSION = "f8-curriculum-bridge-v1";
export const PRODUCTION_CONFIRMATION_TOKEN = "F8-PHASE-9B-9-ATHLETES-08a42df";

export const APPROVED_F8_SNAPSHOT = Object.freeze({
  F8_0001: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 195, xpCap: 600, stripeCount: 0 }),
  F8_0010: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 285, xpCap: 600, stripeCount: 0 }),
  F8_0011: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 435, xpCap: 600, stripeCount: 1 }),
  F8_0012: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 145, xpCap: 600, stripeCount: 0 }),
  F8_0014: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 250, xpCap: 600, stripeCount: 0 }),
  F8_0015: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 130, xpCap: 600, stripeCount: 0 }),
  F8_0017: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 190, xpCap: 600, stripeCount: 0 }),
  F8_0018: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 115, xpCap: 600, stripeCount: 0 }),
  F8_0020: Object.freeze({ tier: "T0", rankName: "Shadow", xp: 175, xpCap: 800, stripeCount: 0 }),
});

export const APPROVED_F8_IDS = Object.freeze(Object.keys(APPROVED_F8_SNAPSHOT));

function fail(message) {
  throw new Error(`F8_PHASE_9B_PREFLIGHT_FAILED: ${message}`);
}

function own(record, field) {
  return Object.prototype.hasOwnProperty.call(record ?? {}, field);
}

function sameValue(actual, expected) {
  return actual === expected;
}

export function assertExactApprovedAllowlist(ids) {
  const supplied = [...ids].map(String).sort();
  const approved = [...APPROVED_F8_IDS].sort();
  if (supplied.length !== approved.length || supplied.some((id, index) => id !== approved[index])) {
    fail(`document IDs must equal the exact approved allowlist; received ${supplied.join(",")}`);
  }
  return true;
}

function approvedAfter(id) {
  const before = APPROVED_F8_SNAPSHOT[id];
  const rank = resolveF8RankMetadata("T0");
  return Object.freeze({
    tier: rank.tier,
    progressionTier: rank.tier,
    rankName: rank.name,
    xp: before.xp,
    xpCap: rank.xpCap,
    stripeCount: calculateF8StripeCount(rank.tier, before.xp),
  });
}

function assertOptionalCompatibilityFields(id, athlete) {
  for (const [field, expected] of [
    ["progressionTier", "T0"],
    ["curriculumTier", "T0"],
    ["curriculumVersion", CURRICULUM_VERSION],
  ]) {
    if (own(athlete, field) && athlete[field] !== null && athlete[field] !== "" && athlete[field] !== expected) {
      fail(`${id}.${field} changed or conflicts with the approved compatibility state`);
    }
  }
}

export function buildApprovedPatch(id, athlete) {
  const before = APPROVED_F8_SNAPSHOT[id];
  if (!before) fail(`${id} is not allowlisted`);

  const classification = classifyF8Candidate(id, athlete);
  if (!classification.accepted) fail(`${id} is not positively classified F8`);
  assertOptionalCompatibilityFields(id, athlete);

  const after = approvedAfter(id);
  const beforeMatches = ["tier", "rankName", "xp", "xpCap", "stripeCount"]
    .every((field) => sameValue(athlete?.[field], before[field]));
  const afterMatches = ["tier", "progressionTier", "rankName", "xp", "xpCap", "stripeCount"]
    .every((field) => sameValue(athlete?.[field], after[field]));

  if (!beforeMatches && !afterMatches) {
    fail(`${id} no longer matches either its approved Phase 9A before-state or completed state`);
  }

  const patch = Object.freeze({
    progressionTier: after.progressionTier,
    tier: after.tier,
    rankName: after.rankName,
    xpCap: after.xpCap,
    stripeCount: after.stripeCount,
  });
  return Object.freeze({
    id,
    status: afterMatches ? "ALREADY_CORRECT" : "READY",
    preservedXp: athlete.xp,
    before: Object.freeze({
      tier: athlete.tier,
      progressionTier: athlete.progressionTier ?? null,
      rankName: athlete.rankName,
      xp: athlete.xp,
      xpCap: athlete.xpCap,
      stripeCount: athlete.stripeCount,
      curriculumTier: athlete.curriculumTier ?? null,
      curriculumVersion: athlete.curriculumVersion ?? null,
    }),
    after,
    patch,
  });
}

export function preflightApprovedRecords(records) {
  const entries = records instanceof Map ? [...records.entries()] : Object.entries(records ?? {});
  assertExactApprovedAllowlist(entries.map(([id]) => id));
  const plans = entries.map(([id, athlete]) => buildApprovedPatch(id, athlete));
  plans.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze(plans);
}

export async function executeApprovedMigration({
  records,
  write = false,
  confirmationToken = "",
  commit = async () => fail("no transactional commit adapter supplied"),
} = {}) {
  const plans = preflightApprovedRecords(records);
  if (!write) return Object.freeze({ mode: "PREFLIGHT", writes: 0, plans });
  if (confirmationToken !== PRODUCTION_CONFIRMATION_TOKEN) {
    fail("production write confirmation token is missing or invalid");
  }
  const writablePlans = plans.filter((plan) => plan.status !== "ALREADY_CORRECT");
  await commit(writablePlans);
  return Object.freeze({ mode: "WRITE", writes: writablePlans.length, plans });
}

export function verifyApprovedRecords(records) {
  const plans = preflightApprovedRecords(records);
  const incomplete = plans.filter((plan) => plan.status !== "ALREADY_CORRECT");
  if (incomplete.length) fail(`post-write verification incomplete for ${incomplete.map((plan) => plan.id).join(",")}`);
  return Object.freeze({ verified: plans.length, plans });
}

async function firestoreRecords(db) {
  const snapshots = await db.getAll(...APPROVED_F8_IDS.map((id) => db.doc(`athletes/${id}`)));
  const records = new Map();
  snapshots.forEach((snapshot, index) => {
    if (!snapshot.exists) fail(`${APPROVED_F8_IDS[index]} does not exist`);
    records.set(APPROVED_F8_IDS[index], snapshot.data() ?? {});
  });
  return records;
}

async function transactionalWrite(db) {
  return db.runTransaction(async (transaction) => {
    const refs = APPROVED_F8_IDS.map((id) => db.doc(`athletes/${id}`));
    const records = new Map();
    for (let index = 0; index < refs.length; index += 1) {
      const snapshot = await transaction.get(refs[index]);
      if (!snapshot.exists) fail(`${APPROVED_F8_IDS[index]} does not exist`);
      records.set(APPROVED_F8_IDS[index], snapshot.data() ?? {});
    }
    const plans = preflightApprovedRecords(records);
    for (const plan of plans) {
      if (plan.status !== "ALREADY_CORRECT") transaction.update(db.doc(`athletes/${plan.id}`), plan.patch);
    }
    return plans;
  });
}

function printPlans(label, plans) {
  console.log(JSON.stringify({
    migrationVersion: MIGRATION_VERSION,
    mode: label,
    athleteCount: plans.length,
    changes: plans.map(({ id, status, before, after, patch }) => ({ id, status, before, after, patch })),
  }, null, 2));
}

async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write-production");
  const verify = argv.includes("--verify");
  const tokenArg = argv.find((arg) => arg.startsWith("--confirm="));
  const confirmationToken = tokenArg?.slice("--confirm=".length) ?? "";
  if (write && verify) fail("choose either write or verify mode");
  if (write && confirmationToken !== PRODUCTION_CONFIRMATION_TOKEN) {
    fail("write mode requires the exact --confirm token");
  }

  const { applicationDefault, getApps, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();

  if (write) {
    const plans = await transactionalWrite(db);
    printPlans("WRITE_COMPLETE", plans);
    return;
  }
  const records = await firestoreRecords(db);
  const result = verify ? verifyApprovedRecords(records) : await executeApprovedMigration({ records });
  printPlans(verify ? "VERIFY" : "PREFLIGHT", result.plans);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
