import { auth, db, doc, functions, getDoc, httpsCallable } from "./firebase-init.js";

const authorizeProfile = httpsCallable(functions, "getAthleteProfileFeed");

export async function readAuthorizedAthleteProfile(athleteId) {
  if (typeof athleteId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(athleteId)) return null;
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;

  const { data } = await authorizeProfile({ athleteId, authorizeOnly: true });
  if (data?.authorized !== true || data.athleteId !== athleteId || auth.currentUser !== user) return null;

  const snapshot = await getDoc(doc(db, "athletes", athleteId));
  if (!snapshot.exists() || auth.currentUser !== user) return null;
  return { ...snapshot.data(), id: snapshot.id };
}
