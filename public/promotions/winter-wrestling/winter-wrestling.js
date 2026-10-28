import {db,collection,addDoc,serverTimestamp,ensureSignedIn} from "/assets/js/firebase-init.js";
const form=document.getElementById("seasonForm");
const status=document.getElementById("status");
const button=document.getElementById("send");
const clean=(s)=>String(s||"").trim();
form.addEventListener("submit",async(e)=>{
 e.preventDefault();if(!form.reportValidity())return;
 const data=new FormData(form);
 button.disabled=true;status.textContent="Submitting your interest...";
 try{
  await ensureSignedIn();
  const payload={
   organization:"sandman-combat",locationId:"santa-ynez-valley",pipeline:"admissions",
   source:"seasonal-wrestling-public-interest",requestType:"SEASONAL_INTEREST",
   campaignId:"winter-wrestling-2026-27",campaignName:"Winter Wrestling 2026–27",
   season:"winter-2026-27",campaignPriceLabel:"$350 per athlete · complete season · Nov 15, 2026–Feb 14, 2027",
   sport:"wrestling",programInterest:"zero2hero-wrestling",
   schedulePreference:clean(data.get("schedule")),
   contactName:clean(data.get("guardian")),athleteName:clean(data.get("athlete")),
   email:clean(data.get("email")).toLowerCase(),phone:clean(data.get("phone")),
   familyPricingInterest:data.get("family")==="on",
   scholarshipInterest:data.get("scholarship")==="on",
   contactConsent:data.get("consent")==="on",
   status:"new",requestStatus:"new",approvalRequired:true,
   assignedCoachUid:null,coachNotes:"",pagePath:window.location.pathname,
   createdAt:serverTimestamp(),updatedAt:serverTimestamp()
  };
  await addDoc(collection(db,"admissions_requests"),payload);
  window.location.assign("/connect/thanks/?source=winter-wrestling");
 }catch(err){console.error("[winter-wrestling-interest]",err);status.textContent="Unable to submit. Please try again or use the general Connect form."}
 finally{button.disabled=false}
});
