import test from "node:test";
import assert from "node:assert/strict";
import {
  day1SnapshotView,
  resolveOnboardingTemplate,
} from "../../public/athlete-onboarding/onboarding-templates.js";

test("parent guardian plus Road2Champion resolves youth family content", () => {
  const result = resolveOnboardingTemplate({ registrantRole: "parent_guardian", programTrack: "road2champion" });
  assert.equal(result.templateKey, "road2champion-family");
  assert.equal(result.template.answerMode, "yes_no");
  assert.equal(result.template.traits.smart.question, "Do you make good choices?");
  assert.equal(result.template.identity.kind, "hero");
});

test("parent guardian plus Path2Legend resolves mature family content", () => {
  const result = resolveOnboardingTemplate({ registrantRole: "parent_guardian", programTrack: "path2legend" });
  assert.equal(result.templateKey, "path2legend-family");
  assert.equal(result.template.answerMode, "numeric");
  assert.equal(result.template.identity.kind, "legend");
});

test("adult athlete can remain Path2Legend", () => {
  const result = resolveOnboardingTemplate({ registrantRole: "adult_athlete", programTrack: "path2legend" });
  assert.equal(result.templateKey, "path2legend-independent");
  assert.equal(result.journey, "path2legend");
});

test("adult athlete plus Quest2Mastery resolves mastery content", () => {
  const result = resolveOnboardingTemplate({ intakeAudience: "adult_athlete", placement: { programTrack: "quest2mastery" } });
  assert.equal(result.templateKey, "quest2mastery-independent");
  assert.equal(result.template.identity.question, "What are you trying to master?");
});

test("legacy zero2hero resolves Road2Champion presentation", () => {
  const result = resolveOnboardingTemplate({ intakeAudience: "parent_guardian", programTrack: "zero2hero" });
  assert.equal(result.journey, "road2champion");
  assert.equal(result.templateKey, "road2champion-family");
});

test("partway onboarding data remains available without mutation", () => {
  const athlete = { registrantRole: "parent_guardian", programTrack: "zero2hero", onboarding: { step: 5, selfAssess: { honor: true, strong: false } } };
  const view = day1SnapshotView(athlete);
  assert.deepEqual(view.selfAssess, { honor: true, strong: false });
  assert.equal(athlete.onboarding.step, 5);
});

test("completed athlete prefers preserved Day 1 snapshot", () => {
  const athlete = {
    onboarding: {
      selfAssess: { honor: 9 },
      day1Snapshot: { version: "v1", selfAssess: { honor: 4 }, identity: { futureLegend: "Coach" } },
    },
  };
  const view = day1SnapshotView(athlete);
  assert.equal(view.selfAssess.honor, 4);
  assert.equal(view.identity.futureLegend, "Coach");
});

test("missing journey fails safely without inventing placement", () => {
  const result = resolveOnboardingTemplate({ registrantRole: "adult_athlete" });
  assert.equal(result.journey, "unknown");
  assert.equal(result.templateKey, "safe-fallback");
});
