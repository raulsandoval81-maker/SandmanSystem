import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  athleteCanonicalCombatDisciplines,
  resolveAuthoritativeLifetimeCombatDiscipline,
} from "../../functions/lib/policy/lifetimeCombatDisciplinePolicy.js";
import {
  competitionEventCombatDiscipline,
  normalizeXpRequest,
} from "../../functions/lib/services/authoritativeXpService.js";

const multi = {
  primaryDiscipline: "wrestling",
  disciplineIds: ["wrestling", "boxing"],
  disciplines: { wrestling: {}, boxing: {} },
};

test("multi-discipline F4 Boxing Arena request attributes Boxing", () => {
  assert.equal(resolveAuthoritativeLifetimeCombatDiscipline({
    athlete: multi, requestedDiscipline: "boxing",
  }), "boxing");
});

test("stored competition discipline is authoritative when caller omits it", () => {
  const stored = competitionEventCombatDiscipline({
    eventType: "competition", disciplineId: "boxing", programScopes: ["boxing"],
  });
  assert.equal(resolveAuthoritativeLifetimeCombatDiscipline({ athlete: multi,
    storedEventDiscipline: stored }), "boxing");
});

test("ambiguous multi-discipline award without request or event discipline fails closed", () => {
  assert.throws(() => resolveAuthoritativeLifetimeCombatDiscipline({ athlete: multi }),
    /AMBIGUOUS_LIFETIME_COMBAT_DISCIPLINE/);
});

test("single-discipline athlete safely resolves its only enrolled discipline", () => {
  assert.deepEqual(athleteCanonicalCombatDisciplines({ disciplineIds: ["wrestling"] }),
    ["wrestling"]);
  assert.equal(resolveAuthoritativeLifetimeCombatDiscipline({
    athlete: { disciplineIds: ["wrestling"] },
  }), "wrestling");
});

test("stored event and browser discipline mismatch is rejected", () => {
  assert.throws(() => resolveAuthoritativeLifetimeCombatDiscipline({
    athlete: multi, requestedDiscipline: "boxing", storedEventDiscipline: "wrestling",
  }), /LIFETIME_COMBAT_DISCIPLINE_EVENT_MISMATCH/);
});

test("all Championship outcomes and PRESTIGE retain explicit discipline context", () => {
  for (const kind of ["CHAMPIONSHIP/COMPETE", "CHAMPIONSHIP/PLACE", "CHAMPIONSHIP/CHAMPION"]) {
    const request = normalizeXpRequest({ uid: "F4_TEST", kind,
      meta: { tournamentId: "event-1", discipline: "boxing" } });
    assert.equal(request.meta.discipline, "boxing");
  }
  const prestige = normalizeXpRequest({ uid: "F4_TEST", kind: "PRESTIGE",
    meta: { tournamentId: "event-1", result: "CHAMPION", discipline: "boxing" } });
  assert.equal(prestige.kind, "CHAMPIONSHIP/CHAMPION");
  assert.equal(prestige.meta.discipline, "boxing");
});

test("secondary assessment discipline validates against athlete enrollment", () => {
  assert.equal(resolveAuthoritativeLifetimeCombatDiscipline({
    athlete: multi, requestedDiscipline: "boxing",
  }), "boxing");
  assert.throws(() => resolveAuthoritativeLifetimeCombatDiscipline({
    athlete: multi, requestedDiscipline: "mma",
  }), /LIFETIME_COMBAT_DISCIPLINE_NOT_ENROLLED/);
});

test("assessment pin creation stores canonical discipline and fails closed on ambiguity", () => {
  const source = readFileSync("functions/src/assessments/athleteAssessmentPins.ts", "utf8");
  assert.match(source, /requestedDiscipline: req\.data\?\.discipline/);
  assert.match(source, /disciplineId: canonicalDiscipline/);
  assert.match(source, /discipline: canonicalDiscipline/);
});

test("experience finalization uses stored pin discipline without primary fallback", () => {
  const source = readFileSync("functions/src/management/managementXpTools.ts", "utf8");
  assert.match(source, /requestedDiscipline:\s*pin\.disciplineId \|\| pin\.discipline/);
  const relevant = source.slice(source.indexOf("let canonicalDiscipline"),
    source.indexOf("const lifetime =", source.indexOf("let canonicalDiscipline")));
  assert.doesNotMatch(relevant, /athlete\.primaryDiscipline|athlete\.discipline/);
});

test("receipt lookup remains ahead of recovery and stored event/map resolution", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.ok(source.indexOf("if (receiptSnap.exists)")
    < source.indexOf("if (shouldSuppressCombatAwardForRecovery"));
  assert.ok(source.indexOf("if (receiptSnap.exists)")
    < source.indexOf("let canonicalCombatDiscipline"));
  assert.ok(source.indexOf("if (receiptSnap.exists)")
    < source.indexOf("const lifetimeAward = buildLifetimeAwardUpdate"));
});
