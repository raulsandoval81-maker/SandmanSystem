import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const m=JSON.parse(readFileSync("scripts/production/sandman-homepage-header-production-release.json","utf8"));
const workflow=readFileSync(".github/workflows/release-sandman-homepage-header-production.yml","utf8");
test("only root homepage asset is overlaid",()=>{
 assert.equal(m.projectId,"sandmandashboard");
 assert.equal(m.hostingSite,"sandman-main");
 assert.equal(m.applicationSha,"e8398039f819559e164521c47881a9447576ebba");
 assert.deepEqual(Object.keys(m.hostingFiles),["public/index.html"]);
 const html=readFileSync("public/index.html");
 assert.equal(createHash("sha256").update(html).digest("hex"),"7641f492f7a43c27670517f09aa0064d4eb1056e2f754503c6f54c0dcd172e29");
 assert.match(html.toString(),/<h1 class="site-brand__text">/);
 assert.doesNotMatch(html.toString(),/Built in the Shadows\./);
 assert.match(html.toString(),/class="gateway-badge"/);
 assert.match(html.toString(),/data-language-toggle/);
});
test("release remains protected and exact-scoped",()=>{
 assert.match(workflow,/environment: production/);
 assert.match(workflow,/options: \[preflight, deploy, rollback\]/);
 assert.match(workflow,/winter_wrestling_hosting_release\.py/);
 assert.match(workflow,/test "\$CONFIRM_SOURCE_SHA" = "e8398039f819559e164521c47881a9447576ebba"/);
});
