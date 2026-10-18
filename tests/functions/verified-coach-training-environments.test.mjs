import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = name => readFileSync(path.join(root, name), "utf8");
const setup = read("public/coaches/execution/session-builder/session-builder.js");
const policy = read("public/coaches/execution/session-builder/session-entry-policy.js");
const server = read("functions/src/practice/practiceSessions.ts");

test("Lead Coach label comes from authenticated active staff rather than untrusted entry text", () => {
  assert.match(setup, /async function showVerifiedLeadCoach\(\)/);
  assert.match(setup, /const coach = await requireCoach\(\)/);
  assert.match(setup, /coachLabel\.dataset\.coachUid = coach\.uid/);
  assert.match(setup, /verifiedCoach\.uid/);
  assert.match(server, /coachUid: existing\.exists \? String\(current\.coachUid \|\| actor\.uid\) : actor\.uid/);
  assert.match(server, /Only the Coach who opened this practice may resume it/);
});

test("configured facility areas use unique canonical room and session identifiers", async () => {
  const url = new URL("file://" + path.join(root, "public/coaches/execution/session-builder/session-entry-policy.js"));
  const { SESSION_ROOMS } = await import(url.href);
  const ids = SESSION_ROOMS.map(r => r.value);
  const scoped = SESSION_ROOMS.map(r => r.locationId + "/" + r.roomId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(scoped).size, scoped.length);
  const santa = SESSION_ROOMS.filter(r => r.locationId === "santa-ynez-valley");
  for(const name of ["Mat Room · Mat 1"]) {
    assert.ok(santa.some(room => room.label === name), name);
  }
  assert.equal(SESSION_ROOMS.find(room => room.value === "solvang-mat-1")?.roomId, "mat-1");
  assert.ok(SESSION_ROOMS.every(room => room.environment === "mat-room"), "Combat Session Builder must exclude Weight Room and Classroom");
  assert.equal(santa.length, 1, "Only the actually configured launch mat may be selected");
  assert.match(setup, /SESSION_ROOMS\.filter\(room => !entryLocationId \|\| room\.locationId === entryLocationId\)/);
});
