import {db,collection,addDoc,serverTimestamp,ensureSignedIn} from "/assets/js/firebase-init.js";
const form=document.getElementById("seasonForm");
const status=document.getElementById("status");
const button=document.getElementById("send");
const clean=(s)=>String(s||"").trim();
const schedule=document.getElementById("schedule");
const groupCDays=document.getElementById("groupCDays");
const weekdayChecks=Array.from(groupCDays.querySelectorAll('input[name="weekday"]'));
schedule.addEventListener("change",()=>{groupCDays.hidden=schedule.value!=="group-c";});
const selectedWeekdays=()=>weekdayChecks.filter(input=>input.checked).map(input=>input.value);
form.addEventListener("submit",async(e)=>{
 e.preventDefault();if(!form.reportValidity())return;
 const weekdays=schedule.value==="group-c"?selectedWeekdays():[];
 if(schedule.value==="group-c"&&weekdays.length!==2){
  status.textContent="Please select exactly two weekdays for Group C.";
  return;
 }
 const data=new FormData(form);
 button.disabled=true;status.textContent="Submitting your interest...";
 try{
  await ensureSignedIn();
  const payload={
   organization:"sandman-combat",locationId:"santa-ynez-valley",pipeline:"admissions",
   source:"seasonal-wrestling-public-interest",requestType:"SEASONAL_INTEREST",
   campaignId:"winter-wrestling-2026-27",campaignName:"Winter Wrestling 2026–27",
   season:"winter-2026-27",campaignPriceLabel:"$320 early first athlete through Nov 30, 2026; $350 regular beginning Dec 1, 2026; $150 each additional sibling; $30 enrollment waived per athlete · core Nov 30, 2026–Feb 27, 2027",
   sport:"wrestling",programInterest:"zero2hero-wrestling",
   schedulePreference:schedule.value==="group-c"?"unsure":clean(data.get("schedule")),
   scheduleSelection:schedule.value==="group-c"?"group-c":clean(data.get("schedule")),
   preferredWeekdays:weekdays,
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
