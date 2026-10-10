import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("Wrestling staging config uses an isolated generated hosting root", async () => {
  const config = JSON.parse(await read("firebase.staging.json"));
  assert.equal(config.hosting.public, ".firebase-staging/public");
  assert.equal(config.firestore.rules, "firestore.rules");
  assert.notEqual(config.hosting.target, "sandman");
});

test("staging preparation and seeding fail closed against production", async () => {
  const [prepare, seed, runtime] = await Promise.all([
    read("scripts/staging/prepare-staging-hosting.mjs"),
    read("functions/scripts/seed-wrestling-staging.mjs"),
    read("public/assets/js/firebase-init.js"),
  ]);
  for (const source of [prepare, seed]) {
    assert.match(source, /sandmandashboard/);
    assert.match(source, /SANDMAN_STAGING_ACK/);
  }
  assert.match(runtime, /Staging cannot use the production Firebase project/);
  assert.match(runtime, /STAGING — synthetic data only/);
});
