// functions/src/modules/admin/revertXp.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requireCoachOrAdmin } from "../../infra/authz";

const db = admin.firestore();

/**
 * Admin/Coach rollback: given an xpLog ID, apply the inverse XP to the athlete
 * and write an immutable reversal log linked to the original.
 *
 * Input: { logId: string, note?: string }
 * Returns: { ok:true, athleteUid, inverse, newXp }
 */
export const revertXpLog = functions.https.onCall(async (data, context) => {
  requireCoachOrAdmin(context);

  const logId: string | undefined = data?.logId;
  const note: string | undefined = data?.note || null;
  if (!logId) {
    throw new functions.https.HttpsError("invalid-argument", "logId is required.");
  }

  // Load the original log
  const logRef = db.collection("xpLogs").doc(logId);
  const logSnap = await logRef.get();
  if (!logSnap.exists) {
    throw new functions.https.HttpsError("not-found", "XP log not found.");
  }
  const log = logSnap.data() as any;
  const athleteUid: string = log.athleteUid;

  // Prevent double-reverts of the same log by checking if a child reversal exists
  const priorRevert = await db.collection("xpLogs")
    .where("parentLogId", "==", logId)
    .limit(1).get();
  if (!priorRevert.empty) {
    throw new functions.https.HttpsError("failed-precondition", "This log was already reverted.");
  }

  const delta: number = Number(log.delta || 0);
  if (!delta) {
    throw new functions.https.HttpsError("failed-precondition", "Original log has no delta.");
  }

  const inverse = -delta;
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Apply inverse XP + write reversal log atomically
  const athleteRef = db.collection("athletes").doc(athleteUid);
  let newXp = 0;

  await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(athleteRef);
    const curr = (aSnap.exists ? (aSnap.data()?.xp || 0) : 0) as number;
    newXp = curr + inverse;

    tx.set(athleteRef, { xp: admin.firestore.FieldValue.increment(inverse), updatedAt: now }, { merge: true });

    const revRef = db.collection("xpLogs").doc();
    tx.set(revRef, {
      id: revRef.id,
      parentLogId: logId,
      athleteUid,
      kind: "ADMIN_REVERT",
      bucket: "ADMIN",
      delta: inverse,
      note: note || `Revert of ${logId}`,
      by: context.auth?.uid || "system",
      yyyymm: log.yyyymm || null,
      ts: now,
    });
  });

  return { ok: true, athleteUid, inverse, newXp };
});
