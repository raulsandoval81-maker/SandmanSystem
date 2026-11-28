import assert from "node:assert/strict";
import test from "node:test";
import { proposeSpartanStrengthXp } from "../../public/assets/js/spartan-xp-proposal.js";

const verified = (overrides = {}) => ({
  track: "f4", level: 1, sessionN: 1, durationMinutes: 20,
  coachVerified: true, completionStatus: "approved", ...overrides,
});

test("approved Spartan evidence proposes Strength XP, never Combat XP", () => {
  const result = proposeSpartanStrengthXp(verified());
  assert.equal(result.xpLane, "strength");
  assert.equal(result.xpKind, "STRENGTH");
  assert.equal(result.proposalXp, 5);
  assert.equal(result.sourceIdentity, "spartan:f4:level1:session1");
  assert.equal(Object.isFrozen(result), true);
});

test("only exactly 45 minutes proposes full 10 XP for F4", () => {
  assert.equal(proposeSpartanStrengthXp(verified({durationMinutes: 45})).proposalXp, 10);
  assert.equal(proposeSpartanStrengthXp(verified({durationMinutes: 29})).proposalXp, 5);
  for (const durationMinutes of [30, 35, 44, 46, 60]) {
    assert.equal(proposeSpartanStrengthXp(verified({durationMinutes})), null);
  }
});

test("F8 preserves +5 ceiling, Coach review and 30-minute maximum", () => {
  assert.equal(proposeSpartanStrengthXp(verified({track: "f8", durationMinutes: 30})).proposalXp, 5);
  for (const durationMinutes of [31, 45]) {
    assert.equal(proposeSpartanStrengthXp(verified({track: "f8", durationMinutes})), null);
  }
});

test("no proposal without a verified approved session or with unapproved level", () => {
  for (const changes of [
    {coachVerified: false}, {completionStatus: "submitted"},
    {completionStatus: "pending"}, {level: 4}, {level: 0},
    {sessionN: 0}, {durationMinutes: 0}, {durationMinutes: 29.5},
    {track: "unknown"}, {track: "iron"}, {track: "f8", coachVerified: false},
  ]) assert.equal(proposeSpartanStrengthXp(verified(changes)), null);
});

test("Spartan session identities remain separate from historical Conditioning keys", () => {
  const a = proposeSpartanStrengthXp(verified({level: 1, sessionN: 2}));
  const b = proposeSpartanStrengthXp(verified({level: 2, sessionN: 2}));
  assert.notEqual(a.sourceIdentity, b.sourceIdentity);
  assert.equal(a.sourceIdentity.startsWith("spartan:"), true);
  assert.equal(a.sourceIdentity.includes("conditioning_"), false);
});
