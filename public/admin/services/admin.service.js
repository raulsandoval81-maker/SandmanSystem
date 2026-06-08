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

function accountabilityLevelFromKind(kind = "") {
  const k = String(kind || "").toUpperCase();

  if (k.includes("ACCOUNTABILITY/MAJOR")) return "major_infraction";
  if (k.includes("ACCOUNTABILITY/SEMI")) return "semi_major_infraction";
  if (k.includes("ACCOUNTABILITY/MINOR")) return "minor_infraction";

  return null;
}

function transitionStatusFromKind(kind = "") {
  const k = String(kind || "").toUpperCase();
  return k.includes("TRANSITION") ? "transition_credit" : null;
}

function safeKeyFromDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}_${mm}_adjustment`;
}

export async function applyXpAdjustment({
  uid,
  amount,
  kind,
  note
}) {
  const athleteIdClean = String(uid || "")
    .trim()
    .toUpperCase();

  const xpAmount = Number(amount || 0);

  const xpKind = String(kind || "OTHER")
    .trim()
    .toUpperCase();

  const xpNote = String(note || "")
    .trim();

  if (!athleteIdClean) {
    throw new Error("Missing athlete ID");
  }

  if (!Number.isFinite(xpAmount) || xpAmount === 0) {
    throw new Error("Invalid XP amount");
  }

  const athleteRef = doc(db, "athletes", athleteIdClean);
  const athleteSnap = await getDoc(athleteRef);

  if (!athleteSnap.exists()) {
    throw new Error("Athlete not found");
  }

  const athlete = athleteSnap.data() || {};

  const beforeXp = Number(athlete.xp || 0);
  const afterXp = Math.max(0, beforeXp + xpAmount);

  const accountabilityType = accountabilityLevelFromKind(xpKind);
  const transitionType = transitionStatusFromKind(xpKind);

  const adjustmentKey = safeKeyFromDate();

  const athletePatch = {
    xp: afterXp,
    updatedAt: serverTimestamp()
  };

  if (accountabilityType) {
    athletePatch[`accountability.${adjustmentKey}`] = {
      amount: xpAmount,
      type: accountabilityType,
      reason: xpNote || "Conduct inconsistent with program standards",
      appliedAt: serverTimestamp()
    };
  }

  if (transitionType) {
    athletePatch[`transitionAdjustments.${adjustmentKey}`] = {
      amount: xpAmount,
      type: transitionType,
      reason: xpNote || "F4 ladder migration transition credit",
      appliedAt: serverTimestamp()
    };
  }

  console.log("[XP ADJUST]", {
    athleteIdClean,
    beforeXp,
    xpAmount,
    afterXp,
    xpKind
  });

  await updateDoc(athleteRef, athletePatch);

  await addDoc(collection(db, "xpLogs"), {
    uid: athleteIdClean,
    amount: xpAmount,
    beforeXp,
    afterXp,
    kind: xpKind,
    track: athlete.track || "",
    lane: "combat",
    xpCap: Number(athlete.xpCap || 0),
    coachUid: athlete.coachUid || "ADMIN",
    meta: {
      source: "admin_adjustment",
      note: xpNote,
      accountabilityType,
      transitionType
    },
    createdAt: serverTimestamp()
  });

  return {
    uid: athleteIdClean,
    beforeXp,
    afterXp,
    amount: xpAmount,
    kind: xpKind
  };
}