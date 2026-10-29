import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync("scripts/production/winter-wrestling-production-release.json", "utf8"));
const workflow = fs.readFileSync(".github/workflows/release-winter-wrestling-production.yml", "utf8");
const script = fs.readFileSync("scripts/production/winter_wrestling_hosting_release.py", "utf8");
const hash = path => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");

test("release is pinned to the staged application and exact production boundary", () => {
  assert.equal(manifest.applicationSha, "6eba4d30395f7eaa100c5f3326c0a89033f6a689");
  assert.equal(manifest.projectId, "sandmandashboard");
  assert.equal(manifest.hostingSite, "sandman-main");
  assert.equal(manifest.baselineHostingRelease, "sites/sandman-main/releases/1793216019438000");
  assert.equal(manifest.baselineHostingVersion, "sites/sandman-main/versions/6399d9241c2684a1");
  assert.equal(manifest.firestoreRulesSha256, "d663ac2354e243e4d6aae7e4d799241c5c20763a60e93a79c2d7cf813fb180af");
});

test("only the five approved Hosting assets are overlaid and their bytes are pinned", () => {
  const expected = [
    "public/connect/admissions-requests/index.html",
    "public/connect/admissions-requests/admissions-requests.js",
    "public/connect/try-a-class/try-a-class.js",
    "public/promotions/winter-wrestling/index.html",
    "public/promotions/winter-wrestling/winter-wrestling.js",
  ];
  assert.deepEqual(Object.keys(manifest.hostingFiles).sort(), expected.sort());
  for (const [path, digest] of Object.entries(manifest.hostingFiles)) assert.equal(hash(path), digest, path);
});

test("Winter Wrestling payload and settled offer remain exact", () => {
  const html = fs.readFileSync("public/promotions/winter-wrestling/index.html", "utf8");
  const js = fs.readFileSync("public/promotions/winter-wrestling/winter-wrestling.js", "utf8");
  assert.match(html, /\$350/);
  assert.match(html, /NOVEMBER 16, 2026 – FEBRUARY 14, 2027/);
  assert.match(html, /Come As You Are/);
  assert.match(html, /Thanksgiving break — no required practices/);
  assert.match(html, /Eleven-week core wrestling program/);
  assert.match(html, /Regular practice Monday, December 21/);
  assert.match(html, /Regular practice Wednesday, December 23; Thursday athletes may attend/);
  assert.match(html, /Closed Thursday, December 24 and Friday, December 25/);
  assert.match(html, /Optional training Saturday, December 26/);
  assert.match(html, /New Year's Day, January 1, falls on Friday/);
  assert.match(html, /value="mon-wed-sat"/);
  assert.match(html, /value="tue-thu-sat"/);
  assert.match(js, /requestType:"SEASONAL_INTEREST"/);
  assert.match(js, /campaignId:"winter-wrestling-2026-27"/);
  assert.match(js, /season:"winter-2026-27"/);
  assert.match(js, /campaignPriceLabel:"\$350 per athlete · complete season · Nov 16, 2026–Feb 14, 2027"/);
  assert.match(js, /locationId:"santa-ynez-valley"/);
  assert.match(js, /status:"new"/);
  assert.match(js, /contactConsent:data\.get\("consent"\)==="on"/);
  assert.doesNotMatch(js, /stripe|awardXp|enrollAthlete|activateAthlete/i);
});

test("merged Day Mode correction keeps the campaign card opaque and readable", () => {
  const managementHtml = fs.readFileSync("public/connect/admissions-requests/index.html", "utf8");
  assert.match(managementHtml, /\.requests-page \.seasonal-campaign-panel/);
  assert.match(managementHtml, /background: #fffdf8 !important/);
  assert.match(managementHtml, /color: #172033 !important/);
  assert.match(managementHtml, /opacity: 1 !important/);
  assert.match(managementHtml, /background: #172033 !important/);
  assert.match(managementHtml, /color: #fffdf8 !important/);
});

test("legacy requests and location-scoped Management remain wired", () => {
  const intro = fs.readFileSync("public/connect/try-a-class/try-a-class.js", "utf8");
  const management = fs.readFileSync("public/connect/admissions-requests/admissions-requests.js", "utf8");
  assert.match(intro, /REQUESTED_INTRO/);
  assert.match(intro, /PROMOTIONAL_INTRO/);
  assert.match(intro, /OPEN_PRACTICE/);
  assert.match(intro, /locationId:form\.location\.value/);
  assert.match(management, /requireManagement/);
  assert.match(management, /context\?\.scope\?\.locationIds/);
  assert.match(management, /SEASONAL_INTEREST/);
});

test("workflow preserves live Hosting and cannot deploy Functions or rules", () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /options: \[preflight, deploy, rollback\]/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /FIREBASE_SERVICE_ACCOUNT_SANDMANDASHBOARD/);
  assert.doesNotMatch(workflow, /--only\s+(functions|firestore|storage)/);
  assert.doesNotMatch(workflow, /firebase deploy/);
  assert.match(script, /candidate_files = dict\(live_files\)/);
  assert.match(script, /Hosting overlay escaped the exact allowlist/);
  assert.match(script, /any\(path not in overlay for path in changed\)/);
  assert.match(script, /Hosting overlay is already current; no release required/);
  assert.match(script, /Live Hosting changed during preparation/);
  assert.match(script, /Production Firestore rule bytes changed after review/);
  assert.match(script, /PREFLIGHT ONLY: no Hosting version or release was created/);
});
