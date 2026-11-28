import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend=readFileSync("functions/src/modules/athlete/athleteAvatar.ts","utf8");
const policy=readFileSync("functions/src/modules/athlete/athleteAvatarPolicy.ts","utf8");
const nav=readFileSync("public/assets/js/athlete-nav.js","utf8");
const page=readFileSync("public/athletes/avatar/avatar.js","utf8");
const storage=readFileSync("storage.rules","utf8");

test("athlete creation derives identity only from authenticated ownership",()=>{
  assert.match(backend,/resolveSelfAthlete\(uid\)/);
  assert.doesNotMatch(backend,/req\.data\?\.(athleteId|uid)/);
  assert.match(backend,/where\("authUid", "==", uid\)\.limit\(2\)/);
  assert.match(backend,/matches\.size !== 1/);
});

test("youth approval is guardian-enforced and originals are deleted after approval",()=>{
  assert.match(backend,/guardianRequired === true \? !guardian : !self/);
  assert.match(backend,/parentAthleteLinks/);
  assert.match(backend,/status: guardianRequired \? "guardian_pending" : "preview_ready"/);
  assert.match(backend,/file\(String\(context\.request\.sourcePath\)\)\.delete/);
  assert.match(backend,/originalDeletedAt/);
});

test("approved avatar uses separate authoritative rank shirt layer",()=>{
  assert.match(policy,/SHIRT_BY_RANK/);assert.match(policy,/GRAPPLING_PROGRAMS/);
  assert.match(page,/--avatar-shirt/);assert.match(page,/shirtColor/);
  assert.doesNotMatch(backend,/tx\.update\([^)]*shirtColor/);
});

test("private backend-only media paths have no public Storage rule",()=>{
  assert.match(storage,/athlete-avatars/);assert.doesNotMatch(storage,/allow read, write: if true/);
  assert.match(storage,/allow read, write: if false/);
  assert.doesNotMatch(backend,/getSignedUrl|makePublic|downloadTokens/);
});

test("verified Settings navigation exposes Living Avatar without weakening Sprint 1",()=>{
  assert.match(nav,/data-athlete-avatar-link hidden/);assert.match(nav,/resolveSignedInSelfAthlete\(\)/);
  assert.match(nav,/avatarLink\.hidden=false/);assert.match(page,/resolveSignedInSelfAthlete\(\)/);
});
