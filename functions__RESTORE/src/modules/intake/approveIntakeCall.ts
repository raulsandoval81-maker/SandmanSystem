// functions/src/modules/intake/approveIntakeCall.ts
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

type ApproveReq = {
  intakeId: string;
  mint: { uid: string }; // e.g. "F8-00001" or "F4-00001"
  publicName: { initial: string; last: string };
  team?: { name?: string; city?: string; state?: string };
  exceptions?: {
    fastTrack?: { years: number; proof: boolean; letter?: string | null } | null;
    dual?: { parentAck: boolean; note?: string | null } | null;
  };
};

function isCoachOrAdmin(token?: any) {
  return !!(token?.coach === true || token?.admin === true);
}
function yyyymm(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}
function randPadlock() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
}

export const approveIntakeCall = functions.https.onCall(async (data: ApproveReq, ctx) => {
  if (!ctx.auth || !isCoachOrAdmin(ctx.auth.token)) {
    throw new functions.https.HttpsError("permission-denied", "Not allowed");
  }
  const { intakeId, mint, publicName, team, exceptions } = data || {};
  if (!intakeId || !mint?.uid || !publicName?.initial || !publicName?.last) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required fields");
  }

  const db = admin.firestore();
  const intakeRef = db.collection("intakes").doc(intakeId);
  const snap = await intakeRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError("not-found", "Intake not found");
  }
  const intake = snap.data() || {};
  if (intake.status && intake.status !== "submitted") {
    throw new functions.https.HttpsError("failed-precondition", "Intake not in submitted state");
  }

  const uid = mint.uid.toUpperCase();
  const track = uid.startsWith("F8") ? "F8" : uid.startsWith("F4") ? "F4" : "F8";
  const tier = "T0";
  const padlock = randPadlock();

  const athlete = {
    uid,
    track,
    tier,
    xp: 0,
    publicInitial: publicName.initial,
    publicLast: publicName.last,
    team: team?.name || "Sandman Combat",
    city: team?.city || "",
    state: team?.state || "",
    status:
      exceptions?.fastTrack || exceptions?.dual ? "pending_exception_review" : "active",
    exception: [
      exceptions?.fastTrack ? "fasttrack" : null,
      exceptions?.dual ? "dual" : null,
    ]
      .filter(Boolean)
      .join(" "),
    padlock,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("athletes").doc(uid).set(athlete, { merge: true });

  await intakeRef.set(
    {
      status: "approved",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      uid,
      publicInitial: publicName.initial,
      publicLast: publicName.last,
    },
    { merge: true }
  );

  // forensic admin log
  const bucketKey = yyyymm();
  await db
    .collection("adminLogs")
    .doc("intake")
    .collection(bucketKey)
    .add({
      action: "approve",
      actorUid: ctx.auth.uid,
      intakeId,
      athleteUid: uid,
      outcome: athlete.status,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { ok: true, athlete };
});
