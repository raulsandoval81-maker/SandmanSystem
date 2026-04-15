// functions/src/onboarding.ts
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

type ActivatePayload = {
  uid: string;
  padlockId: string;                  // internal id coach assigns
  track: "foundry4" | "foundry8";
  klass: "combat" | "leadership";
  tier: string;                       // e.g. "T0".."T4"/"T8"
  publicName: string;                 // "R. Sandoval"
};

export const activateAthlete = onCall<ActivatePayload>(async (req) => {
  const p = req.data||{}; 
  if (!p.uid || !p.padlockId || !p.track || !p.klass || !p.tier || !p.publicName) {
    throw new HttpsError("invalid-argument","missing fields");
  }
  const uid = p.uid;

  const intakeRef   = db.doc(`intakes/${uid}`);
  const pubRef      = db.doc(`athletes_public/${uid}`);
  const privRef     = db.doc(`athletes_private/${uid}`);
  const mk          = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth()+1).padStart(2,"0")}`;

  await db.runTransaction(async (tx) => {
    const intakeSnap = await tx.get(intakeRef);
    if (!intakeSnap.exists) throw new HttpsError("failed-precondition","parent intake not found");
    const intake = intakeSnap.data() as any;

    // public surface (athlete & parent can read)
    const publicDoc = {
      uid,
      displayName: p.publicName,
      track: p.track,
      class: p.klass,
      tier: p.tier,
      status: "active",
      compGate: p.track==="foundry4" ? 800 : 800, // unify gate for now
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // private surface (coach-only; contains sensitive fields from intake)
    const privateDoc = {
      uid,
      padlockId: p.padlockId,
      legalFirst: intake.legalFirst||"",
      legalLast: intake.legalLast||"",
      dob: intake.dob||null,
      parentEmail: intake.parentEmail||"",
      parentPhone: intake.parentPhone||"",
      emergencyName: intake.emergencyName||"",
      emergencyPhone: intake.emergencyPhone||"",
      medicalNotes: intake.medicalNotes||"",
      track: p.track,
      class: p.klass,
      tier: p.tier,
      flags: intake.flags||{}, // veteran/fastTrack if parent hinted
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "parent_intake",
    };

    tx.set(pubRef, publicDoc, { merge: true });
    tx.set(privRef, privateDoc, { merge: true });
    tx.set(intakeRef, { status: "activated", activatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // seed monthly counters so UI isn’t blank (optional)
    tx.set(db.doc(`xpCounters/${uid}/months/${mk}`), { mk, seeded: true }, { merge: true });
  });

  return { ok: true };
});
