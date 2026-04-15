// Seed users/{uid}/xp/{track} + leaderboards/{track}/{YYYY-MM}/{uid}
// Works against the Firestore emulator. Mode: merge (default) or overwrite.

// ---- emulator host (do NOT change) ----
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081";

// ---- admin init ----
const { getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
if (!getApps().length) initializeApp();
const db = getFirestore();

// ---- CLI mode ----
//   node functions/tools/seedAll.js --mode=merge
//   node functions/tools/seedAll.js --mode=overwrite
const argMode = (process.argv.find(a => a.startsWith("--mode=")) || "--mode=merge").split("=")[1];
const OVERWRITE = argMode === "overwrite";
const MERGE_OPT = OVERWRITE ? { merge: false } : { merge: true };

// ---- CONFIG: tracks + starting tier ----
const TRACKS = {
  foundry8: { startTier: "shadow" },            // Youth Combat (Zero2Hero)
  foundry4_combat: { startTier: "apprentice" }, // Teen/Adult Combat (Path2Legend)
  foundry4_leadership: { startTier: "apprentice" } // Leadership (Quest4Mastery)
};

// ---- EDIT THIS: your athletes per track ----
incrementXp({
  uid: "demo08A",
  track: "foundry8",
  type: "attendance",
  monthKey: "2025-09"
})

// Optional starting bonus
const INITIAL_BONUS_XP = 0;

function monthKey(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}

async function seedAthlete(uid, track, startTier, mkey){
  const userRef = db.doc(`users/${uid}`);
  const xpRef   = db.doc(`users/${uid}/xp/${track}`);
  const lbRef   = db.doc(`leaderboards/${track}/months/${mkey}/entries/${uid}`);

  // Optionally wipe target docs first on overwrite (keeps it squeaky clean)
  if (OVERWRITE){
    await Promise.allSettled([xpRef.delete(), lbRef.delete()]);
  }

  // Minimal user scaffold (safe in both modes)
  await userRef.set({
    displayName: uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  // Live XP doc
  await xpRef.set({
    points: INITIAL_BONUS_XP,
    tier: startTier,
    monthKey: mkey,
    track,
    updatedAt: FieldValue.serverTimestamp()
  }, MERGE_OPT);

  // Leaderboard mirror (flat monthly path with /months/{YYYY-MM}/entries/)
  await lbRef.set({
    uid,
    displayName: uid,
    track,
    total: INITIAL_BONUS_XP,
    lastUpdate: FieldValue.serverTimestamp()
  }, MERGE_OPT);

  // Optional seed log if giving a bonus
  if (INITIAL_BONUS_XP !== 0){
    await db.collection("xpLogs").add({
      uid, track, monthKey: mkey,
      type: "seed_bonus",
      delta: INITIAL_BONUS_XP,
      appliedDelta: INITIAL_BONUS_XP,
      totalAfter: INITIAL_BONUS_XP,
      ts: FieldValue.serverTimestamp()
    });
  }

  return { uid, track };
}

(async function main(){
  const mkey = monthKey();
  console.log(`Mode: ${OVERWRITE ? "overwrite" : "merge"}  |  Month: ${mkey}`);

  let count = 0;
  for (const track of Object.keys(ATHLETES)){
    const conf = TRACKS[track];
    if (!conf){ console.warn(`Skipping unknown track: ${track}`); continue; }
    for (const uid of ATHLETES[track]){
      try{
        await seedAthlete(uid, track, conf.startTier, mkey);
        console.log(`✓ ${uid} → ${track}`);
        count++;
      }catch(e){
        console.error(`✗ ${uid} → ${track}:`, e?.message || e);
      }
    }
  }
  console.log(`Done. Seeded ${count} athlete(s).`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
