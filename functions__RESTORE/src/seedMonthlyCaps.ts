import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Core function: runs monthly caps seeding once
 */
export async function runSeedMonthlyCapsOnce() {
  const snapshot = await db.collection("users").get();

  for (const doc of snapshot.docs) {
    const uid = doc.id;

    // Example caps structure — adjust to match your config
    const capsRef = db.collection("users").doc(uid).collection("caps");
    const monthKey = new Date().toISOString().slice(0, 7); // e.g., "2025-09"

    await capsRef.doc(monthKey).set(
      {
        attendance: 0,
        assignments: 0,
        character_service: 0,
        tournaments: 0,
        leadership: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { message: "Monthly caps seeded successfully" };
}

/**
 * Callable wrapper (for dev/testing)
 */
export const seedMonthlyCapsManual = functions.https.onCall(async (_data, ctx) => {
  const claims = ctx.auth?.token as any;
  if (!ctx.auth || !(claims?.role === "admin" || claims?.role === "coach")) {
    throw new functions.https.HttpsError("permission-denied", "Coach/Admin only");
  }

  return await runSeedMonthlyCapsOnce();
});
