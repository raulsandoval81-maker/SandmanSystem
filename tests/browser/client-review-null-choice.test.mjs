import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";

const source=await readFile(new URL("../../public/connect/proposals/review/review.js",import.meta.url),"utf8");
const start=source.indexOf("function renderMembershipChoice(");
const end=source.indexOf("async function submitMembershipChoice()",start);
assert.ok(start>=0&&end>start,"membership choice rendering should exist");
const code=source.slice(start,end);
const render=runInNewContext(code+"\nrenderMembershipChoice", {Array});

test("no membership choice on existing paid-in-full review does not invalidate the link",()=>{
  for(const request of [null,undefined,{}, {active:false,options:null},{active:true,options:null},{active:true,options:[]}])
    assert.equal(render(request),false);
});

test("valid active choice still renders normally",()=>{
  const dom={
    membershipChoiceSection:{hidden:true},
    signatureSection:{hidden:false},
    membershipChoiceContext:{textContent:""},
    membershipChoiceOptions:{innerHTML:""},
  };
  const context={Array,$:id=>dom[id],esc:x=>String(x),moneyFromCents:x=>String(x/100)};
  const activeRender=runInNewContext(code+"\nrenderMembershipChoice",context);
  assert.equal(activeRender({active:true,options:[{id:"one",title:"One",monthlyCents:8000,dueNowCents:0}],contextNote:"Choose one"}),true);
  assert.equal(dom.membershipChoiceSection.hidden,false);
  assert.equal(dom.signatureSection.hidden,true);
  assert.match(dom.membershipChoiceOptions.innerHTML,/One/);
});
