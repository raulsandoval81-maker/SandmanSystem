import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  F8_RANKS,
  F8_STRIPES_PER_RANK,
  F8_STRIPE_PERCENTAGES,
  calculateF8StripeThresholds,
} from "../../functions/lib/policy/f8ProgressionPolicy.js";

const browserPolicySource = readFileSync("public/assets/js/road2champion-progression.js", "utf8");
const browserPolicy = await import(`data:text/javascript;base64,${Buffer.from(browserPolicySource).toString("base64")}`);
const ladderSource = readFileSync("public/assets/js/ladder.service.js", "utf8");

test("browser Road2Champion mirror matches canonical server policy", () => {
  assert.deepEqual(
    browserPolicy.ROAD2CHAMPION_RANKS.map(({ id, tier, name, xpCap }) => ({ id, tier, name, xpCap })),
    F8_RANKS.map(({ id, tier, name, xpCap }) => ({ id, tier, name, xpCap }))
  );
  assert.equal(browserPolicy.ROAD2CHAMPION_STRIPES_PER_RANK, F8_STRIPES_PER_RANK);
  assert.deepEqual([...browserPolicy.ROAD2CHAMPION_STRIPE_PERCENTAGES], [...F8_STRIPE_PERCENTAGES]);
  for (const rank of F8_RANKS) {
    assert.deepEqual(
      browserPolicy.road2ChampionStripeThresholds(rank.tier),
      [...calculateF8StripeThresholds(rank.tier)]
    );
  }
});

test("active browser ladder is derived from the Road2Champion mirror", () => {
  assert.match(ladderSource, /from "\.\/road2champion-progression\.js"/);
  assert.match(ladderSource, /LADDER_YOUTH = ROAD2CHAMPION_RANKS\.map/);
  assert.doesNotMatch(ladderSource, /Competitor[^\n]*2200|Champion[^\n]*3400/);
});

test("canonical F8 policy wins over stale stored athlete caps", () => {
  assert.match(ladderSource, /canonicalF8XpCap/);
  assert.match(ladderSource, /ladder === LADDER_F8 \? currentTier\?\.cap/);
});
