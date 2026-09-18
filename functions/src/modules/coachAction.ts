import { onRequest } from "firebase-functions/v2/https";

export const coachAction = onRequest((_req, res) => {
  res.status(410).json({
    ok: false,
    error: "Legacy Coach action endpoint disabled. Use the authorized testing callables.",
  });
});
