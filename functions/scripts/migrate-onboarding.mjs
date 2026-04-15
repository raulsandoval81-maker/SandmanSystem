// functions/scripts/migrate-onboarding.mjs
// One-time onboarding patch for legacy athletes (ADD ONLY)
// - Dry run by default
// - Targets: F4_0001..F4_0046 and F8_0001..F8_0002
// - Does NOT touch XP, rank, tier, or authUid

import admin from "firebase-admin";

// ---- CONFIG ----
const DRY_RUN = !process.argv.includes("--commit");

// Optional: pick project explicitly
// process.env.GOOGLE_CLOUD_PROJECT = "your-project-id";

if (!admin.apps.length) {
  admin.initializeApp(); // uses ADC (Application Default Credentials)
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

function baseOnboarding() {
  return {
    version: "v1",
    status: "new",
    step: 1,
    locks: {
      step1: false,
      step2: false,
      step3: false,
      step4: false,
      step5: false,
      step6: false,
      step7: false,
      step8: false,
      step9: false,
    },
  };
}

// Only “add” missing pieces. Never overwrite progress.
function buildPatch(docData) {
  const patch = {};
  const ob = docData?.onboarding;

  // If onboarding is missing or not a map -> set full onboarding
  if (!ob || typeof ob !== "object") {
    patch["onboarding"] = baseOnboarding();
    patch["updatedAt"] = FieldValue.serverTimestamp();
    return patch;
  }

  // If onboarding exists, only fill missing keys
  if (!("version" in ob)) patch["onboarding.version"] = "v1";
  if (!("status" in ob)) patch["onboarding.status"] = "new";
  if (!("step" in ob)) patch["onboarding.step"] = 1;

  // locks map
  if (!ob.locks || typeof ob.locks !== "object") {
    patch["onboarding.locks"] = baseOnboarding().locks;
  } else {
    const locks = ob.locks;
    for (const k of Object.keys(baseOnboarding().locks)) {
      if (!(k in locks)) patch[`onboarding.locks.${k}`] = false;
    }
  }

  if (Object.keys(patch).length) {
    patch["updatedAt"] = FieldValue.serverTimestamp();
  }
  return patch;
}

// Firestore range query helper for uidCode
async function fetchRange(start, end) {
  const snap = await db
    .collection("athletes")
    .orderBy("uidCode")
    .startAt(start)
    .endAt(end)
    .get();

  return snap.docs;
}

async function run() {
  const ranges = [
    { label: "F4 0001-0046", start: "F4_0001", end: "F4_0046" },
    { label: "F8 0001-0002", start: "F8_0001", end: "F8_0002" },
    { label: "DEV Ghost", start: "F4_TEST_GHOST_", end: "F4_TEST_GHOST_\uf8ff" },
  ];

  let total = 0;
  let willPatch = 0;

  const writer = db.bulkWriter();

  for (const r of ranges) {
    const docs = await fetchRange(r.start, r.end);
    console.log(`\n[range] ${r.label} -> found ${docs.length}`);

    for (const d of docs) {
      total++;
      const data = d.data() || {};
      const patch = buildPatch(data);

      if (!Object.keys(patch).length) continue;

      willPatch++;
      console.log(
        `PATCH ${d.id}`,
        JSON.stringify(
          {
            hasOnboarding: !!data.onboarding,
            patchKeys: Object.keys(patch),
          },
          null,
          2
        )
      );

      if (!DRY_RUN) {
        writer.update(d.ref, patch);
      }
    }
  }

  if (!DRY_RUN) {
    await writer.close();
  }

  console.log("\n---- SUMMARY ----");
  console.log("dryRun:", DRY_RUN);
  console.log("totalDocsScanned:", total);
  console.log("docsPatched:", willPatch);
  console.log(DRY_RUN ? "No writes performed." : "Writes committed.");
}

run().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});