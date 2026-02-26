
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "../../infra/admin";
import { requireCoachOrAdminV2 } from "../../infra/authzV2";
process.on("uncaughtException", (e) => {
  console.error("🔥 uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (e) => {
  console.error("🔥 unhandledRejection:", (e as any)?.stack || e);
});

export const approveIntakeCall = onCall(async (req) => {
  console.log("✅ APPROVEINTAKECALL HIT (LOCAL CODE)", new Date().toISOString());
  try {
    console.log("req.auth?", !!req.auth, "keys(data)", Object.keys(req.data || {}));

    requireCoachOrAdminV2(req);
    // ...

    const intakeId = String(
      req.data?.intakeId || req.data?.tokenId || req.data?.token || ""
    ).trim();

    const approvedUid = String(req.data?.approvedUid || "").trim().toUpperCase();
    const note = req.data?.note ? String(req.data.note).slice(0, 240) : null;

    if (!intakeId) throw new HttpsError("invalid-argument", "Missing intakeId");
    if (!approvedUid) throw new HttpsError("invalid-argument", "Missing approvedUid");

    const track =
      approvedUid.startsWith("F8-") ? "F8" :
      approvedUid.startsWith("F4-") ? "F4" : "";
    if (!track) throw new HttpsError("invalid-argument", "approvedUid must start with F8- or F4-");

    const intakeRef = db.collection("intakes").doc(intakeId);

    const snap = await intakeRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Intake not found");

    const intake = snap.data() as any;

    if ((intake?.status === "approved" || intake?.activatedUid) && intake?.approvedUid) {
      return {
        ok: true,
        intakeId: snap.id,
        approvedUid: intake.approvedUid,
        status: intake.status || "approved",
        alreadyApproved: true
      };
    }

    await intakeRef.set(
      {
        status: "approved",
        approvedUid,
        approvedAt: FieldValue.serverTimestamp(),
        used: true,
        approveNote: note,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, intakeId: snap.id, approvedUid, status: "approved" };
  } catch (err: any) {
    console.error("approveIntakeCall CRASH:", err?.stack || err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err?.message || "approveIntakeCall crashed");
  }
});
