import test from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

test("avatar approval records reject every direct client operation",async(t)=>{
  const env=await initializeTestEnvironment({projectId:"demo-sandman-avatar-firestore",firestore:{rules:readFileSync("firestore.rules","utf8")}});t.after(()=>env.cleanup());
  await env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),"athleteAvatarRequests","request-1"),{athleteId:"athlete-a",status:"guardian_pending"}));
  for(const context of [env.unauthenticatedContext(),env.authenticatedContext("athlete-a"),env.authenticatedContext("guardian")]){
    const ref=doc(context.firestore(),"athleteAvatarRequests","request-1");
    await assertFails(getDoc(ref));await assertFails(setDoc(doc(context.firestore(),"athleteAvatarRequests","new-request"),{status:"approved"}));
    await assertFails(updateDoc(ref,{status:"approved"}));await assertFails(deleteDoc(ref));
  }
});
