import { onRequest } from "firebase-functions/v2/https";
import { admin } from "../admin";

export const testXpWrite = onRequest(async (req, res) => {
  try {
    const db = admin.firestore();

    const ref = db.collection("_debug").doc("testXpWrite");
    const payload = {
      ok: true,
      ts: Date.now(),
      iso: new Date().toISOString(),
      note: "hello from testXpWrite",
    };

    await ref.set(payload, { merge: true });

    res.status(200).json({ wrote: true, path: ref.path, payload });
  } catch (e: any) {
    console.error("testXpWrite ERROR:", e?.stack || e);
    res.status(500).json({ wrote: false, error: String(e?.message || e) });
  }
});
