import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const manifest = JSON.parse(readFileSync("scripts/production/sandman-thanks-button-production-release.json", "utf8"));
const workflow = readFileSync(".github/workflows/release-sandman-thanks-button-production.yml", "utf8");
test("production overlay is restricted to one thank-you HTML file", () => {
  assert.equal(manifest.projectId, "sandmandashboard");
  assert.equal(manifest.hostingSite, "sandman-main");
  assert.equal(manifest.applicationSha, "2598fbe05ef5c1f6f2708901e02c4930d2946e93");
  assert.equal(manifest.baselineHostingRelease, "sites/sandman-main/releases/1793210665159000");
  assert.equal(manifest.baselineHostingVersion, "sites/sandman-main/versions/0c394e5328fc6b93");
  assert.deepEqual(Object.keys(manifest.hostingFiles), ["public/connect/thanks/index.html"]);
  const content = readFileSync("public/connect/thanks/index.html");
  assert.equal(createHash("sha256").update(content).digest("hex"), "ce60b5d99732239d6e8eb286f68be24ca9974b58614e224f8aa4220ceff4a1ff");
  const html=content.toString("utf8");
  assert.match(html, /Learn About Sandman Combat/);
  assert.match(html, /Conozca Sandman Combat/);
  assert.doesNotMatch(html, /Discover the Sandman Culture/);
});
test("protected workflow only operates scoped Hosting release", () => {
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/options: \[preflight, deploy, rollback\]/);
  assert.match(workflow,/winter_wrestling_hosting_release\.py/);
  assert.match(workflow,/test "\$CONFIRM_SOURCE_SHA" = "2598fbe05ef5c1f6f2708901e02c4930d2946e93"/);
  assert.doesNotMatch(workflow,/firebase deploy|gcloud functions deploy|firestore:rules/);
});
