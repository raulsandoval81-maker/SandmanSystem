import { db, doc, setDoc, serverTimestamp } from "/assets/js/firebase-init.js";

export { db };
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
} from "/assets/js/firebase-init.js";

export async function createAthlete(uid, form) {
  const {
    fullName,
    publicName,
    team,
    city,
    state,
    mintVirtueTag,
    virtue
  } = form;

  const data = {
    uid,
    fullName,
    publicName,
    team,
    city,
    state,
    trackCode: "F4",
    lane: "combat",

    mintVirtueTag,
    virtue,

    onboardingComplete: false,
    onboardingStartedAt: serverTimestamp(),

    xp: 0,
    xpCap: 1200,
    stripeCount: 0,

    xpHonor: 0,
    xpHonorCap: 2400,
    xpStrength: 0,
    xpStrengthCap: 2400,

    tier: 0,
    rankName: "Apprentice",
    rankColor: "#ffffff",

    matchesTotal: 0,
    wins: 0,
    losses: 0,

    skillNeutral: "",
    skillTop: "",
    skillBottom: "",
    coachNotes: "",

    createdAt: serverTimestamp(),
    lastUpdate: serverTimestamp(),

    onboardingUrl: `/athletes/onboarding/step0.html?id=${uid}`
  };

  await setDoc(doc(db, "athletes", uid), data);
  return data.onboardingUrl;
}
