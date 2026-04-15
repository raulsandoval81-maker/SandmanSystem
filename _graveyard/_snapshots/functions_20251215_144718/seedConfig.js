// functions/seedConfig.js
const admin = require("firebase-admin");

/** Hard-force emulator + project id (bulletproof) */
process.env.GCLOUD_PROJECT = "sandmandashboard";
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8081";   // ensure Admin SDK hits emulator

admin.initializeApp({ projectId: "sandmandashboard" });
const db = admin.firestore();

async function main() {
  const config = {
    foundry8: {
      attendanceMax: 120,
      assignmentsMax: 40,
      character: { serviceMonthlyCap: 50 },
      practice: {
        attendance: { value: 10, maxPerMonth: 120 },
        shark: { value: 5, maxPerMonth: 2 },
        fish: { value: -5, maxPerMonth: 4 },
      },
      tournaments: { show: 20 },
      style: { value: 5, maxPerMonth: 2, animals: ["bull","matador","snake","mongoose","gorilla"] },
      prestige: { lion: { value: 15, capWeekend: 50 }, tiger: { value: 50 }, bear: { value: 100 } },
    },
    foundry4: {
      attendanceMax: 120,
      assignmentsMax: 40,
      character: { serviceMonthlyCap: 50 },
      practice: {
        attendance: { value: 10, maxPerMonth: 120 },
        shark: { value: 5, maxPerMonth: 2 },
        fish: { value: -5, maxPerMonth: 4 },
      },
      tournaments: { show: 20 },
      style: { value: 5, maxPerMonth: 2, animals: ["bull","matador","snake","mongoose","gorilla"] },
      prestige: { lion: { value: 15, capWeekend: 50 }, tiger: { value: 50 }, bear: { value: 100 } },
    },
    leadership: {
      attendanceMax: 0,
      assignmentsMax: 0,
      character: { serviceMonthlyCap: 0 },
      monthlyAllowanceMin: 100,
      monthlyAllowanceMax: 150,
      tournaments: { show: 0 },
      style: { value: 0, maxPerMonth: 0, animals: [] },
      prestige: {},
    },
  };

  const ref = db.doc("config/XP_CONFIG");
  await ref.set(config, { merge: false });
  const snap = await ref.get();
  console.log("✅ XP_CONFIG written to EMULATOR:", snap.exists);
  if (snap.exists) {
    const keys = Object.keys(snap.data() || {});
    console.log("   keys:", keys.join(", "));
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("❌ seeding failed:", err);
  process.exit(1);
});
