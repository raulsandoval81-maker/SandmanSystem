import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const m=JSON.parse(readFileSync("scripts/production/winter-wrestling-thanks-production-release.json","utf8"));
const workflow=readFileSync(".github/workflows/release-winter-wrestling-thanks-production.yml","utf8");
const expectedFiles={
  "public/connect/thanks/index.html": "b3844456e48356d2749e9d529544fcc0df304ee6ea5ab4365db7f1368b126793",
  "public/promotions/winter-wrestling/index.html": "51cd9efa45543409e7ef15cecdf2716d598bcdcd1a7e5cd2feed96d9605fed14",
  "public/promotions/winter-wrestling/winter-wrestling.js": "e318962381a929d1e5b431f2f064d7c781bb611e9941aabd604c0eecf736c102"
};
test("Winter Wrestling thank-you release is exactly three approved Hosting files",()=>{
 assert.equal(m.applicationSha,"28b148806acaf8c1534661d8998d6142c959b4fd");
 assert.equal(m.projectId,"sandmandashboard");
 assert.equal(m.hostingSite,"sandman-main");
 assert.equal(m.baselineHostingRelease,"sites/sandman-main/releases/1793205457199000");
 assert.equal(m.baselineHostingVersion,"sites/sandman-main/versions/39887d1d638050b7");
 assert.deepEqual(m.hostingFiles,expectedFiles);
 assert.equal(Object.keys(m.hostingFiles).length,3);
});
test("three pinned files match expected SHA-256",()=>{
 for(const [path,digest] of Object.entries(expectedFiles)){
   assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),digest,path);
 }
});
test("workflow requires protected production and supports preflight/deploy only",()=>{
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/options: \[preflight, deploy\]/);
 assert.match(workflow,/scripts\/production\/winter_wrestling_hosting_release\.py/);
 assert.match(workflow,/inputs\.confirm_project/);
 assert.match(workflow,/inputs\.expected_current_release/);
 assert.match(workflow,/inputs\.expected_current_version/);
 assert.doesNotMatch(workflow,/firebase deploy|gcloud functions deploy|firestore:rules/);
});
