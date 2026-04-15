// functions/src/modules/admin/revertXp.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";
import { admin, db } from "../../infra/admin";
import { requireCoachOrAdminV2 } from "../../infra/authzV2";

/**
 * Admin/Coach rollback: given an xpLog ID, apply the inverse XP to the athlete
 * and write an immutable reversal log linked to the original.
 *
 * Input: { logId: string, note?: string }
 * Returns: { ok:true, athleteUid, inverse, newXp }
 */
export const revertXpLog = onCall(async (req) => {
  // 🔒 Auth gate (v2)
  requireCoachOrAdminV2(req);

  try {
    const logId: string | undefined = req.data?.logId;
    const note: string | undefined = req.data?.note || null;

    if (!logId) {
      throw new HttpsError("invalid-argument", "logId is required.");
    }

    // Load the original log
    const logRef = db.collection("xpLogs").doc(logId);
    const logSnap = await logRef.get();
    if (!logSnap.exists) {
      throw new HttpsError("not-found", "XP log not found.");
    }

    const log = logSnap.data() as any;
    const athleteUid: string = String(log.athleteUid || "");

    // Prevent double-reverts
    const priorRevert = await db
      .collection("xpLogs")
      .where("parentLogId", "==", logId)
      .limit(1)
      .get();

    if (!priorRevert.empty) {
      throw new HttpsError("failed-precondition", "This log was already reverted.");
    }

    const delta: number = Number(log.delta || 0);
    if (!delta) {
      throw new HttpsError("failed-precondition", "Original log has no delta.");
    }

    const inverse = -delta;
    const now = admin.firestore.FieldValue.serverTimestamp();

    const athleteRef = db.collection("athletes").doc(athleteUid);
    let newXp = 0;

    await db.runTransaction(async (tx) => {
      const aSnap = await tx.get(athleteRef);
      const curr = (aSnap.exists ? (aSnap.data()?.xp || 0) : 0) as number;
      newXp = curr + inverse;

      tx.set(
        athleteRef,
        { xp: admin.firestore.FieldValue.increment(inverse), updatedAt: now },
        { merge: true }
      );

      const revRef = db.collection("xpLogs").doc();
      tx.set(revRef, {
        id: revRef.id,
        parentLogId: logId,
        athleteUid,
        kind: "ADMIN_REVERT",
        bucket: "ADMIN",
        delta: inverse,
        note: note || `Revert of ${logId}`,
        by: req.auth?.uid || "system",
        yyyymm: log.yyyymm || null,
        ts: now,
      });
    });

    return { ok: true, athleteUid, inverse, newXp };
  } catch (err: any) {
    logger.error("[revertXpLog] crash:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err?.message || "revert failed");
  }
});
