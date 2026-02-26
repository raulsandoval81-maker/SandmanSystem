// seed-all.js
// Runs against Firestore **Emulator** by default.
// Usage:
//   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
//   node seed-all.js

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ---- Config you may tweak ----
const PROJECT_ID = "sandmandashboard";       // your emulator project id
const DEFAULT_USER = "demoUser";             // where we seed athlete docs
// --------------------------------

// Point admin SDK at emulator if env var is set
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn("⚠️  FIRESTORE_EMULATOR_HOST not set. Seeding will target PRODUCTION.");
  console.warn("    To seed the emulator, run:");
  console.warn("    export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081\n");
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

// Map filenames -> async function that writes to Firestore.
// Add new routes here as you introduce more JSON files.
const ROUTES = {
  // Seeds your athlete XP doc for combat
  "combat.json": async (data) => {
    return db
      .collection("users").doc(DEFAULT_USER)
      .collection("xp").doc("combat")
      .set(data, { merge: false });
  },

  // Examples (uncomment when ready & adjust paths to match your model):
  // "leaderboard.json": async (data) =>
  //   db.collection("leaderboards").doc("global").set(data, { merge: false }),
  // "ceremonies.json": async (data) =>
  //   db.collection("ceremonies").doc("config").set(data, { merge: false }),
  // "athlete-weekly.json": async (data) =>
  //   db.collection("reports").doc("athlete-weekly").set(data, { merge: false }),
  // "coach-weekly.json": async (data) =>
  //   db.collection("reports").doc("coach-weekly").set(data, { merge: false }),
};

async function main() {
  const dataDir = path.resolve(__dirname, "public", "data");
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No JSON files found in /public/data. Nothing to seed.");
    return;
  }

  console.log(`Found ${files.length} JSON file(s) in /public/data:\n- ${files.join("\n- ")}\n`);

  const results = await Promise.allSettled(
    files.map(async (file) => {
      const full = path.join(dataDir, file);
      const raw = fs.readFileSync(full, "utf8");
      const data = JSON.parse(raw);

      const route = ROUTES[file];
      if (!route) {
        throw new Error(`No seeding route defined for "${file}". (Safe-skip)`);
      }

      await route(data);
      return `✅ Seeded ${file}`;
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      console.log(r.value);
    } else {
      console.log(`⏭️  Skipped: ${r.reason.message}`);
    }
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Seeder failed:", e);
  process.exit(1);
});
