// functions/src/modules/arena/logArenaHttp.ts
import { onRequest } from "firebase-functions/v2/https";
import { handleLogArena } from "./logArenaCore";

export const logArenaHttp = onRequest(async (req, res) => {
  // CORS like your other function
  res.set("Access-Control-Allow-Origin", "http://localhost:5000");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "POST only" });
    return;
  }

  try {
    const body = req.body && (req.body as any).data ? (req.body as any).data : req.body || {};
    const result = await handleLogArena(body, { authUid: "http-local" });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[logArenaHttp] crash:", err);
    res.status(500).json({ ok: false, error: err?.message || "server error" });
  }
});
