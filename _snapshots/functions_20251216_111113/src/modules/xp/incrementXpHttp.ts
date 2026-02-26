// ------------------------------------------------------------
// incrementXpHttp.ts  —  XP Increment via HTTP (for web tester)
// ------------------------------------------------------------

import { onRequest } from "firebase-functions/v2/https";
import { handleIncrementXp } from "./incrementXpCore";

export const incrementXpHttp = onRequest(async (req, res) => {
  // --- CORS headers ---
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

  try {
    const body = req.body && req.body.data ? req.body.data : req.body || {};
    const result = await handleIncrementXp(body, { authUid: "http-local" });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("incrementXpHttp error:", err);
    res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});
