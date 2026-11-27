"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const load = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("public system message matches existing strict national intake contract", () => {
  const source = load("public/connect/general-message-payload.mjs");
  const rules = load("firestore.rules");
  assert.match(source, /requiredManagerLevel:\s*"LOCATION_MANAGER"/);
  assert.match(source, /routingPolicy:\s*"ADMIN_TO_ORGANIZATION_LOCATION_MANAGER"/);
  assert.match(source, /preferredOrganization:\s*"not-sure"/);
  assert.match(source, /preferredLocation:\s*"not-sure"/);
  assert.match(rules, /request\.resource\.data\.requiredManagerLevel ==\s*"LOCATION_MANAGER"/);
  assert.match(rules, /request\.resource\.data\.routingPolicy ==\s*"ADMIN_TO_ORGANIZATION_LOCATION_MANAGER"/);
});

test("Casa source uses the same Admin review entry but only approved topics", () => {
  const rules = load("firestore.rules");
  assert.match(rules, /source in \["public-message-page", "casa-national-site"\]/);
  const names = ["casa-academy", "casa-combat", "casa-fitness", "casa-partnership", "casa-expansion", "casa-general"];
  for (const name of names) assert.ok(rules.includes('"' + name + '"'), name);
  assert.match(rules, /request\.resource\.data\.routingStage ==\s*"ADMIN_REVIEW"/);
  assert.match(rules, /request\.resource\.data\.assignedAdminUid == null/);
  assert.match(rules, /request\.resource\.data\.contactConsent == true/);
  assert.match(rules, /allow get, list: if isAdmin\(\)/);
});

test("Admin Reception exposes Casa source and classification filters", () => {
  const html = load("public/admin/reception/index.html");
  const js = load("public/admin/reception/reception.js");
  assert.match(html, /id="sourceFilter"/);
  assert.match(html, /value="casa-national-site"/);
  assert.match(js, /function matchesSourceFilter/);
  assert.match(js, /\.filter\(matchesSourceFilter\)/);
  assert.match(js, /sourceFilter,/);
});
