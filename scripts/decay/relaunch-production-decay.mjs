import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import {
  DECAY_RELAUNCH_BASELINE_ISO,
  DECAY_RELAUNCH_ID,
  planDecayRelaunch,
} from "./decay-production-relaunch-core.mjs";

export const WRITE_CONFIRMATION = "APPLY-2026-PRODUCTION-DECAY-RELAUNCH";

function summarize(plans, mode) {
  const groups = { WOULD_MIGRATE: [], ALREADY_MIGRATED: [], SKIPPED: [], ERROR: [] };
  for (const plan of plans) groups[plan.status]?.push(plan.athleteId);
  for (const values of Object.values(groups)) values.sort();
  return {
    mode,
    migrationId: DECAY_RELAUNCH_ID,
    baseline: DECAY_RELAUNCH_BASELINE_ISO,
    total: plans.length,
    counts: Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, value.length])),
    athleteIds: groups,
    stateChanges: plans.filter((plan) => plan.status === "WOULD_MIGRATE").map((plan) => ({
      athleteId: plan.athleteId,
      before: plan.before,
      after: plan.after,
    })),
    errors: plans.filter((plan) => plan.status === "ERROR").map((plan) => ({ athleteId: plan.athleteId, errors: plan.errors })),
  };
}

async function applyOne(db, athleteId, baseline, migratedAt) {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`athletes/${athleteId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) return { athleteId, status: "SKIPPED", errors: ["ATHLETE_MISSING_DURING_WRITE"] };
    const plan = planDecayRelaunch(athleteId, snap.data(), { baseline, migratedAt });
    if (plan.status === "WOULD_MIGRATE") tx.update(ref, plan.patch);
    return plan;
  });
}

export async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write-production");
  const confirmation = argv.find((arg) => arg.startsWith("--confirm="))?.slice(10) ?? "";
  if (write && confirmation !== WRITE_CONFIRMATION) throw new Error("Exact production confirmation token required.");
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const snapshot = await db.collection("athletes").get();
  const baseline = Timestamp.fromDate(new Date(DECAY_RELAUNCH_BASELINE_ISO));
  const migratedAt = Timestamp.now();
  let plans = snapshot.docs.map((doc) => planDecayRelaunch(doc.id, doc.data(), { baseline, migratedAt }));
  if (plans.some((plan) => plan.status === "ERROR")) {
    console.log(JSON.stringify(summarize(plans, "PREFLIGHT_BLOCKED"), null, 2));
    throw new Error("Fail-closed relaunch preflight errors found; no writes performed.");
  }
  if (write) {
    const written = [];
    for (const plan of plans) {
      if (plan.status === "WOULD_MIGRATE") written.push(await applyOne(db, plan.athleteId, baseline, migratedAt));
      else written.push(plan);
    }
    plans = written;
  }
  console.log(JSON.stringify(summarize(plans, write ? "WRITE_COMPLETE" : "DRY_RUN"), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
