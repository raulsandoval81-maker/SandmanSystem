import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

async function run() {
  console.log("Starting athlete backfill...");

  const snap = await db.collection("athletes").get();

  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    const needsPromotionLock = data.promotionLocked === undefined;
    const needsTesting = data.testing === undefined;

    if (!needsPromotionLock && !needsTesting) {
      console.log(`Skipped: ${doc.id}`);
      skipped++;
      continue;
    }

    const updatePayload: any = {};

    if (needsPromotionLock) {
      updatePayload.promotionLocked = true;
    }

    if (needsTesting) {
      updatePayload.testing = {
        state: "ACTIVE",
        coachReady: false,
        coachReadyAt: null,
        testingStartedAt: null,
        cooldownUntil: null,
        freezeUntil: null,
        lastTestResult: null,
        templeEnteredAt: null,
        testEligibleAt: null
      };
    }

    await doc.ref.update(updatePayload);

    console.log(`Updated: ${doc.id}`);
    updated++;
  }

  console.log("----- DONE -----");
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
});