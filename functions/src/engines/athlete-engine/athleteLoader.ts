import * as admin from "firebase-admin";

import { normalizeAthlete } from "./athleteNormalizer";

export async function loadAthlete(uid: string) {

  const snapshot = await admin
    .firestore()
    .collection("athletes")
    .doc(uid)
    .get();

  if (!snapshot.exists) {

    throw new Error(`Athlete ${uid} not found.`);

  }

  const athlete = snapshot.data();

  return normalizeAthlete(athlete);

}