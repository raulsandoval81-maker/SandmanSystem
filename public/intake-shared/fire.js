// /intake-shared/fire.js
// Single source wrapper for browser SDK (no duplicate exports)

import {
  app,
  db,
  auth,
  functions,
  httpsCallable,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc
} from "/assets/js/firebase-init.js";

// Re-export named bindings (ONLY ONCE)
export {
  app,
  db,
  auth,
  functions,
  httpsCallable,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc
};

export async function createAthlete(uid, form) {
  const {
    fullName,
    publicName,
    team,
    city,
    state,
    mintVirtueTag,
    virtue,

    // new / optional fields
    trackCode = "F4",
    lane = "combat",
    tier = 0,
    rankName = "Apprentice",
    rankColor = "#ffffff",
    xpCap = 1200,

    startingXp = 0,
    stripeCount = 0,

    legacy = false,
    legacyType = null,
    legacyYearsVerified = 0,
    legacyCreditTotal = 0,
    legacyCreditIssued = 0,
    legacyHold = false,
    legacyCreditSchedule = null,
    legacyNote = null
  } = form;

  const data = {
    uid,
    fullName,
    publicName,
    team,
    city,
    state,
    trackCode,
    lane,

    mintVirtueTag,
    virtue,

    onboardingComplete: false,
    onboardingStartedAt: serverTimestamp(),

    xp: startingXp,
    xpCap,
    stripeCount,

    xpHonor: 0,
    xpHonorCap: 2400,
    xpStrength: 0,
    xpStrengthCap: 2400,

    tier,
    rankName,
    rankColor,

    matchesTotal: 0,
    wins: 0,
    losses: 0,

    skillNeutral: "",
    skillTop: "",
    skillBottom: "",
    coachNotes: "",

    legacy,
    legacyType,
    legacyYearsVerified,
    legacyCreditTotal,
    legacyCreditIssued,
    legacyHold,
    legacyCreditSchedule,
    legacyNote,

    createdAt: serverTimestamp(),
    lastUpdate: serverTimestamp(),

    onboardingUrl: `/athletes/onboarding/step0.html?id=${uid}`
  };

  await setDoc(doc(db, "athletes", uid), data);
  return data.onboardingUrl;
}