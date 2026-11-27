import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { resolveAuthenticatedSelfAthlete } from "../../public/assets/js/athlete-self-context.js";
import { athleteArsenalPage } from "../../public/assets/js/athlete-journey-routes.js";

const source = readFileSync("public/athletes/arsenal/arsenal.app.js", "utf8");

test("Full Arsenal never reads a URL or storage ID directly from Firestore", () => {
  assert.match(source, /const resolved = await resolveSignedInSelfAthlete\(\)/);
  assert.match(source, /const athleteId = resolved\.athleteId;/);
  assert.match(source, /const athlete = resolved\.athlete;/);
  assert.doesNotMatch(source, /doc\(db,\s*"athletes",\s*athleteId\)/);
  assert.doesNotMatch(source, /ensureSignedIn\(\)/);
  assert.match(source, /requestedId !== athleteId/);
  const requested = source.indexOf("const requestedId = String(");
  const verified = source.indexOf("const resolved = await resolveSignedInSelfAthlete()");
  const route = source.indexOf("const page = athleteArsenalPage(athlete, athleteId)");
  const discipline = source.indexOf("const urlDiscipline =", route);
  assert.ok(requested >= 0 && verified > requested && route > verified && discipline > route);
});

test("Full Arsenal trusted UID resolution preserves exact-case legacy document keys", async () => {
  const uid = "staging-athlete-beginner";
  const reads = [];
  const result = await resolveAuthenticatedSelfAthlete({
    user: { uid },
    getAthleteById: async id => {
      reads.push(id);
      return { authUid: null, programTrack: "Path2Legend" };
    },
    findAthletesByAuthUid: async () => assert.fail("Legacy UID should not query"),
  });
  assert.deepEqual(reads, [uid]);
  assert.equal(result.athleteId, uid);
});

test("Full Arsenal rejects foreign record despite permissive mocked Firestore read", async () => {
  const result = await resolveAuthenticatedSelfAthlete({
    user: { uid: "signed-in-athlete" },
    getAthleteById: async () => ({ authUid: "foreign-athlete", privateValue: "not-yours" }),
    findAthletesByAuthUid: async () => [
      { athleteId: "FOREIGN", athlete: { authUid: "foreign-athlete" } },
    ],
  });
  assert.equal(result.athleteId, "");
  assert.equal(result.athlete, null);
});

test("Full Arsenal handles mixed-case authUid-linked document and rejects ambiguous matches", async () => {
  const user = { uid: "trusted-owner" };
  const getAthleteById = async () => null;
  const found = await resolveAuthenticatedSelfAthlete({
    user, getAthleteById,
    findAthletesByAuthUid: async () => [
      { athleteId: "F4_MixedCase", athlete: { authUid: user.uid, journey: "P2L" } },
    ],
  });
  assert.equal(found.athleteId, "F4_MixedCase");
  const ambiguous = await resolveAuthenticatedSelfAthlete({
    user, getAthleteById,
    findAthletesByAuthUid: async () => [
      { athleteId: "first", athlete: { authUid: user.uid } },
      { athleteId: "second", athlete: { authUid: user.uid } },
    ],
  });
  assert.equal(ambiguous.athleteId, "");
  assert.equal(ambiguous.ambiguous, true);
});

test("Verified Road2Champion routes to Mini and Path2Legend to Full", () => {
  assert.equal(
    athleteArsenalPage({ programTrack: "Road2Champion" }, "F8_MixedCase"),
    "/athletes/arsenal/mini-arsenal.html");
  assert.equal(
    athleteArsenalPage({ programTrack: "Path2Legend" }, "F4_MixedCase"),
    "/athletes/arsenal/arsenal.html");
  assert.equal(athleteArsenalPage({}, "unknown"), "");
  assert.match(source, /page !== "\/athletes\/arsenal\/arsenal\.html"/);
  assert.match(source, /page === "\/athletes\/arsenal\/mini-arsenal\.html"/);
});

test("Legacy F8 and F4 prefix classifications remain case-insensitive", () => {
  const match = source.match(/function getTrackCode\([\s\S]*?\n}\n\nfunction isRoad2Champion/);
  assert.ok(match);
  const getTrackCode = runInNewContext(
    match[0].replace(/\nfunction isRoad2Champion$/, "") + "\ngetTrackCode");
  assert.equal(getTrackCode("f8_MixedCase", {}, {}), "F8");
  assert.equal(getTrackCode("f4_MixedCase", {}, {}), "F4");
});
