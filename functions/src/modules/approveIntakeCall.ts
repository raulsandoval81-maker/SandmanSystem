import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

export const approveIntakeCall = onCall(async (req) => {
  if (!req.auth) {
    throw new Error("unauthenticated");
  }

  const { intakeId, approvedUid, note } = req.data;
  if (!intakeId || !approvedUid) {
    throw new Error("missing fields");
  }

  const db = getFirestore();

  await db.collection("intakes").doc(intakeId).update({
    status: "approved",
    approvedUid,
    approvedAt: new Date(),
    note: note || null,
  });

  return { ok: true };
});
