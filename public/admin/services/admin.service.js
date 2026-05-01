// public/admin/services/admin.service.js
// Admin-only XP adjustment engine

import { db } from "/assets/js/firebase-init.js";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

export async function applyXpAdjustment({ uid, amount, kind, note }) {
  const athleteIdClean = String(uid || "").trim().toUpperCase();
  const xpAmount = Number(amount || 0);
  const xpKind = String(kind || "ADMIN").trim().toUpperCase();
  const xpNote = String(note || "").trim();

  if (!athleteIdClean) {
    throw new Error("Missing athlete ID");
  }

  if (!Number.isFinite(xpAmount) || xpAmount <= 0) {
    throw new Error("Invalid XP amount");
  }

  const athleteRef = doc(db, "athletes", athleteIdClean);
  const athleteSnap = await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    throw new Error("Athlete not found");
  }

  const athlete = athleteSnap.data() || {};
  const beforeXp = Number(athlete.xp || 0);
  const afterXp = beforeXp + xpAmount;

  await updateDoc(athleteRef, {
    xp: afterXp,
    updatedAt: serverTimestamp()
  });

  await addDoc(collection(db, "xpLogs"), {
    uid: athleteIdClean,
    amount: xpAmount,
    beforeXp,
    afterXp,
    kind: xpKind,
    track: athlete.track || "",
    lane: athlete.lane || "combat",
    xpCap: Number(athlete.xpCap || 0),
    coachUid: athlete.coachUid || "ADMIN",
    meta: {
      source: "admin_adjustment",
      note: xpNote
    },
    createdAt: serverTimestamp()
  });

  return {
    uid: athleteIdClean,
    beforeXp,
    afterXp,
    amount: xpAmount
  };
}