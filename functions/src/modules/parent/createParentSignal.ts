import { getFirestore, FieldValue } from "firebase-admin/firestore";

import {
  PARENT_SIGNAL_TYPES,
  ParentSignalType,
} from "./parentSignalTypes";

import { buildParentMessage } from "./buildParentMessage";

type CreateParentSignalInput = {
  athleteId: string;
  type: ParentSignalType;
  athleteName?: string;
  testingDate?: string;
  nextTier?: string;
  note?: string;
  source?: string;
  sourceId?: string;
};

export async function createParentSignal(
  input: CreateParentSignalInput
) {
  const db = getFirestore();

  const athleteId = String(input.athleteId || "").trim();

  if (!athleteId) return { ok: false, reason: "missing-athleteId" };

  const linksSnap = await db
    .collection("parentAthleteLinks")
    .where("athleteUid", "==", athleteId)
    .where("status", "==", "active")
    .get();

  if (linksSnap.empty) {
    return { ok: false, reason: "no-active-parent-link" };
  }

  const built = buildParentMessage({
    type: input.type,
    athleteName: input.athleteName,
    testingDate: input.testingDate,
    nextTier: input.nextTier,
    note: input.note,
  });

  const batch = db.batch();

  linksSnap.docs.forEach((linkDoc) => {
    const link = linkDoc.data() || {};
    const parentUid = String(link.parentUid || "").trim();

    if (!parentUid) return;

    const ref = db.collection("parentInbox").doc();


batch.set(ref, {
  athleteId,
  athleteName: input.athleteName || athleteId,
  parentUid,
  type: input.type,
  title: built.title,
  message: built.message,

  note: input.note || null,

  read: false,
  source: input.source || "system",
  sourceId: input.sourceId || athleteId,
  createdAt: FieldValue.serverTimestamp(),
});
});

  await batch.commit();

  return { ok: true };
}

export { PARENT_SIGNAL_TYPES };