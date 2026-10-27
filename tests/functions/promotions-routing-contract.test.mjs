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
