import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  resolveDisciplineXpAuthority,
} from "../../functions/lib/management/disciplineXpAuthority.js";

import {
  lifetimeXpPatch,
  resolveLifetimeXpEffects,
} from "../../functions/lib/policy/xpDomainPolicy.js";

test("single-discipline athlete uses top-level XP", () => {
  const result = resolveDisciplineXpAuthority({
    primaryDiscipline: "wrestling",
    xp: 400,
  }, "wrestling");

  assert.equal(result.authoritativeBeforeXp, 400);
  assert.equal(result.sourceField, "xp");
  assert.deepEqual(result.xpWriteTargets, ["xp"]);
  assert.equal(result.mirrorsTopLevel, false);
});

test("multi-discipline primary uses top-level authority and mirrors its write", () => {
  const result = resolveDisciplineXpAuthority({
    primaryDiscipline: "wrestling",
    xp: 870,
    disciplines: {
      wrestling: { xp: 785 },
      boxing: { xp: 290 },
    },
  }, "wrestling");

  assert.equal(result.authoritativeBeforeXp, 870);
  assert.equal(result.sourceField, "xp");
  assert.deepEqual(result.xpWriteTargets, [
    "xp",
    "disciplines.wrestling.xp",
  ]);
  assert.equal(result.mirrorsTopLevel, true);
});

test("multi-discipline secondary uses only nested authority", () => {
  const result = resolveDisciplineXpAuthority({
    primaryDiscipline: "wrestling",
    xp: 870,
    disciplines: {
      wrestling: { xp: 785 },
      boxing: { xp: 290 },
    },
  }, "boxing");

  assert.equal(result.authoritativeBeforeXp, 290);
  assert.equal(result.sourceField, "disciplines.boxing.xp");
  assert.deepEqual(result.xpWriteTargets, ["disciplines.boxing.xp"]);
  assert.equal(result.mirrorsTopLevel, false);
});

test("primary mirror does not multiply one lifetime effect", () => {
  const authority = resolveDisciplineXpAuthority({
    primaryDiscipline: "wrestling",
    xp: 870,
    disciplines: { wrestling: { xp: 785 } },
  }, "wrestling");
  const afterXp = authority.authoritativeBeforeXp + 115;
  const athletePatch = {};

  for (const target of authority.xpWriteTargets) athletePatch[target] = afterXp;

  const lifetime = resolveLifetimeXpEffects({
    athlete: {},
    domain: "COMBAT",
    operationalDelta: 115,
    semantic: "NEW_EARNED_XP",
  });
  Object.assign(athletePatch, lifetimeXpPatch(lifetime));

  assert.deepEqual(athletePatch, {
    xp: 985,
    "disciplines.wrestling.xp": 985,
    lifetimeLegacyXp: 0,
    lifetimeCombatXp: 115,
    lifetimeXp: 115,
    lifetimeXpSchemaVersion: "domain-components-v1",
    lifetimeXpReconciliationStatus: "componentized",
  });
});

test("Management transaction keeps receipt idempotency ahead of XP authority resolution", () => {
  const source = fs.readFileSync(
    new URL("../../functions/src/management/managementXpTools.ts", import.meta.url),
    "utf8"
  );

  const receiptGuard = source.indexOf("if (receiptSnap.exists)");
  const authorityResolution = source.indexOf("resolveDisciplineXpAuthority(", receiptGuard);
  const receiptCreate = source.indexOf("tx.create(\n          receiptRef", authorityResolution);

  assert.ok(receiptGuard >= 0);
  assert.ok(authorityResolution > receiptGuard);
  assert.ok(receiptCreate > authorityResolution);
});

test("Management applies dotted discipline targets with update semantics", () => {
  const source = fs.readFileSync(
    new URL("../../functions/src/management/managementXpTools.ts", import.meta.url),
    "utf8"
  );
  const authorityResolution = source.indexOf("resolveDisciplineXpAuthority(");
  const athleteUpdate = source.indexOf("tx.update(\n          athleteRef", authorityResolution);
  const logWrite = source.indexOf("tx.set(\n          logRef", athleteUpdate);

  assert.ok(authorityResolution >= 0);
  assert.ok(athleteUpdate > authorityResolution);
  assert.ok(logWrite > athleteUpdate);
});
