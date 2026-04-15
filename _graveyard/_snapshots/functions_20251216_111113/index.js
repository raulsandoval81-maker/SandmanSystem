// functions/index.js
// Node 20 + Firebase Functions v4
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Simple health check. Works with GET/POST and handles CORS safely.
exports.ping = onRequest({ cors: true }, (req, res) => {
  // If you want to be explicit about CORS headers:
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // Preflight
    return res.status(204).send("");
  }

  logger.info("Ping hit", {
    method: req.method,
    query: req.query,
    hasBody: !!req.body,
  });

  return res.status(200).json({
    ok: true,
    env: process.env.FUNCTIONS_EMULATOR ? "emulator" : "prod",
    method: req.method,
    ts: Date.now(),
  });
});
