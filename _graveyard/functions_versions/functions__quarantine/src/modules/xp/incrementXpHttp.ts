import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/logger";
import { handleIncrementXp, type IncrementXpReq } from "./incrementXpCore";

export const incrementXpHttp = onRequest(
  {
    // This alone should handle preflight + set Access-Control-Allow-Origin
    cors: true,
  },
  async (req, res) => {
    // v2 cors:true handles OPTIONS, but harmless to keep a guard:
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method Not Allowed" });
      return;
    }

    try {
      // Body should already be parsed if you POST JSON with Content-Type: application/json
      const data = (req.body ?? {}) as IncrementXpReq;

      const result = await handleIncrementXp(data, { authUid: null });

      res.status(200).json(result);
    } catch (err: any) {
      logger.error("incrementXpHttp failed", err);
      res.status(400).json({ ok: false, error: err?.message || "xp error" });
    }
  }
);
