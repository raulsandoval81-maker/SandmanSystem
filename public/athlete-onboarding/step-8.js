// ======================================================
// Athlete Onboarding — Step 8 (Hero + Legend)
// Reads/Writes: athletes/{uid}
// Fields written:
//   onboarding.identity.childhoodHero
//   onboarding.identity.futureLegend
// ======================================================

import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";
import { resolveOnboardingTemplate } from "./onboarding-templates.js";

const params = new URLSearchParams(location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
if (!uid) {
  alert("Missing ?id=");
  throw new Error("Missing ?id=");
}

const heroEl   = document.getElementById("hero-input");
const legendEl = document.getElementById("legend-input");
const statusEl = document.getElementById("status");
const nextBtn  = document.getElementById("btn-next");

const setStatus = (t) => { if (statusEl) statusEl.textContent = t || ""; };

let athlete = null;
let resolvedTemplate = null;

function applyIdentityTemplate(resolved) {
  const copy = resolved.template.identity;
  const heroCard = document.getElementById("hero-card");
  const legendCard = document.getElementById("legend-card");
  const activeCard = copy.kind === "legend" ? legendCard : heroCard;
  const inactiveCard = copy.kind === "legend" ? heroCard : legendCard;
  inactiveCard?.classList.add("hidden");
  activeCard?.classList.remove("hidden");
  const pageHeading = document.querySelector("h1");
  const pageSub = document.querySelector(".header .sub");
  const cardHeading = activeCard?.querySelector("h2");
  const cardHelper = activeCard?.querySelector("p");
  const input = copy.kind === "legend" ? legendEl : heroEl;
  if (pageHeading) pageHeading.textContent = copy.heading;
  if (pageSub) pageSub.textContent = copy.question;
  if (cardHeading) cardHeading.textContent = copy.question;
  if (cardHelper) cardHelper.textContent = copy.helper;
  if (input) input.placeholder = copy.placeholder;
  document.body.dataset.onboardingTemplate = resolved.templateKey;
}

// --------------------------------
// BOOT: ensure auth + load lock state
// --------------------------------
async function boot() {
  try {
    // 🔐 REQUIRED so request.auth exists (phone)
    await ensureSignedIn();

    const snap = await getDoc(doc(db, "athletes", uid));
    athlete = snap.exists() ? (snap.data() || {}) : null;
    resolvedTemplate = resolveOnboardingTemplate(athlete || {});
    applyIdentityTemplate(resolvedTemplate);

    // If Step 8 already locked, forward immediately
    if (athlete?.onboarding?.locks?.step8 === true) {
      window.location.href = `/athlete-onboarding/step-9.html?id=${encodeURIComponent(uid)}`;
      return;
    }
    if (nextBtn) nextBtn.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus("Auth/load failed.");
    if (nextBtn) nextBtn.disabled = true;
  }
}

boot();

nextBtn?.addEventListener("click", async () => {
  const hero = (heroEl?.value || "").trim();
  const legend = (legendEl?.value || "").trim();
  const kind = resolvedTemplate?.template?.identity?.kind || "anchor";
  const answer = kind === "legend" ? legend : hero;

  if (!answer) return setStatus("Add your identity answer to continue.");

  // ✅ Client-side write-once guard (rules enforce later)
  if (athlete?.onboarding?.locks?.step8 === true) {
    window.location.href = `./step-9.html?id=${encodeURIComponent(uid)}`;
    return;
  }

  try {
    nextBtn.disabled = true;
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",

      // Step 8 completed → next step is 9
      "onboarding.step": 9,

      ...(kind === "hero" || kind === "anchor" ? {
        "onboarding.identity.childhoodHero": hero,
        "onboarding.identity.childhoodHeroAt": serverTimestamp(),
      } : {}),
      ...(kind === "legend" ? {
        "onboarding.identity.futureLegend": legend,
        "onboarding.identity.futureLegendAt": serverTimestamp(),
      } : {}),
      ...(kind === "mastery" ? {
        "onboarding.identity.masteryFocus": hero,
        "onboarding.identity.masteryFocusAt": serverTimestamp(),
      } : {}),

      // Step-lock model
      "onboarding.locks.step8": true,

      updatedAt: serverTimestamp(),
    });

    setStatus("Saved.");
    window.location.href = `/athlete-onboarding/step-9.html?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error(e);
    setStatus("Save failed. Check console.");
    nextBtn.disabled = false;
  }
});
