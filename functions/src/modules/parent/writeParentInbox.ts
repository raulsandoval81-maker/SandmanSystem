import {
  getFirestore,
  FieldValue
} from "firebase-admin/firestore";

export type ParentInboxPayload = {
  parentUid: string;
  athleteId?: string;
  athleteName?: string;

  type: string;

  title: string;
  message: string;

  source?: string;
  sourceId?: string;
};

export async function writeParentInbox(
  payload: ParentInboxPayload
) {
  const db = getFirestore();

  const {
    parentUid,
    athleteId,
    athleteName,
    type,
    title,
    message,
    source,
    sourceId,
  } = payload;

  if (!parentUid) {
    throw new Error(
      "writeParentInbox: parentUid required"
    );
  }

  const docRef =
    db.collection("parentInbox").doc();

  await docRef.set({
    parentUid,

    athleteId:
      athleteId || null,

    athleteName:
      athleteName || null,

    type,

    title,
    message,

    source:
      source || null,

    sourceId:
      sourceId || null,

    read: false,

    createdAt:
      FieldValue.serverTimestamp(),
  });

  return docRef.id;
}