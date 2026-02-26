import { createAthlete } from "/intake-shared/fire.js";
import { buildOnboardingEmail } from "../intake-shared/email-template.js";

async function approveAndMint() {
  const uid = crypto.randomUUID();

  const form = collectFieldsFromScreen(); // your existing reader

  const onboardingUrl = await createAthlete(uid, form);

  showApprovalModal(onboardingUrl);

const email = buildOnboardingEmail(onboardingUrl, form.fullName);
sendParentEmail(form.parentEmail, email);
}
function showApprovalModal(url){
  const modal = document.getElementById("approval-modal");
  const field = document.getElementById("onboarding-link");
  modal.classList.remove("hidden");
  field.value = location.origin + url;

  document.getElementById("copy-link").onclick = ()=>{
    navigator.clipboard.writeText(field.value);
    alert("Copied!");
  };

  document.getElementById("open-link").onclick = ()=>{
    window.open(field.value, "_blank");
  };
}
