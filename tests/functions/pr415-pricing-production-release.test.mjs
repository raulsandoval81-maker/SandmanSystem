import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const w=readFileSync(".github/workflows/release-pr415-pricing-production.yml","utf8");
const p=readFileSync("scripts/production/pr415_pricing_hosting_release.py","utf8");
test("PR415 production release is manual, protected and immutable",()=>{
 assert.match(w,/workflow_dispatch:/);
 assert.match(w,/environment: production/);
 assert.match(w,/group: sandman-production-hosting/);
 assert.match(w,/refs\/heads\/main/);
 assert.match(w,/a4e01f3e952fdda7d940cf08e29e4e95f2cdede4/);
 assert.match(w,/options: \[preflight, deploy\]/);
 assert.doesNotMatch(w,/firebase deploy|gcloud functions deploy|firestore:rules/);
});
test("Production preserves current site with two-file Pricing-only overlay",()=>{
 assert.match(p,/PROJECT = "sandmandashboard"/);
 assert.match(p,/SITE = "sandman-main"/);
 assert.match(p,/public\/management\/pricing\/index.html/);
 assert.match(p,/public\/management\/pricing\/pricing.js/);
 assert.match(p,/len\(live\) != int\(version\["fileCount"\]\)/);
 assert.match(p,/changed since reviewed preflight/);
 assert.match(p,/Live Hosting changed during deployment/);
 assert.match(p,/Unrelated production asset requested/);
 assert.match(p,/PREFLIGHT ONLY/);
 assert.doesNotMatch(p,/firestore\.rules|gcloud|stripe/i);
});
