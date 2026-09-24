import { createHash } from "node:crypto";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import {
  PARENT_SIGNAL_TYPES,
  ParentSignalType,
  parentInboxRetentionClass,
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
  idempotencyKey?: string;

  tournamentId?: string;
  tournamentTitle?: string;
  tournamentDate?: string;
  tournamentLocation?: string;

  meta?: Record<string, unknown>;
};

export async function createParentSignal(
  input: CreateParentSignalInput
) {
  const db = getFirestore();

  const athleteId =
    String(input.athleteId || "").trim();

  if (!athleteId) {
    return {
      ok: false,
      reason: "missing-athleteId",
    };
  }

  const linksSnap = await db
    .collection("parentAthleteLinks")
    .where("athleteUid", "==", athleteId)
    .where("status", "==", "active")
    .get();

  if (linksSnap.empty) {
    return {
      ok: false,
      reason: "no-active-parent-link",
    };
  }

  const built = buildParentMessage({
    type: input.type,
    athleteName: input.athleteName,
    testingDate: input.testingDate,
    nextTier: input.nextTier,
    note: input.note,
  });

  const parentUids = [
    ...new Set(
      linksSnap.docs
        .map((doc) =>
          String(doc.data()?.parentUid || "").trim()
        )
        .filter(Boolean)
    ),
  ];

  if (!parentUids.length) {
    return {
      ok: false,
      reason: "no-parentUid-on-links",
    };
  }

  const idempotencyKey =
    String(input.idempotencyKey || "").trim();

  const signalPayload = (parentUid: string) => ({
      athleteId,
      athleteName:
        input.athleteName || athleteId,

      parentUid,

      type: input.type,
      title: built.title,
      message: built.message,

      note:
        input.note || null,

      read: false,
      archived: false,
      archivedAt: null,
      retentionClass:
        parentInboxRetentionClass(input.type),

      source:
        input.source || "system",

      sourceId:
        input.sourceId || athleteId,

      tournamentId:
         input.tournamentId || null,

      meta:
         input.meta || null,

      createdAt:
        FieldValue.serverTimestamp(),
    });

  if (idempotencyKey) {
    const refs = parentUids.map((parentUid) =>
      db.collection("parentInbox").doc(
        createHash("sha256")
          .update(`${parentUid}|${idempotencyKey}`)
          .digest("hex")
      )
    );

    await db.runTransaction(async (tx) => {
      const snapshots = [];
      for (const ref of refs) {
        snapshots.push(await tx.get(ref));
      }
      snapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) {
          tx.create(refs[index], signalPayload(parentUids[index]));
        }
      });
    });
  } else {
    const batch = db.batch();
    parentUids.forEach((parentUid) => {
      batch.set(
        db.collection("parentInbox").doc(),
        signalPayload(parentUid)
      );
    });
    await batch.commit();
  }

  return {
    ok: true,
    sent: parentUids.length,
    parentUids,
  };
}

export { PARENT_SIGNAL_TYPES };
