import { getFirestore } from "firebase-admin/firestore";
import { sendParentSignal } from "./sendParentSignal";
import { ParentSignalType } from "./parentSignalTypes";

type Input = {
  athleteId: string;
  athleteName?: string;
  type: ParentSignalType;
  testingDate?: string;
  nextTier?: string;
  note?: string;
  amount?: number;
  stripeCount?: number;
  source?: string;
  sourceId?: string;
};

export async function sendParentSignalToAthleteParents(
  input: Input
) {
  const db = getFirestore();

  const snap = await db
    .collection("parentAthleteLinks")
    .where("athleteUid", "==", input.athleteId)
    .where("status", "==", "active")
    .get();

  if (snap.empty) {
    return {
      ok: true,
      sent: 0,
      parentUids: [],
    };
  }

  const parentUids = [
    ...new Set(
      snap.docs
        .map((doc) =>
          String(doc.data()?.parentUid || "").trim()
        )
        .filter(Boolean)
    ),
  ];

  for (const parentUid of parentUids) {
    await sendParentSignal({
      parentUid,
      athleteId: input.athleteId,
      athleteName: input.athleteName,
      type: input.type,
      testingDate: input.testingDate,
      nextTier: input.nextTier,
      note: input.note,
      amount: input.amount,
      stripeCount: input.stripeCount,
      source: input.source,
      sourceId: input.sourceId,
    });
  }

  return {
    ok: true,
    sent: parentUids.length,
    parentUids,
  };
}