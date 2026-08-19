import { createAthlete } from "/intake-shared/fire.js";
import {
  buildOnboardingEmail,
  buildParentMyAthleteEmail,
} from "../../intake-shared/email-template.js";

/* ----------------------------------
   URL helper
-----------------------------------*/
function toAbsoluteUrl(maybeUrl) {
  if (!maybeUrl) return "";
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;

  const rel = maybeUrl.startsWith("/") ? maybeUrl : `/${maybeUrl}`;
  return `${location.origin}${rel}`;
}

/* ----------------------------------
   Approve + Mint
-----------------------------------*/
async function approveAndMint() {
  const uid = crypto.randomUUID();
  const form = collectFieldsFromScreen();

  const years = Number(form.priorExperienceYears || 0);

  if (years >= 3) {
    form.legacy = true;
    form.legacyType = "external";
    form.legacyYearsVerified = 3;
    form.legacyCreditTotal = 600;
    form.legacyCreditIssued = 300;
    form.legacyHold = true;
    form.legacyCreditSchedule = "deferred_t1_entry";
    form.legacyNote = "External legacy — 3 years of prior experience verified and honored";
    form.startingXp = 300;
  } else if (years === 2) {
    form.legacy = true;
    form.legacyType = "external";
    form.legacyYearsVerified = 2;
    form.legacyCreditTotal = 400;
    form.legacyCreditIssued = 200;
    form.legacyHold = true;
    form.legacyCreditSchedule = "deferred_t1_entry";
    form.legacyNote = "External legacy — 2 years of prior experience verified and honored";
    form.startingXp = 200;
  } else if (years === 1) {
    form.legacy = true;
    form.legacyType = "external";
    form.legacyYearsVerified = 1;
    form.legacyCreditTotal = 200;
    form.legacyCreditIssued = 200;
    form.legacyHold = false;
    form.legacyCreditSchedule = "full_t0";
    form.legacyNote = "External legacy — 1 year of prior experience verified and honored";
    form.startingXp = 200;
  } else {
    form.startingXp = 0;
  }

  // Expect createAthlete to return at least onboardingUrl + athleteUid if possible.
  // Support old return shape too.
  const result = await createAthlete(uid, form);

  const onboardingUrl =
    typeof result === "string" ? result : result?.onboardingUrl || "";

  const athleteUid =
    typeof result === "string"
      ? uid
      : result?.athleteUid || result?.uid || uid;

  const parentMyAthleteUrl = `/parent/my-athlete/?uid=${encodeURIComponent(athleteUid)}`;

  showApprovalModal({
    athleteUid,
    onboardingUrl,
    parentMyAthleteUrl,
  });

  // Parent should get the parent-facing link, not the onboarding link.
  const parentEmailHtml = buildParentMyAthleteEmail(
    toAbsoluteUrl(parentMyAthleteUrl),
    form.fullName
  );

  sendParentEmail(form.parentEmail, parentEmailHtml);

  // Optional: if you still want a separate coach/onboarding email, keep this for coach use only.
  // const coachEmailHtml = buildOnboardingEmail(toAbsoluteUrl(onboardingUrl), form.fullName);
  // sendCoachEmail(...);
}

/* ----------------------------------
   Modal
-----------------------------------*/
function showApprovalModal({ athleteUid, onboardingUrl, parentMyAthleteUrl }) {
  const modal = document.getElementById("approval-modal");

  const athleteUidField = document.getElementById("approved-athlete-uid");
  const onboardingField = document.getElementById("onboarding-link");
  const parentField = document.getElementById("parent-my-athlete-link");

  modal.classList.remove("hidden");

  const onboardingFull = toAbsoluteUrl(onboardingUrl);
  const parentFull = toAbsoluteUrl(parentMyAthleteUrl);

  if (athleteUidField) athleteUidField.value = athleteUid || "";
  if (onboardingField) onboardingField.value = onboardingFull;
  if (parentField) parentField.value = parentFull;

  const copyUidBtn = document.getElementById("copy-athlete-uid");
  const copyOnboardingBtn = document.getElementById("copy-link");
  const openOnboardingBtn = document.getElementById("open-link");
  const copyParentBtn = document.getElementById("copy-parent-link");
  const openParentBtn = document.getElementById("open-parent-link");

  copyUidBtn && (copyUidBtn.onclick = () => {
    navigator.clipboard.writeText(athleteUid || "");
    alert("Athlete UID copied.");
  });

  copyOnboardingBtn && (copyOnboardingBtn.onclick = () => {
    navigator.clipboard.writeText(onboardingFull);
    alert("Onboarding link copied.");
  });

  openOnboardingBtn && (openOnboardingBtn.onclick = () => {
    window.open(onboardingFull, "_blank");
  });

  copyParentBtn && (copyParentBtn.onclick = () => {
    navigator.clipboard.writeText(parentFull);
    alert("Parent link copied.");
  });

  openParentBtn && (openParentBtn.onclick = () => {
    window.open(parentFull, "_blank");
  });
}