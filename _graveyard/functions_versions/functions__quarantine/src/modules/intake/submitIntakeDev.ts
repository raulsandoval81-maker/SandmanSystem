import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { IS_EMULATOR } from "../../env";

export const submitIntakeDev = onRequest(async (req, res): Promise<void> => {
  // CORS for browser
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (!IS_EMULATOR) {
    res.status(403).json({ ok: false, error: "disabled_outside_emulator" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const { intakeId, form } = (req.body || {}) as { intakeId?: string; form?: any };
    if (!intakeId || typeof intakeId !== "string") {
      res.status(400).json({ ok: false, error: "missing_intakeId" });
      return;
    }

    const db = getFirestore();
    const ref = db.collection("intakes").doc(intakeId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ ok: false, error: "intake_not_found" });
      return;
    }

    await ref.set(
      {
        status: "submitted",
        submittedAt: FieldValue.serverTimestamp(),
        ...(form ? { form } : {}),
      },
      { merge: true }
    );

    res.json({ ok: true, intakeId });
  } catch (e: any) {
    console.error("[submitIntakeDev] error", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
