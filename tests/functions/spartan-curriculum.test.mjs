import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveSpartanEntry, resolveSpartanCurriculum, normalizeSpartanSession,
  SPARTAN_AVAILABLE_LEVELS, SPARTAN_LEVEL_COUNT,
} from "../../public/assets/js/spartan-curriculum.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = source => JSON.parse(fs.readFileSync(
  path.join(root, "public", source.sourcePath.replace(/^\//, "")), "utf8"
));

test("Spartan starts at level 1 for both training audiences independently of Journey progress", () => {
  assert.equal(SPARTAN_LEVEL_COUNT, 6);
  assert.deepEqual(SPARTAN_AVAILABLE_LEVELS, [1, 2, 3]);
  assert.deepEqual(resolveSpartanEntry("f8"), {
    program: "spartan", level: 1, track: "f8", audience: "youth",
    available: true, sourcePath: "/vault/conditioning/f8/segment1/sessions.json"
  });
  assert.deepEqual(resolveSpartanEntry("f4"), {
    program: "spartan", level: 1, track: "f4", audience: "teen-adult",
    available: true, sourcePath: "/vault/conditioning/f4/segment1/sessions.json"
  });
  assert.equal(resolveSpartanEntry("unknown"), null);
});

test("Spartan 4–6 are unimplemented and never fall through to lower-level content", () => {
  for (const track of ["f4", "f8"]) {
    for (const level of [4, 5, 6]) {
      const item = resolveSpartanCurriculum({ track, level });
      assert.equal(item.available, false);
      assert.equal(item.sourcePath, null);
    }
  }
  assert.equal(resolveSpartanCurriculum({ track: "f4", level: 7 }), null);
  assert.equal(resolveSpartanCurriculum({ track: "f8", level: "2" }), null);
});

test("existing youth and teen/adult routines retain distinct movements, work/rest and rounds", () => {
  const youth = resolveSpartanEntry("f8"), adult = resolveSpartanEntry("f4");
  const originalYouth = read(youth).sessions[0], originalAdult = read(adult).sessions[0];
  const y = normalizeSpartanSession(originalYouth, youth);
  const a = normalizeSpartanSession(originalAdult, adult);
  assert.ok(y && a);
  assert.notDeepEqual(y.sequence, a.sequence);
  assert.deepEqual(y.interval, { workSec: originalYouth.interval.work, restSec: originalYouth.interval.rest });
  assert.deepEqual(a.interval, { workSec: originalAdult.interval.workSec, restSec: originalAdult.interval.restSec });
  assert.equal(y.rounds, originalYouth.rounds);
  assert.equal(a.rounds, originalAdult.rounds);
  assert.deepEqual(y.sequence, originalYouth.sequence);
  assert.deepEqual(a.sequence, originalAdult.sequence);
  assert.equal(normalizeSpartanSession(originalYouth, { track: "f8", level: 4 }), null);
});

test("normalization rejects malformed or missing timers rather than guessing", () => {
  const source = { n: 1, rounds: 3, sequence: ["Squat"], interval: { work: 30, rest: 30 } };
  assert.deepEqual(normalizeSpartanSession(source, { track: "f8" }).interval, { workSec: 30, restSec: 30 });
  assert.equal(normalizeSpartanSession({ ...source, interval: { work: -1, rest: 30 } }, { track: "f8" }), null);
  assert.equal(normalizeSpartanSession({ ...source, sequence: [] }, { track: "f8" }), null);
  assert.equal(normalizeSpartanSession(source, { track: "f4", level: 6 }), null);
});

test("all approved Level 1–3 sessions retain order, movements, rounds and stored timing", () => {
  for (const track of ["f8", "f4"]) {
    for (const level of SPARTAN_AVAILABLE_LEVELS) {
      const source = resolveSpartanCurriculum({ track, level });
      const sessions = read(source).sessions;
      assert.equal(sessions.length, 40);
      for (const session of sessions) {
        const result = normalizeSpartanSession(session, source);
        assert.ok(result, `${track} Level ${level}, session ${session.n}`);
        const timing = typeof session.interval === "string"
          ? session.interval.split("/").map(Number)
          : [session.interval.workSec ?? session.interval.work,
             session.interval.restSec ?? session.interval.rest];
        assert.deepEqual(result.interval, { workSec: timing[0], restSec: timing[1] });
        assert.equal(result.sessionN, session.n);
        assert.equal(result.rounds, session.rounds);
        assert.deepEqual(result.sequence, session.sequence);
      }
    }
  }
});

test("legacy interval strings reject missing or invalid values", () => {
  const source = { n: 81, rounds: 4, sequence: ["Fast Feet"] };
  for (const interval of ["40", "40/", "40/20/10", "0/20", "40/-1", "601/20"]) {
    assert.equal(normalizeSpartanSession({ ...source, interval }, { track: "f8", level: 3 }), null);
  }
});
