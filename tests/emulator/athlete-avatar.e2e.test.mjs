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

test("unsafe raster-backed SVG cannot create a draft or persist avatar metadata",async(t)=>{
  const env=await initializeTestEnvironment({projectId,firestore:{host:"127.0.0.1",port:8281,rules:readFileSync("firestore.rules","utf8")}});
  t.after(async()=>{await env.cleanup();await Promise.all(apps.splice(0).map(deleteApp))});
  const athlete=await actor("avatar-athlete");
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),"athletes","F8_AVATAR_TEST"),{authUid:athlete.user.uid,journey:"ROAD2CHAMPION",rankName:"Shadow",programKind:"wrestling"});
  });
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(80,7)]).toString("base64");
  await assert.rejects(
    ()=>athlete.call("createAthleteAvatarDraft",{contentType:"image/jpeg",photoBase64:jpeg}),
    /Secure illustrated avatar rendering is not available yet|failed-precondition/i,
  );
  await env.withSecurityRulesDisabled(async context=>{
    const { getDocs, collection } = await import("firebase/firestore");
    const requests=await getDocs(collection(context.firestore(),"athleteAvatarRequests"));
    assert.equal(requests.size,0);
    const profile=(await getDoc(doc(context.firestore(),"athletes","F8_AVATAR_TEST"))).data();
    assert.equal(profile.avatar,undefined);
  });
});
