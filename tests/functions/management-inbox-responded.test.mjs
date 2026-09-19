import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const outDir = process.env.SANDMAN_FUNCTIONS_OUT_DIR || "functions/lib";
const { assertCanMarkManagementResponded } = require(resolve(outDir,
  "modules/management/markManagementMessageResponded.js"));

const actor = { uid: "manager-a", role: "management", staff: { locationIds: ["lompoc"] } };
const message = { locationId: "lompoc", assignmentStatus: "PENDING_MANAGEMENT", assignedManagerUid: null };

test("Management may mark owned or pending local messages, but not cross-location/stale assignments", () => {
  assert.doesNotThrow(() => assertCanMarkManagementResponded(message, actor));
  assert.doesNotThrow(() => assertCanMarkManagementResponded({ ...message, assignedManagerUid: actor.uid }, actor));
  assert.throws(() => assertCanMarkManagementResponded({ ...message, locationId: "santa-ynez-valley" }, actor));
  assert.throws(() => assertCanMarkManagementResponded({ ...message, assignedManagerUid: "manager-b" }, actor));
  assert.throws(() => assertCanMarkManagementResponded({ ...message, locationId: "" }, actor));
  assert.throws(() => assertCanMarkManagementResponded({ ...message, status: "CLOSED" }, actor));
});

test("Admin is system-wide without fabricated scope; legacy Management scope remains supported", () => {
  assert.doesNotThrow(() => assertCanMarkManagementResponded({ ...message, locationId: "santa-ynez-valley" },
    { uid: "admin-a", role: "admin", staff: {} }));
  assert.doesNotThrow(() => assertCanMarkManagementResponded(message,
    { uid: "manager-a", role: "manager", staff: { locationId: "lompoc" } }));
});

test("Mark Responded is server-owned and writes the existing response state", () => {
  const source = readFileSync("functions/src/modules/management/markManagementMessageResponded.ts", "utf8");
  assert.match(source, /requireActiveStaff\(uid, MANAGEMENT_STAFF_ROLES\)/);
  assert.match(source, /status: "RESPONDED"/);
  assert.match(source, /messageStatus: "RESPONDED"/);
  assert.match(source, /routingStage: "MANAGEMENT_RESPONDED"/);
  assert.match(source, /assignmentStatus: "ASSIGNED"/);
  assert.match(source, /tx\.update\(ref/);
  assert.match(source, /if \(clean\(message\.messageStatus\)\.toUpperCase\(\) === "RESPONDED"\) return/);
});
