import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  HONOR_CATEGORIES,
  honorContextTitle,
  loadStrengthPhaseContext,
  normalizeHonorCategory,
  normalizeStrengthPhase,
  resolveStrengthPhase,
  resolveStrengthSeasonBlock,
  strengthContextTitle,
} from "../../public/assets/js/athlete-lane-context.js";

const honorMapping = [
  ["segment1", "self", "Self"],
  ["segment2", "teammates", "Teammates"],
  ["segment3", "team", "Team"],
  ["segment4", "competition", "Competition"],
  ["segment5", "leadership", "Leadership"],
  ["segment6", "legacy", "Legacy"],
];

test("Honor segment metadata contains the approved explicit taxonomy", () => {
  for (const [segment, category, label] of honorMapping) {
    const meta = JSON.parse(
      fs.readFileSync(`public/vault/honor/${segment}/segment.meta.json`, "utf8")
    );
    assert.equal(meta.category, category);
    assert.ok(HONOR_CATEGORIES.includes(meta.category));
    assert.equal(honorContextTitle(meta.category, 14), `Honor · ${label} · Session 14`);
  }
});

test("Honor rejects unknown category context without inferring from segment", () => {
  assert.equal(normalizeHonorCategory("unknown"), null);
  assert.equal(honorContextTitle("unknown", 6), "Honor · Session 6");
});

test("Strength accepts only the three approved phase values", () => {
  assert.equal(normalizeStrengthPhase("preseason"), "preseason");
  assert.equal(normalizeStrengthPhase("inseason"), "inseason");
  assert.equal(normalizeStrengthPhase("postseason"), "postseason");
  assert.equal(normalizeStrengthPhase("pre-season"), null);
});

test("Strength phase precedence is operational, system status, segment, postseason", () => {
  assert.equal(resolveStrengthPhase({
    operationalPhase: "preseason",
    systemStatusPhase: "inseason",
    segmentPhase: "postseason",
  }), "preseason");
  assert.equal(resolveStrengthPhase({
    operationalPhase: "invalid",
    systemStatusPhase: "inseason",
    segmentPhase: "postseason",
  }), "inseason");
  assert.equal(resolveStrengthPhase({
    systemStatusPhase: "invalid",
    segmentPhase: "preseason",
  }), "preseason");
  assert.equal(resolveStrengthPhase({}), "postseason");
});

test("Strength loader preserves static, segment, and final fallback behavior", async () => {
  const response = (data, ok = true) => ({ ok, json: async () => data });

  const staticContext = await loadStrengthPhaseContext({
    fetchImpl: async (url) => url.includes("system-status")
      ? response({ strength: { seasonPhase: "inseason" } })
      : response({ phase: "preseason" }),
  });
  assert.deepEqual(staticContext, { phase: "inseason", source: "system-status" });

  const segmentContext = await loadStrengthPhaseContext({
    fetchImpl: async (url) => url.includes("system-status")
      ? response({ strength: { seasonPhase: "invalid" } })
      : response({ phase: "preseason" }),
  });
  assert.deepEqual(segmentContext, { phase: "preseason", source: "segment-meta" });

  const finalContext = await loadStrengthPhaseContext({
    fetchImpl: async () => response(null, false),
  });
  assert.deepEqual(finalContext, { phase: "postseason", source: "fallback" });
});

test("operational Strength phase controls both title and seasonal content", async () => {
  const workout = {
    seasonBlocks: {
      preseason: { marker: "preseason-content" },
      inseason: { marker: "inseason-content" },
      postseason: { marker: "postseason-content" },
    },
  };

  for (const phase of ["preseason", "inseason", "postseason"]) {
    const context = await loadStrengthPhaseContext({
      operationalPhaseLoader: async () => phase,
      fetchImpl: async () => ({ ok: false, json: async () => null }),
    });
    assert.equal(context.source, "operational");
    assert.equal(strengthContextTitle(context.phase, 7),
      `Strength · ${phase === "inseason" ? "In-Season" : phase[0].toUpperCase() + phase.slice(1)} · Session 7`);
    assert.equal(resolveStrengthSeasonBlock(workout, context.phase).marker, `${phase}-content`);
  }
});

test("invalid Strength phase never selects mismatched seasonal content", () => {
  assert.equal(resolveStrengthSeasonBlock({ seasonBlocks: {} }, "offseason"), null);
});

test("Strength contextual titles use the approved presentation labels", () => {
  assert.equal(strengthContextTitle("preseason", 5), "Strength · Preseason · Session 5");
  assert.equal(strengthContextTitle("inseason", 12), "Strength · In-Season · Session 12");
  assert.equal(strengthContextTitle("postseason", 3), "Strength · Postseason · Session 3");
});
