import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const m=JSON.parse(readFileSync("scripts/production/two-homepages-production-release.json","utf8"));
test("two homepage files only, immutable exact source",()=>{
 assert.equal(m.projectId,"sandmandashboard");
 assert.equal(m.hostingSite,"sandman-main");
 assert.equal(m.applicationSha,"b0277638062d02c3d703f2cf73695e5f5949a764");
 assert.deepEqual(Object.keys(m.hostingFiles).sort(),["public/index.html","public/locations/santa-ynez-valley/index.html"]);
 for(const [path,digest] of Object.entries(m.hostingFiles)) {
   assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),digest);
 }
 const gateway=readFileSync("public/index.html","utf8");
 const location=readFileSync("public/locations/santa-ynez-valley/index.html","utf8");
 assert.match(gateway,/COMBAT BUILDS CHARACTER\./);
 assert.match(location,/body\.local-home \.local-combat-character \{ display: block; \}/);
 assert.match(gateway,/class="gateway-badge"/);
});
