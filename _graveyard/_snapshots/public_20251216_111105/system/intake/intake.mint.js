// ===============================
// MINT SERVICE — FIRESTORE LOGIC
// v1.0  (Step 3 Core Wiring)
// ===============================

import { db, serverTimestamp } from "../../public/intake-shared/fire.js";

// Mint format: F8_CB0001FOC (example)
function formatMintTag({ track, lane, num, cap }) {
  const numStr = String(num).padStart(4, "0");
  return `${track}_${lane}${numStr}${cap}`;
}

// Create athlete Firestore document
export async function mintAthleteProfile(intakeData) {
  const {
    track,              // "F8" or "F4"
    lane,               // "CB" | "LS" | "SP"
    virtueCap,          // "FOC"
    virtueFull,         // "FOCUS"
    athleteInfo,        // name, DOB, etc.
    parentInfo,         // contact details
    coachUid,           // coach minting them
  } = intakeData;

  // =============== Generate unique mint number =================
  const counterRef = db.collection("system")
                       .doc("mintCounters")
                       .collection(track)
                       .doc(lane);

  const counterSnap = await counterRef.get();
  let nextNum = 1;

  if (counterSnap.exists) {
    nextNum = (counterSnap.data().count || 0) + 1;
  }

  await counterRef.set({ count: nextNum }, { merge: true });

  // =============== Build final mint tag =========================
  const mintTag = formatMintTag({
    track,
    lane,
    num: nextNum,
    cap: virtueCap
  });

  // =============== Store athlete profile =========================
  const athleteRef = db.collection("athletes").doc();
  const athleteUid = athleteRef.id;

  const athleteDoc = {
    createdAt: serverTimestamp(),
    track,
    lane,
    virtueCap,
    virtueFull,
    mintTag,
    ...athleteInfo,
    parentInfo,
    coachUid,
    xp: 0,
    stripeCount: 0,
  };

  await athleteRef.set(athleteDoc);

  // =============== Add to coach roster ==========================
  await db.collection("coaches")
          .doc(coachUid)
          .collection("roster")
          .doc(athleteUid)
          .set({
            mintTag,
            name: athleteInfo.name,
            track,
            lane,
            virtueCap,
            createdAt: serverTimestamp()
          });

  // =============== Build athlete welcome link ===================
  const athleteUrl = `/intake-athlete/?uid=${athleteUid}&mint=${mintTag}`;

  return {
    athleteUid,
    mintTag,
    athleteUrl
  };
}
