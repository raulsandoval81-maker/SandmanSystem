import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  XP_DOMAINS,
  XP_DOMAIN_FIREWALL,
  awardLaneFeedsActiveRankXp,
  isXpDomainConversionPermitted,
  resolveAuthoritativeActiveRankXp,
} from "../../functions/lib/policy/xpDomainPolicy.js";
import {
  buildAwardPlan,
  normalizeXpRequest,
} from "../../functions/lib/services/authoritativeXpService.js";

test("XP domains and firewall policy are immutable and versioned", () => {
  assert.equal(XP_DOMAIN_FIREWALL.version, "xp-domain-firewall-v1");
  assert.equal(XP_DOMAIN_FIREWALL.authoritativeActiveRankField, "xp");
  assert.ok(Object.isFrozen(XP_DOMAINS));
  assert.ok(Object.isFrozen(XP_DOMAIN_FIREWALL));
});

test("only future Challenge-to-Lifetime conversion is permitted", () => {
  const domains = Object.values(XP_DOMAINS);
  for (const from of domains) {
    for (const to of domains) {
      assert.equal(
        isXpDomainConversionPermitted(from, to),
        from === XP_DOMAINS.CHALLENGE && to === XP_DOMAINS.LIFETIME
      );
    }
  }
});

test("Challenge and Lifetime XP can never feed Active Rank XP", () => {
  assert.equal(isXpDomainConversionPermitted(XP_DOMAINS.CHALLENGE, XP_DOMAINS.ACTIVE_RANK), false);
  assert.equal(isXpDomainConversionPermitted(XP_DOMAINS.LIFETIME, XP_DOMAINS.ACTIVE_RANK), false);
  assert.equal(awardLaneFeedsActiveRankXp("F8", "CHALLENGE"), false);
  assert.equal(awardLaneFeedsActiveRankXp("F4", "CHALLENGE"), false);
});

test("Challenge XP cannot feed Strength or Honor", () => {
  assert.equal(isXpDomainConversionPermitted(XP_DOMAINS.CHALLENGE, XP_DOMAINS.STRENGTH), false);
  assert.equal(isXpDomainConversionPermitted(XP_DOMAINS.CHALLENGE, XP_DOMAINS.HONOR), false);
});

test("F8 Strength and Honor feed its one Active Rank XP bar", () => {
  assert.equal(awardLaneFeedsActiveRankXp("F8", "STRENGTH"), true);
  assert.equal(awardLaneFeedsActiveRankXp("F8", "HONOR"), true);
  const athlete = { uid: "F8_9", trackBase: "F8", tier: "T1", xp: 100 };
  const request = normalizeXpRequest({ uid: athlete.uid, kind: "STRENGTH", amount: 10 });
  assert.equal(buildAwardPlan({ athlete, athleteId: athlete.uid, request, monthly: {} }).afterXp, 110);
});

test("F4 Strength and Honor remain separate from Active Rank XP", () => {
  assert.equal(awardLaneFeedsActiveRankXp("F4", "STRENGTH"), false);
  assert.equal(awardLaneFeedsActiveRankXp("F4", "HONOR"), false);
  const athlete = { uid: "F4_9", trackBase: "F4", tier: "T1", xp: 100, xpCap: 1600 };
  const request = normalizeXpRequest({ uid: athlete.uid, kind: "HONOR", amount: 5 });
  const out = buildAwardPlan({ athlete, athleteId: athlete.uid, request, monthly: {} });
  assert.equal(out.afterXp, 100);
  assert.equal(out.bucketField, "xpHonor");
});

test("active-rank resolver reads athlete.xp and ignores every other XP domain", () => {
  assert.equal(resolveAuthoritativeActiveRankXp({
    xp: 0,
    lifetimeXp: 9000,
    xpLifetime: 8000,
    challengeXp: 7000,
    xpStrength: 6000,
    xpHonor: 5000,
    xpDaily: 4000,
    xpArena: 3000,
  }), 0);
});

test("authoritative XP service has no Challenge or legacy Lifetime input path", () => {
  const source = readFileSync("functions/src/services/authoritativeXpService.ts", "utf8");
  assert.match(source, /resolveAuthoritativeActiveRankXp\(athlete\)/);
  assert.match(source, /resolveLifetimeXpAccumulation\(athlete, plan\.beforeXp, plan\.afterXp\)/);
  assert.doesNotMatch(source, /xpLifetime|totalLifetimeXp|challengeXp|lifeXp/i);
});

test("Lifetime leaderboard never falls back to active-rank XP", () => {
  const source = readFileSync("public/athletes/leaderboard/leaderboard.app.js", "utf8");
  const lifetimeBlocks = [...source.matchAll(/athlete\.data\.lifetimeXp \?\?[\s\S]{0,180}?\)/g)]
    .map((match) => match[0]);
  assert.equal(lifetimeBlocks.length, 2);
  for (const block of lifetimeBlocks) {
    assert.doesNotMatch(block, /athlete\.data\.xp\s*\?\?|combat\.xp\s*\?\?/);
    assert.match(block, /totalLifetimeXp \?\?\s*0/);
  }
});

test("architecture note locks naming collisions and forbidden paths", () => {
  const note = readFileSync("docs/architecture/XP_DOMAINS.md", "utf8");
  assert.match(note, /`athlete\.xp` is the sole authoritative balance/);
  assert.match(note, /`LifeXP` is not an implemented field or currency/);
  assert.match(note, /Challenge XP to Active Rank XP/);
  assert.match(note, /Lifetime XP to Active Rank XP/);
  assert.match(note, /totalXP.*ambiguous legacy terms/);
});
