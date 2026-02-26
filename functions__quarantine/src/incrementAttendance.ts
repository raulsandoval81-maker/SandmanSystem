// functions/src/incrementAttendance.ts
import { onRequest } from "firebase-functions/v2/https";
import { db } from "./infra/admin";

export const incrementAttendanceHttp = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  const raw = req.body && req.body.data ? req.body.data : (req.body || {});
  const uid = (raw.uid || raw.athleteId || raw.id || "").toString().trim();

  if (!uid) {
    res.status(200).json({
      ok: false,
      error: "uid (or athleteId) required",
      got: raw,
    });
    return;
  }

  try {
    const now = new Date();
    const athRef = db.collection("athletes").doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(athRef);
      const prev = snap.exists ? Number(snap.data()?.xp || 0) : 0;
      tx.set(
        athRef,
        { xp: prev + 10, updatedAt: now },
        { merge: true }
      );
    });

    await db.collection("xpLogs").add({
      athleteUid: uid,
      event: "attendance",
      delta: 10,
      source: "incrementAttendanceHttp",
      createdAt: now,
    });

    res.status(200).json({ ok: true, uid, delta: 10, event: "attendance" });
  } catch (err: any) {
    console.error("[incrementAttendanceHttp] crash:", err);
    res.status(200).json({ ok: false, error: err?.message || "server error" });
  }
});

// Non-http helper (fine to keep for internal calls/tests)
export const incrementAttendance = async (data: { uid: string }) => {
  const uid = (data?.uid || "").trim();
  if (!uid) throw new Error("uid required");

  const now = new Date();
  const athRef = db.collection("athletes").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(athRef);
    const prev = snap.exists ? Number(snap.data()?.xp || 0) : 0;
    tx.set(
      athRef,
      { xp: prev + 10, updatedAt: now },
      { merge: true }
    );
  });

  await db.collection("xpLogs").add({
    athleteUid: uid,
    event: "attendance",
    delta: 10,
    source: "incrementAttendanceCallable",
    createdAt: now,
  });

  return { ok: true, uid, delta: 10, event: "attendance" };
};
