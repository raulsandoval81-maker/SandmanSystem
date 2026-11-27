import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { athleteExperience, canonicalAthleteHref } from "../../public/assets/js/athlete-journey-routes.js";
import { resolveAuthenticatedSelfAthlete } from "../../public/assets/js/athlete-self-context.js";

const mini = readFileSync("public/athletes/arsenal/mini-arsenal.app.js", "utf8");
const nav = readFileSync("public/assets/js/athlete-nav.js", "utf8");
const dashboard = readFileSync("public/assets/js/athlete-dashboard-data.js", "utf8");

test("Mini Arsenal and drawer use only the authenticated self resolver, not URL or storage for Firestore reads", () => {
  assert.match(mini, /const resolved = await resolveSignedInSelfAthlete\(\)/);
  assert.match(nav, /const resolved = await resolveSignedInSelfAthlete\(\)/);
  assert.doesNotMatch(mini, /getDoc\(athleteRef\)|doc\(\s*db,\s*"athletes"/);
  assert.doesNotMatch(nav, /resolveSignedInAthlete\(reportedId\)/);
  assert.match(dashboard, /export async function resolveSignedInSelfAthlete\(\)/);
  const self = dashboard.match(/export async function resolveSignedInSelfAthlete\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(self);
  assert.doesNotMatch(self, /requestedId:|rememberedId:|params\.get\(/);
});

test("Self resolver reads only exact authenticated UID even under permissive Firestore rules", async () => {
  const uid = "staging-athlete-beginner";
  const reads = [];
  const result = await resolveAuthenticatedSelfAthlete({
    user: { uid },
    getAthleteById: async id => {
      reads.push(id);
      return id === uid ? { journey: "Z2H" } : { authUid: "someone-else", fullName: "FOREIGN" };
    },
    findAthletesByAuthUid: async () => assert.fail("Legacy UID document should not need authUid query"),
  });
  assert.deepEqual(reads, [uid]);
  assert.equal(result.athleteId, uid);
  assert.equal(result.athlete.journey, "Z2H");
});

test("Self resolver finds an owned mixed-case Firestore key without probing arbitrary URL IDs", async () => {
  const uid = "trusted-auth-uid";
  const reads = [];
  const queryKeys = [];
  const result = await resolveAuthenticatedSelfAthlete({
    user: { uid },
    getAthleteById: async id => { reads.push(id); return null; },
    findAthletesByAuthUid: async key => {
      queryKeys.push(key);
      return [{ athleteId: "F8_MixedCase", athlete: { authUid: uid, programTrack: "R2C" } }];
    },
  });
  assert.deepEqual(reads, [uid]);
  assert.deepEqual(queryKeys, [uid]);
  assert.equal(result.athleteId, "F8_MixedCase");
});

test("Self resolver rejects a mismatched authUid even if the database permits the read", async () => {
  const uid = "staging-athlete-beginner";
  const result = await resolveAuthenticatedSelfAthlete({
    user: { uid },
    getAthleteById: async () => ({ authUid: "foreign-user", fullName: "FOREIGN" }),
    findAthletesByAuthUid: async () =>
      [{ athleteId: "foreign-2", athlete: { authUid: "foreign-user", fullName: "FOREIGN 2" } }],
  });
  assert.equal(result.athleteId, "");
  assert.equal(result.athlete, null);
});

test("Self resolver fails closed for multiple own matches and anonymous sessions", async () => {
  const uid = "trusted-auth-uid";
  const make = user => resolveAuthenticatedSelfAthlete({
    user,
    getAthleteById: async () => null,
    findAthletesByAuthUid: async () => [
      { athleteId: "F8_ONE", athlete: { authUid: uid } },
      { athleteId: "F8_TWO", athlete: { authUid: uid } },
    ],
  });
  assert.equal((await make({ uid })).ambiguous, true);
  assert.equal((await make({ uid, isAnonymous: true })).athleteId, "");
  assert.equal((await make(null)).athleteId, "");
});

test("Arsenal journey uses verified data and case-sensitive canonical IDs", () => {
  const uid = "staging-athlete-beginner";
  assert.equal(athleteExperience({ programTrack: "Z2H" }, uid), "mini");
  assert.equal(athleteExperience({ programTrack: "R2C" }, uid), "mini");
  assert.equal(athleteExperience({ programTrack: "P2L" }, uid), "full");
  assert.equal(athleteExperience({}, "F8_MixedCase"), "mini");
  assert.equal(athleteExperience({}, uid), "");
  assert.equal(canonicalAthleteHref("/athletes/arsenal/arsenal.html", uid),
    "/athletes/arsenal/arsenal.html?id=staging-athlete-beginner");
});

test("Mini Arsenal redirects foreign URL only after verifying authenticated owner", () => {
  const resolve = mini.indexOf("const resolved = await resolveSignedInSelfAthlete()");
  const verified = mini.indexOf("athleteId = resolved.athleteId");
  const url = mini.indexOf("const requestedId = String(", resolve);
  const redirect = mini.indexOf("if (requestedId !== athleteId)", resolve);
  const journey = mini.indexOf("const experience = athleteExperience(athlete, athleteId)");
  const display = mini.indexOf("const requestedDiscipline =", resolve);
  assert.ok(resolve >= 0 && verified > resolve && url > verified && redirect > url &&
    journey > redirect && display > journey);
  assert.match(mini, /renderEmpty\("Athlete access unavailable\."\)/);
  assert.match(mini, /renderEmpty\("Unable to determine athlete journey\."\)/);
  assert.doesNotMatch(mini, /if \(!athleteId\.startsWith\("F8_"\)\)/);
});
