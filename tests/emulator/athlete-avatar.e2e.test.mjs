import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const projectId="demo-sandman-athlete-avatar";
const apps=[];
async function actor(label){
  const app=initializeApp({projectId,apiKey:"demo",authDomain:"localhost",storageBucket:`${projectId}.appspot.com`},label);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,"http://127.0.0.1:9299",{disableWarnings:true});
  const user=(await createUserWithEmailAndPassword(auth,`${label}@example.test`,"Sprint2-Test-Only!")).user;
  const functions=getFunctions(app,"us-central1");connectFunctionsEmulator(functions,"127.0.0.1",5601);
  return {user,call:(name,data={})=>httpsCallable(functions,name)(data)};
}

test("actual handlers enforce self ownership, youth guardian approval, persistence and original deletion audit",async(t)=>{
  const env=await initializeTestEnvironment({projectId,firestore:{host:"127.0.0.1",port:8281,rules:readFileSync("firestore.rules","utf8")}});
  t.after(async()=>{await env.cleanup();await Promise.all(apps.splice(0).map(deleteApp))});
  const athlete=await actor("avatar-athlete"), guardian=await actor("avatar-guardian"), attacker=await actor("avatar-attacker");
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),"athletes","F8_AVATAR_TEST"),{authUid:athlete.user.uid,parentUid:guardian.user.uid,journey:"ROAD2CHAMPION",rankName:"Shadow",programKind:"wrestling"});
  });
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(80,7)]).toString("base64");
  const draft=(await athlete.call("createAthleteAvatarDraft",{contentType:"image/jpeg",photoBase64:jpeg})).data;
  assert.equal(draft.status,"guardian_pending");assert.equal(draft.guardianRequired,true);assert.equal(draft.shirtColor,"white");
  await assert.rejects(()=>athlete.call("approveAthleteAvatar",{requestId:draft.requestId}),/guardian|permission/i);
  await assert.rejects(()=>attacker.call("getAthleteAvatarState",{requestId:draft.requestId}),/access|permission/i);
  const guardianPreview=(await guardian.call("getAthleteAvatarState",{requestId:draft.requestId})).data;
  assert.equal(guardianPreview.status,"guardian_pending");assert.match(guardianPreview.previewDataUrl,/^data:image\/svg\+xml;base64,/);
  const approved=(await guardian.call("approveAthleteAvatar",{requestId:draft.requestId})).data;assert.equal(approved.status,"approved");
  await env.withSecurityRulesDisabled(async context=>{
    const request=(await getDoc(doc(context.firestore(),"athleteAvatarRequests",draft.requestId))).data();
    const profile=(await getDoc(doc(context.firestore(),"athletes","F8_AVATAR_TEST"))).data();
    assert.equal(request.status,"approved");assert.ok(request.originalDeletedAt);assert.equal(profile.avatar.requestId,draft.requestId);assert.equal(profile.rankName,"Shadow");
    await setDoc(doc(context.firestore(),"athletes","F8_AVATAR_TEST"),{rankName:"Prospect"},{merge:true});
  });
  const promoted=(await athlete.call("getAthleteAvatarState",{})).data;
  assert.equal(promoted.status,"approved");assert.equal(promoted.shirtColor,"yellow");
});
