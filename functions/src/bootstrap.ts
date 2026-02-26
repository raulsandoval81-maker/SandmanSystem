import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = getFirestore();

// Log once per cold start (safe)
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log("🔥 Using Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}
