// public/admin/services/admin.service.js
// Admin-only XP adjustment engine

import { db } from "/assets/js/firebase-init.js";

import {
  doc,
  collection,
  runTransaction,
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

  if (!Number.isSafeInteger(xpAmount) || xpAmount === 0) {
    throw new Error("Invalid XP amount");
  }

  const athleteRef = doc(db, "athletes", athleteIdClean);
  const logRef = doc(collection(db, "xpLogs"));

  const result = await runTransaction(db, async (tx) => {
  const athleteSnap = await tx.get(athleteRef);

  if (!athleteSnap.exists()) {
    throw new Error("Athlete not found");
  }

  const athlete = athleteSnap.data() || {};

  const beforeXp = Number(athlete.xp || 0);
  if (!Number.isSafeInteger(beforeXp) || beforeXp < 0) {
    throw new Error("Invalid athlete XP balance");
  }
  const afterXp = Math.max(0, beforeXp + xpAmount);
  if (!Number.isSafeInteger(afterXp)) {
    throw new Error("XP result exceeds the supported range");
  }
  const appliedDelta = afterXp - beforeXp;

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

  tx.update(athleteRef, athletePatch);

  tx.set(logRef, {
    uid: athleteIdClean,
    amount: appliedDelta,
    requestedAmount: xpAmount,
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

  return { beforeXp, afterXp, appliedDelta };
  });
  return {
    uid: athleteIdClean,
    beforeXp: result.beforeXp,
    afterXp: result.afterXp,
    amount: result.appliedDelta,
    requestedAmount: xpAmount,
    kind: xpKind
  };
}