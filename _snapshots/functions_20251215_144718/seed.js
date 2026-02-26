
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

// ---- Emulator defaults (safe gym)
if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = "sandmandashboard";
if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8081";

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

function readJson(relPath) {
  const p = path.join(__dirname, "..", "public", "data", relPath);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function seed() {
  const athlete = readJson("athlete.json");        // { uid, displayName, tracks, belt, joinedAt, ... }
  const combat = readJson("combat.json");          // your xp/combat doc
  const leaderboard = readJson("leaderboard.json");// { monthKey, entries: [...] or {uid: {...}} }

  // --- 1) Athlete profile
  const uid = athlete.uid || "demoUser";
  await db.doc(`users/${uid}/profile/info`).set({
    displayName: athlete.displayName || uid,
    tracks: athlete.tracks || [],
    belt: athlete.belt || null,
    joinedAt: athlete.joinedAt || new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`✅ Seeded users/${uid}/profile/info`);

  // --- 2) Combat XP
  await db.doc(`users/${uid}/xp/combat`).set(combat, { merge: false });
  console.log(`✅ Seeded users/${uid}/xp/combat`);

  // --- 3) Leaderboard (normalize everything)
  const now = new Date();
  const defaultMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`;
  const monthKey = leaderboard?.monthKey || defaultMonthKey;

  const rawEntries = (leaderboard && leaderboard.entries) || [];
  const entries = Array.isArray(rawEntries) ? rawEntries : Object.values(rawEntries); // object -> array

  // find or create the demo entry
  const found = entries.find(e => e?.uid === uid || e?.id === uid);
  const entry = found || {
    uid,
    displayName: athlete.displayName || uid,
    totals: { attendance: 0, assignments: 0, character_service: 0, tournaments: 0 },
  };

  // write to a per-user subdoc under the month
  await db.doc(`leaderboards/${monthKey}/entries/${uid}`).set(entry, { merge: false });
  console.log(`✅ Seeded leaderboards/${monthKey}/entries/${uid}`);

  console.log("🎉 All seed data written.");
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
