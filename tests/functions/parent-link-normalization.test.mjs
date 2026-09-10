import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParentLinkNormalizationPlan,
  canonicalParentLinkId,
  logicalRelationshipCount,
  postCanonicalDuplicateCandidates,
} from "../../scripts/parent-links/parent-link-normalization-core.mjs";

const qfx = "QFX9rqSQkmQODbTSQRqSoddfW1E2";
const fah = "faHSwYkdOtgTH2n2Qrp4COXYdjk1";

test("malformed confirmed canonical relationship receives only its missing parentUid", () => {
  const plan = buildParentLinkNormalizationPlan({
    links: [{ id: canonicalParentLinkId(qfx, "F4_0001"), athleteUid: "F4_0001", status: "active" }],
    existingAthleteIds: ["F4_0001"],
  });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.normalize[0].patch, { parentUid: qfx });
});

test("duplicate storage remains one logical access relationship", () => {
  const links = [
    { parentUid: qfx, athleteUid: "F4_0001" },
    { parentUid: qfx, athleteUid: "F4_0001" },
    { parentUid: "other-parent", athleteUid: "F4_0001" },
  ];
  assert.equal(logicalRelationshipCount(links), 2);
});

test("only active missing-athlete candidates enter the deactivation plan", () => {
  const canonical = { id: canonicalParentLinkId(qfx, "F4_0001"), parentUid: qfx, athleteUid: "F4_0001", status: "active" };
  const plan = buildParentLinkNormalizationPlan({
    links: [canonical,
      { id: "artifact-active", parentUid: fah, athleteUid: "F4_0054", status: "active" },
      { id: "artifact-inactive", parentUid: fah, athleteUid: "F4_0055", status: "inactive" },
    ],
    existingAthleteIds: ["F4_0001"],
  });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.deactivate.map((item) => item.id), ["artifact-active"]);
});

test("deactivation fails closed when a candidate athlete now exists", () => {
  const plan = buildParentLinkNormalizationPlan({
    links: [
      { id: canonicalParentLinkId(qfx, "F4_0001"), parentUid: qfx, athleteUid: "F4_0001", status: "active" },
      { id: "artifact-active", parentUid: fah, athleteUid: "F4_0054", status: "active" },
    ],
    existingAthleteIds: ["F4_0001", "F4_0054"],
  });
  assert.match(plan.errors[0].code, /ATHLETE_NOW_EXISTS/);
  assert.equal(plan.deactivate.length, 0);
});

test("duplicate copies are advisory only after an active canonical record exists", () => {
  const canonicalId = canonicalParentLinkId(qfx, "F4_0001");
  const candidates = postCanonicalDuplicateCandidates([
    { id: canonicalId, athleteUid: "F4_0001", status: "active" },
    { id: "lowercase-copy", parentUid: qfx, athleteUid: "F4_0001", status: "active" },
    { id: "inactive-copy", parentUid: qfx, athleteUid: "F4_0001", status: "inactive" },
  ]);
  assert.deepEqual(candidates.map((item) => item.id), ["lowercase-copy"]);
});
