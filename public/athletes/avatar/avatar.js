import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { resolveSignedInSelfAthlete } from "/assets/js/athlete-dashboard-data.js";

const workspace=document.querySelector("#avatarWorkspace");
const preview=document.querySelector("[data-avatar-preview]");
const statusNode=document.querySelector("[data-avatar-status]");
const errorNode=document.querySelector("[data-avatar-error]");
const createPanel=document.querySelector("[data-athlete-create]");
const guardianPanel=document.querySelector("[data-guardian-approval]");
const input=document.querySelector("[data-avatar-file]");
const createButton=document.querySelector("[data-avatar-create]");
const approveButton=document.querySelector("[data-avatar-approve]");
const guardianButton=document.querySelector("[data-guardian-approve]");
const guardianLink=document.querySelector("[data-guardian-link]");
const createDraft=httpsCallable(functions,"createAthleteAvatarDraft");
const getState=httpsCallable(functions,"getAthleteAvatarState");
const approve=httpsCallable(functions,"approveAthleteAvatar");
let requestId="";

function waitForUser(){if(auth.currentUser)return Promise.resolve(auth.currentUser);return new Promise(resolve=>{const off=onAuthStateChanged(auth,user=>{off();resolve(user)})})}
function showError(error){errorNode.textContent=error?.message||"Avatar action unavailable."}
function render(value){
  requestId=value.requestId||requestId;
  if(value.previewDataUrl){preview.querySelector("img").src=value.previewDataUrl;preview.style.setProperty("--avatar-shirt",value.shirtColor||"gray");preview.hidden=false}
  const labels={none:"No avatar yet.",preview_ready:"Preview ready. Approve it when it feels right.",guardian_pending:"Preview ready. A parent or guardian must approve it.",approved:"Avatar approved. Your shirt follows your official rank."};
  statusNode.textContent=labels[value.status]||"Avatar status unavailable.";
  approveButton.hidden=value.status!=="preview_ready";
  if(value.guardianRequired&&value.status==="guardian_pending"&&requestId){const url=new URL("/athletes/avatar/",location.origin);url.searchParams.set("request",requestId);guardianLink.textContent=`Guardian approval link: ${url}`;guardianLink.hidden=false}else guardianLink.hidden=true;
  guardianPanel.hidden=!(new URLSearchParams(location.search).has("request")&&value.guardianRequired&&value.status==="guardian_pending");
}
async function preparedPhoto(file){
  if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error("Choose a JPEG, PNG, or WebP photo.");
  const bitmap=await createImageBitmap(file);const side=Math.min(bitmap.width,bitmap.height);const canvas=document.createElement("canvas");canvas.width=800;canvas.height=800;
  const ctx=canvas.getContext("2d");ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,800,800);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.84));if(!blob||blob.size>2500000)throw new Error("Photo could not be prepared under 2.5 MB.");
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return {contentType:"image/jpeg",photoBase64:btoa(binary)};
}

input?.addEventListener("change",()=>{createButton.disabled=!input.files?.[0];errorNode.textContent=""});
createButton?.addEventListener("click",async()=>{try{createButton.disabled=true;statusNode.textContent="Creating private preview…";const payload=await preparedPhoto(input.files?.[0]);const result=await createDraft(payload);render(result.data)}catch(error){showError(error)}finally{createButton.disabled=false}});
approveButton?.addEventListener("click",async()=>{try{render((await approve({requestId})).data);render((await getState({requestId})).data)}catch(error){showError(error)}});
guardianButton?.addEventListener("click",async()=>{try{await approve({requestId});render((await getState({requestId})).data)}catch(error){showError(error)}});

try{
  const user=await waitForUser();if(!user)location.replace("/athletes/auth/");
  const queryRequest=new URLSearchParams(location.search).get("request")||"";
  if(queryRequest){render((await getState({requestId:queryRequest})).data)}
  else {const self=await resolveSignedInSelfAthlete();if(!self.athleteId)throw new Error("Verified Athlete ownership required.");createPanel.hidden=false;render((await getState({})).data)}
  workspace.hidden=false;
}catch(error){workspace.hidden=false;showError(error)}
