import { createRequire } from "module";
const require = createRequire(import.meta.url);

let admin;
try {
  admin = require("firebase-admin");
} catch {
  console.error("firebase-admin not found. Run: npm i firebase-admin");
  process.exit(1);
}

/* =========================
   ENV / CONFIG
========================= */

const PROJECT_ID = process.env.PROJECT_ID || "sandmandashboard";
const EMU_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";
const DRY_RUN = String(process.env.DRY_RUN || "1") !== "0";

const COLLECTIONS = (process.env.COLLECTIONS ||
  "athletes,athletesXP,xp_logs,leaderboards")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

/* =========================
   INIT PROD (REAL FIRESTORE)
========================= */

// prevent emulator env from leaking into prod
const savedEMU = process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIRESTORE_EMULATOR_HOST;

const prodApp = admin.initializeApp(
  {
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  },
  "prod"
);

const prodDb = prodApp.firestore();

// restore emulator env
if (savedEMU) process.env.FIRESTORE_EMULATOR_HOST = savedEMU;

/* =========================
   INIT EMULATOR
========================= */

const emuApp = admin.initializeApp(
  { projectId: PROJECT_ID },
  "emu"
);

const emuDb = emuApp.firestore();
emuDb.settings({ host: EMU_HOST, ssl: false });

/* =========================
   HELPERS
========================= */

function log(...args) {
  console.log(...args);
}

async function upsert(ref, data) {
  if (DRY_RUN) return;
  await ref.set(data, { merge: true });
}

/* =========================
   MIRROR LOGIC
========================= */

async function mirrorCollection(colName) {
  const snap = await emuDb.collection(colName).get();
  log(`\n[${colName}] emulator docs: ${snap.size}`);

  for (const doc of snap.docs) {
    const data = doc.data();
    const prodRef = prodDb.collection(colName).doc(doc.id);

    if (DRY_RUN) {
      log(`DRY_RUN → ${colName}/${doc.id}`);
    } else {
      await upsert(prodRef, data);
      log(`upserted → ${colName}/${doc.id}`);
    }

    await mirrorSubcollections(doc.ref, prodRef);
  }

  log(`[${colName}] complete`);
}

async function mirrorSubcollections(emuDocRef, prodDocRef) {
  const subcols = await emuDocRef.listCollections();

  for (const subcol of subcols) {
    const snap = await subcol.get();

    for (const subDoc of snap.docs) {
      const prodRef = prodDocRef
        .collection(subcol.id)
        .doc(subDoc.id);

      if (DRY_RUN) {
        log(`DRY_RUN → ${prodRef.path}`);
      } else {
        await upsert(prodRef, subDoc.data());
        log(`upserted → ${prodRef.path}`);
      }

      await mirrorSubcollections(subDoc.ref, prodRef);
    }
  }
}

/* =========================
   MAIN
========================= */

async function main() {
  log("\n=== FIRESTORE MIRROR (EMU → PROD) ===");
  log("Project:", PROJECT_ID);
  log("Emulator:", EMU_HOST);
  log("DRY_RUN:", DRY_RUN ? "ON" : "OFF");
  log("Collections:", COLLECTIONS.join(", "));

  for (const col of COLLECTIONS) {
    await mirrorCollection(col);
  }

  log("\nDONE\n");
  process.exit(0);
}

main().catch(err => {
  console.error("Mirror failed:", err);
  process.exit(1);
});
