import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { practiceRunIdentity, restorePracticeRun, matchingPracticeRun } from "../../public/coaches/execution/engine/big-clock-state-identity.mjs";

const a={ practiceId:"practice-a",sessionId:"session-a" };
const b={ practiceId:"practice-b",sessionId:"session-a" };
const completed={...a,complete:true,running:false,playlist:[{title:"Technique",minutes:5}]};
test("same-practice completed state remains recoverable on refresh",()=>{
  assert.deepEqual(restorePracticeRun(completed,a),completed);
});
test("new practice does not inherit older completed screen",()=>{
  assert.deepEqual(restorePracticeRun(completed,b),{});
});
test("running and paused state can recover only for exact practice/session",()=>{
  const paused={...a,running:false,paused:true,blockStartedAt:12345};
  assert.deepEqual(restorePracticeRun(paused,a),paused);
  assert.deepEqual(restorePracticeRun(paused,{practiceId:a.practiceId,sessionId:"new-session"}),{});
});
test("legacy unscoped state cannot accidentally resume another practice",()=>{
  assert.equal(matchingPracticeRun({complete:true},a),false);
  assert.deepEqual(restorePracticeRun({complete:true},a),{});
});
test("URL handoff has explicit priority and missing identifiers fail closed",()=>{
  assert.deepEqual(practiceRunIdentity({queryPracticeId:"from-link",querySessionId:"from-link-session",payload:a,session:b}),{
    practiceId:"from-link",sessionId:"from-link-session"
  });
  assert.equal(matchingPracticeRun(completed,{practiceId:"",sessionId:a.sessionId}),false);
});
test("Big Clock UI uses scoped recovery and returns new practice to ready overlay",()=>{
  const src=readFileSync(new URL("../../public/coaches/execution/big-clock-2.0/big-clock-2.0.js",import.meta.url),"utf8");
  assert.match(src,/restorePracticeRun\(/);
  assert.match(src,/const scopedState = \{ \.\.\.state, \.\.\.identity \}/);
  assert.match(src,/ready\.classList\.toggle\("hidden", Boolean\(data\.running \|\| data\.paused \|\| data\.complete\)\)/);
});
