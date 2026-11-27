const { createRequire } = require("node:module");
const functionsRequire = createRequire(require.resolve("../../../functions/package.json"));
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { vault, paths } = require("./inventory.cjs");

const projectId = "demo-sandman-vault";
const endpoint = "/coach/vault";
const allowlist = new Set(paths);

async function startVaultBoundary() {
  for (const name of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"]) {
    if (!/^127\.0\.0\.1:[0-9]+$/.test(process.env[name] ?? "")) {
      throw new Error(name + " must target a loopback emulator.");
    }
  }
  const { initializeApp } = functionsRequire("firebase-admin/app");
  const { getAuth } = functionsRequire("firebase-admin/auth");
  const { COACH_STAFF_ROLES, requireActiveStaff } = require("../../../functions/lib/services/staffAuthorization.js");
  const app = initializeApp({ projectId });
  const auth = getAuth(app);
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const respond = (status, value) => {
      res.statusCode = status;
      res.end(JSON.stringify(value));
    };
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== endpoint) return respond(404, { error: "not-found" });
    if (req.method !== "GET") return respond(405, { error: "read-only" });
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) return respond(401, { error: "sign-in-required" });
    let identity;
    try {
      identity = await auth.verifyIdToken(token, true);
    } catch {
      return respond(401, { error: "sign-in-required" });
    }
    if (identity.firebase?.sign_in_provider === "anonymous") {
      return respond(401, { error: "sign-in-required" });
    }
    try {
      await requireActiveStaff(identity.uid, COACH_STAFF_ROLES);
    } catch (error) {
      if (error.code === "permission-denied") return respond(403, { error: "coach-required" });
      return respond(500, { error: "authorization-unavailable" });
    }
    const source = url.searchParams.get("source");
    if (source === null) return respond(200, paths);
    if (!allowlist.has(source)) return respond(404, { error: "not-found" });
    try {
      const raw = await readFile(join(vault, source), "utf8");
      return respond(200, raw.trim() ? JSON.parse(raw) : null);
    } catch {
      return respond(500, { error: "source-unavailable" });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, app, url: `http://127.0.0.1:${server.address().port}` };
}
module.exports = { projectId, startVaultBoundary };
