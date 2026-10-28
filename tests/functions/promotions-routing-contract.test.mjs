import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
test("intro requests supply Management-scoped locationId",()=>{
 const js=read("public/connect/try-a-class/try-a-class.js");
 assert.match(js,/locationId:form\.location\.value==="lompoc"\?"lompoc":"santa-ynez-valley"/);
 assert.match(js,/collection\(db,"admissions_requests"\)/);
});
test("seasonal campaigns route through the same requests collection",()=>{
 const js=read("public/promotions/winter-wrestling/winter-wrestling.js");
 assert.match(js,/requestType:"SEASONAL_INTEREST"/);
 assert.match(js,/locationId:"santa-ynez-valley"/);
 assert.match(js,/campaignId:"winter-wrestling-2026-27"/);
 assert.match(js,/collection\(db,"admissions_requests"\)/);
 assert.match(js,/\$350 per athlete · complete season · Nov 15, 2026–Feb 14, 2027/);
});
test("Winter Wrestling views use the approved season and holiday schedule",()=>{
 const publicPage=read("public/promotions/winter-wrestling/index.html");
 const managementPage=read("public/connect/admissions-requests/index.html");
 for(const page of [publicPage,managementPage]){
  assert.match(page,/November 15, 2026/i);
  assert.match(page,/February 14, 2027/i);
  assert.match(page,/\$350/);
  assert.match(page,/Monday\s*\/\s*Wednesday\s*\/\s*Saturday/);
  assert.match(page,/Tuesday\s*\/\s*Thursday\s*\/\s*Saturday/);
  assert.match(page,/November 15–21/);
  assert.match(page,/November 22–28/);
  assert.match(page,/November 29–February 14/);
  assert.match(page,/December 23/);
  assert.match(page,/December 24/);
  assert.match(page,/December 25/);
  assert.match(page,/December 26/);
  assert.match(page,/New Year's Day, January 1, falls on Friday/);
 }
 assert.doesNotMatch(publicPage,/NOVEMBER 2026 – JANUARY 2027/);
 assert.doesNotMatch(managementPage,/November–January/);
});
test("Management lists location-scoped seasonal requests",()=>{
 const js=read("public/connect/admissions-requests/admissions-requests.js");
 assert.match(js,/where\("locationId", "in", locations\)/);
 assert.match(js,/SEASONAL_INTEREST/);
});
test("seasonal rules require valid campaign and schedule",()=>{
 const rules=read("firestore.rules");
 assert.match(rules,/request\.resource\.data\.campaignId == "winter-wrestling-2026-27"/);
 assert.match(rules,/request\.resource\.data\.contactConsent == true/);
 assert.match(rules,/"mon-wed-sat", "tue-thu-sat", "unsure"/);
});
