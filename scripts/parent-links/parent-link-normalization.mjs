import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { pathToFileURL } from "node:url";
import {
  MISSING_ATHLETE_DEACTIVATION_CANDIDATES,
  buildParentLinkNormalizationPlan,
  postCanonicalDuplicateCandidates,
} from "./parent-link-normalization-core.mjs";

export const WRITE_CONFIRMATION = "NORMALIZE-CONFIRMED-PARENT-LINKS-AND-DEACTIVATE-MISSING-ATHLETE-ARTIFACTS";

async function loadInventory(db) {
  const linksSnapshot = await db.collection("parentAthleteLinks").get();
  const athleteIds = [...new Set([
    "F4_0001",
    ...MISSING_ATHLETE_DEACTIVATION_CANDIDATES.map((item) => item.athleteUid),
  ])];
  const athleteSnapshots = await db.getAll(...athleteIds.map((id) => db.doc(`athletes/${id}`)));
  return {
    links: linksSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    existingAthleteIds: athleteSnapshots.filter((item) => item.exists).map((item) => item.id),
  };
}

async function applyPlan(db, plan) {
  await db.runTransaction(async (tx) => {
    const normalizationReads = [];
    for (const item of plan.normalize) {
      const ref = db.doc(`parentAthleteLinks/${item.id}`);
      const current = await tx.get(ref);
      normalizationReads.push({ item, ref, current });
    }
    const deactivationReads = [];
    for (const item of plan.deactivate) {
      const athlete = await tx.get(db.doc(`athletes/${item.athleteUid}`));
      const ref = db.doc(`parentAthleteLinks/${item.id}`);
      const current = await tx.get(ref);
      deactivationReads.push({ item, athlete, ref, current });
    }

    for (const { item, ref, current } of normalizationReads) {
      if (!current.exists || String(current.data()?.athleteUid || "") !== item.athleteUid) {
        throw new Error(`NORMALIZATION_PREFLIGHT_CHANGED: ${item.id}`);
      }
      tx.update(ref, { ...item.patch, normalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    for (const { item, athlete, ref, current } of deactivationReads) {
      if (athlete.exists || !current.exists || current.data()?.status !== "active") {
        throw new Error(`DEACTIVATION_PREFLIGHT_CHANGED: ${item.id}`);
      }
      tx.update(ref, {
        ...item.patch,
        deactivatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

export async function main(argv = process.argv.slice(2)) {
  const write = argv.includes("--write-production");
  const token = argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length) || "";
  if (write && token !== WRITE_CONFIRMATION) throw new Error("Exact production confirmation token required.");
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const inventory = await loadInventory(db);
  const plan = buildParentLinkNormalizationPlan(inventory);
  if (plan.errors.length) throw new Error(`Fail-closed preflight errors: ${JSON.stringify(plan.errors)}`);
  if (write) await applyPlan(db, plan);
  console.log(JSON.stringify({
    mode: write ? "WRITE_COMPLETE" : "DRY_RUN",
    physicalLinks: inventory.links.length,
    ...plan,
    deactivateOnlyAfterCanonicalVerification: postCanonicalDuplicateCandidates(inventory.links),
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
