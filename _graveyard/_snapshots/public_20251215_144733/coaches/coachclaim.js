// File: setCoachClaim.js
// Run with: node setCoachClaim.js
// Make sure you have your Firebase service account JSON available.

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

// 1) Init Admin SDK
initializeApp({
  credential: cert(serviceAccount)
});

// 2) Replace with the UID of your account (find in Firebase Console → Auth → Users)
const uid = "YOUR_UID_HERE";

async function setCoach() {
  try {
    await getAuth().setCustomUserClaims(uid, { coach: true });
    console.log(`✅ Claims set: { coach: true } for UID=${uid}`);
    console.log("User must sign out/sign in again to refresh claims.");
  } catch (e) {
    console.error("❌ Failed to set claims:", e);
  }
}

setCoach();
