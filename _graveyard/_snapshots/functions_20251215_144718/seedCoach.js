/**
 * Seed demo coach leaderboard data
 * Run with:  node seedCoach.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // only if needed for live; emulator doesn’t require this

// 🔹 Init Admin pointing to local emulator
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8081"; // make sure this matches your Firestore emulator port
admin.initializeApp();

const db = admin.firestore();

async function seedCoachData() {
// functions/seedCoach.js
const track = "foundry8";           // not foundry8_combat
const month = "2025-09";
const collectionPath = `leaderboards/${track}/months/${month}/entries`;

  const demoAthletes = [
    {
      uid: "ath-001",
      fullName: "Sam Shadow",
      initLast: "S.Shadow",
      dogTag: "000001",
      type: "practice",
      xp: 10,
    },
    {
      uid: "ath-002",
      fullName: "Max Recruit",
      initLast: "M.Recruit",
      dogTag: "000002",
      type: "tournament",
      xp: 15,
    },
    {
      uid: "ath-003",
      fullName: "Leo Warrior",
      initLast: "L.Warrior",
      dogTag: "000003",
      type: "style",
      xp: 5,
    },
  ];

  for (const athlete of demoAthletes) {
    await db.collection(collectionPath).add({
      uid: athlete.uid,
      fullName: athlete.fullName,
      initLast: athlete.initLast,
      dogTag: athlete.dogTag,
      type: athlete.type,
      xp: athlete.xp,
      track,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  console.log("✅ Coach leaderboard seeded with demo athletes!");
}

seedCoachData()
  .then(() => process.exit())
  .catch((err) => {
    console.error("❌ Error seeding coach data:", err);
    process.exit(1);
  });
