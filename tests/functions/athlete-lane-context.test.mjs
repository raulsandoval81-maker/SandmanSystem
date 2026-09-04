import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  findExactLaneSession,
  getCompletedLaneSubmissionIdentities,
  HONOR_CATEGORIES,
  honorContextTitle,
  loadStrengthPhaseContext,
  normalizeHonorCategory,
  normalizeStrengthPhase,
  resolveStrengthPhase,
  resolveStrengthSeasonBlock,
  resolveLaneSubmissionIdentity,
  strengthContextTitle,
} from "../../public/assets/js/athlete-lane-context.js";
import {
  nextLaneReleaseAt,
  resolveLaneRelease,
  SANDMAN_OPERATIONAL_TIME_ZONE,
} from "../../public/assets/js/lane-release-schedule.js";

const releaseSessions = [1, 2, 3, 4].map((n) => ({ id: `TEST-${n}`, n }));

function completed(lane, segmentId, sessionN, closedAt) {
  return {
    lane,
    segmentId,
    sessionN,
    status: "closed",
    closedAt,
  };
}

test("Strength release windows are Monday, Wednesday, and Friday at 8 Pacific", () => {
  assert.equal(SANDMAN_OPERATIONAL_TIME_ZONE, "America/Los_Angeles");
  assert.equal(nextLaneReleaseAt("strength", "2026-01-04T20:00:00Z").toISOString(), "2026-01-05T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("strength", "2026-01-05T16:00:00Z").toISOString(), "2026-01-07T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("strength", "2026-01-07T16:00:00Z").toISOString(), "2026-01-09T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("strength", "2026-01-09T17:00:00Z").toISOString(), "2026-01-12T16:00:00.000Z");
});

test("Honor release windows are Tuesday, Thursday, and Saturday with no Sunday release", () => {
  assert.equal(nextLaneReleaseAt("honor", "2026-01-05T20:00:00Z").toISOString(), "2026-01-06T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("honor", "2026-01-06T16:00:00Z").toISOString(), "2026-01-08T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("honor", "2026-01-08T16:00:00Z").toISOString(), "2026-01-10T16:00:00.000Z");
  assert.equal(nextLaneReleaseAt("honor", "2026-01-10T17:00:00Z").toISOString(), "2026-01-13T16:00:00.000Z");
});

test("release calculation observes Pacific daylight-saving time", () => {
  assert.equal(
    nextLaneReleaseAt("strength", "2026-03-08T18:00:00Z").toISOString(),
    "2026-03-09T15:00:00.000Z"
  );
});

test("first session is immediately active", () => {
  const result = resolveLaneRelease({
    lane: "strength",
    segmentId: "segment1",
    sessions: releaseSessions,
    submissions: {},
    now: "2026-01-04T12:00:00Z",
  });
  assert.equal(result.state, "active");
  assert.equal(result.activeSessionN, 1);
  assert.equal(result.nextReleaseAt, null);
});

test("completion waits for the next scheduled Strength window", () => {
  const submissions = {
    "STR-001": completed("strength", "segment1", 1, "2026-07-09T01:00:00Z"),
  };
  const waiting = resolveLaneRelease({
    lane: "strength", segmentId: "segment1", sessions: releaseSessions, submissions,
    now: "2026-07-10T14:59:59Z",
  });
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.nextReleaseAt.toISOString(), "2026-07-10T15:00:00.000Z");
  const released = resolveLaneRelease({
    lane: "strength", segmentId: "segment1", sessions: releaseSessions, submissions,
    now: "2026-07-10T15:00:00Z",
  });
  assert.equal(released.activeSessionN, 2);
});

test("an incomplete current session blocks advancement across later windows", () => {
  const submissions = {
    "STR-001": completed("strength", "segment1", 1, "2026-01-02T18:00:00Z"),
    "STR-002": { lane: "strength", segmentId: "segment1", sessionN: 2, status: "pending" },
  };
  const result = resolveLaneRelease({
    lane: "strength", segmentId: "segment1", sessions: releaseSessions, submissions,
    now: "2026-01-09T20:00:00Z",
  });
  assert.equal(result.activeSessionN, 2);
  assert.equal(result.blockedByIncomplete, true);
});

test("missed Strength and Honor windows never stack sessions", () => {
  for (const lane of ["strength", "honor"]) {
    const prefix = lane === "strength" ? "STR" : "HON";
    const submissions = {
      [`${prefix}-001`]: completed(lane, "segment1", 1, "2026-01-01T20:00:00Z"),
    };
    const result = resolveLaneRelease({
      lane, segmentId: "segment1", sessions: releaseSessions, submissions,
      now: "2026-02-01T20:00:00Z",
    });
    assert.equal(result.activeSessionN, 2);
  }
});

test("Honor incomplete work blocks and completed work waits for its next window", () => {
  const pending = {
    "HON-001": completed("honor", "segment1", 1, "2026-01-06T18:00:00Z"),
    "HON-002": { lane: "honor", segmentId: "segment1", sessionN: 2, status: "needs_revision" },
  };
  assert.equal(resolveLaneRelease({
    lane: "honor", segmentId: "segment1", sessions: releaseSessions, submissions: pending,
    now: "2026-01-10T20:00:00Z",
  }).activeSessionN, 2);

  const completeOnly = {
    "HON-001": completed("honor", "segment1", 1, "2026-01-06T18:00:00Z"),
  };
  const waiting = resolveLaneRelease({
    lane: "honor", segmentId: "segment1", sessions: releaseSessions, submissions: completeOnly,
    now: "2026-01-08T15:59:59Z",
  });
  assert.equal(waiting.state, "waiting");
  assert.equal(waiting.nextReleaseAt.toISOString(), "2026-01-08T16:00:00.000Z");
});

test("submission identity prefers entry metadata and supports canonical lane keys", () => {
  assert.deepEqual(resolveLaneSubmissionIdentity({
    lane: "honor",
    key: "HON2-014",
    entry: { segmentId: "segment6", sessionN: 8 },
  }), { segmentId: "segment6", sessionN: 8 });
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane: "honor", key: "HON2-014" }), {
    segmentId: "segment2",
    sessionN: 14,
  });
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane: "honor", key: "HON6-040" }), {
    segmentId: "segment6",
    sessionN: 40,
  });
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane: "strength", key: "STR-CAP-009" }), {
    segmentId: "segment2",
    sessionN: 9,
  });
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane: "strength", key: "STR-PERF-011" }), {
    segmentId: "segment3",
    sessionN: 11,
  });
});

test("legacy segment1 keys remain compatible", () => {
  assert.deepEqual(resolveLaneSubmissionIdentity({
    lane: "honor",
    key: "honor_segment1_session12",
  }), { segmentId: "segment1", sessionN: 12 });
  assert.deepEqual(resolveLaneSubmissionIdentity({
    lane: "strength",
    key: "strength_segment1_session7",
  }), { segmentId: "segment1", sessionN: 7 });
  assert.deepEqual(resolveLaneSubmissionIdentity({ lane: "honor", key: "HON7-001" }), {
    segmentId: null,
    sessionN: 1,
  });
});

test("completed session identity is partitioned by segment", () => {
  const submissions = {
    "HON-005": { lane: "honor", segmentId: "segment1", sessionN: 5, status: "closed" },
    "HON2-005": { lane: "honor", segmentId: "segment2", sessionN: 5, status: "approved" },
    "HON2-006": { lane: "honor", segmentId: "segment2", sessionN: 6, status: "pending" },
  };
  assert.deepEqual(
    getCompletedLaneSubmissionIdentities({ submissions, lane: "honor", segmentId: "segment1" })
      .map(({ identity }) => identity),
    [{ segmentId: "segment1", sessionN: 5 }]
  );
  assert.deepEqual(
    getCompletedLaneSubmissionIdentities({ submissions, lane: "honor", segmentId: "segment2" })
      .map(({ identity }) => identity),
    [{ segmentId: "segment2", sessionN: 5 }]
  );
});

test("missing Honor segment1 session 40 does not wrap to session 1", () => {
  const data = JSON.parse(
    fs.readFileSync("public/vault/honor/segment1/sessions.json", "utf8")
  );
  const sessions = Array.isArray(data) ? data : data.sessions;
  assert.equal(findExactLaneSession(sessions, 40), null);
  assert.equal(findExactLaneSession(sessions, 1)?.id, "HON-001");
  const result = resolveLaneRelease({
    lane: "honor",
    segmentId: "segment1",
    sessions,
    submissions: {
      "HON-039": completed("honor", "segment1", 39, "2026-01-10T18:00:00Z"),
    },
    now: "2026-01-20T18:00:00Z",
  });
  assert.equal(result.state, "content-missing");
  assert.equal(result.expectedSessionN, 40);
  assert.equal(result.activeSession, null);
});

test("Coach review modules require Coach authorization and preserve resolved identity", () => {
  for (const lane of ["strength", "honor"]) {
    const source = fs.readFileSync(`public/coaches/lanes/${lane}/review.js`, "utf8");
    assert.match(source, /requireCoach/);
    assert.match(source, /coachLoginUrl/);
    assert.doesNotMatch(source, /ensureSignedIn/);
    assert.match(source, /resolveLaneSubmissionIdentity/);
    assert.match(source, /segmentId: identity\.segmentId/);
    assert.match(source, /sessionN: identity\.sessionN/);
    assert.doesNotMatch(source, /entry\.segmentId[^\n]+segment1/);
  }
});

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
