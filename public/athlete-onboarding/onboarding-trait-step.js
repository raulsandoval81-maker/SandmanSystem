import { db, doc, getDoc, updateDoc, serverTimestamp, ensureSignedIn } from "/assets/js/firebase-init.js";
import { resolveOnboardingTemplate } from "./onboarding-templates.js";

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

export function runTraitStep({ trait, step, nextStep, inputId, valueId }) {
  const params = new URLSearchParams(window.location.search);
  const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
  if (!uid) { alert("Missing ?id="); throw new Error("Missing ?id="); }

  const statusEl = document.getElementById("status");
  const nextBtn = document.getElementById("btn-next");
  const scoreEl = document.getElementById(inputId);
  const valEl = document.getElementById(valueId);
  const scale = scoreEl?.closest(".scale");
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text || ""; };
  let athlete = null;
  let answerMode = "numeric";
  let selected = null;

  function installYesNo() {
    if (!scale) return;
    scale.innerHTML = `<div class="row onboarding-choice-row" role="group" aria-label="Choose an answer"><button id="trait-yes" class="btn solid-gold" type="button">Yes</button><button id="trait-no" class="btn solid-dark" type="button">Not yet</button></div>`;
    const yes = document.getElementById("trait-yes");
    const no = document.getElementById("trait-no");
    const choose = (value) => {
      selected = value;
      yes?.setAttribute("aria-pressed", String(value === true));
      no?.setAttribute("aria-pressed", String(value === false));
      nextBtn.disabled = false;
    };
    yes?.addEventListener("click", () => choose(true));
    no?.addEventListener("click", () => choose(false));
    nextBtn.disabled = true;
  }

  async function boot() {
    try {
      await ensureSignedIn();
      const snap = await getDoc(doc(db, "athletes", uid));
      athlete = snap.exists() ? (snap.data() || {}) : null;
      if (!athlete) throw new Error("Athlete not found.");
      if (athlete.onboarding?.locks?.[`step${step}`] === true) {
        window.location.href = `/athlete-onboarding/step-${nextStep}.html?id=${encodeURIComponent(uid)}`;
        return;
      }
      const resolved = resolveOnboardingTemplate(athlete);
      const copy = resolved.template.traits[trait];
      answerMode = resolved.template.answerMode;
      document.body.dataset.onboardingTemplate = resolved.templateKey;
      setText("h1", copy.heading);
      setText(".sub", copy.question);
      setText(".card h2", copy.question);
      setText(".card .muted.small", copy.helper);
      setText(".progress .pill", `Step ${step} of 10`);
      if (answerMode === "yes_no") {
        const label = document.querySelector(`label[for="${inputId}"]`);
        if (label) label.hidden = true;
        installYesNo();
      } else if (scoreEl && valEl) {
        valEl.textContent = String(scoreEl.value || "7");
        scoreEl.addEventListener("input", () => { valEl.textContent = String(scoreEl.value); });
      }
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus("Auth/load failed.");
      if (nextBtn) nextBtn.disabled = true;
    }
  }

  nextBtn?.addEventListener("click", async () => {
    const value = answerMode === "yes_no" ? selected : Number(String(scoreEl?.value ?? "").trim());
    if (answerMode === "yes_no" && typeof value !== "boolean") return setStatus("Choose Yes or Not yet.");
    if (answerMode === "numeric" && (!Number.isFinite(value) || value < 1 || value > 10)) return setStatus("Enter a number from 1 to 10.");
    try {
      nextBtn.disabled = true;
      setStatus("Saving…");
      await updateDoc(doc(db, "athletes", uid), {
        "onboarding.version": "v1",
        "onboarding.status": "in_progress",
        "onboarding.step": nextStep,
        [`onboarding.selfAssess.${trait}`]: value,
        [`onboarding.selfAssess.${trait}At`]: serverTimestamp(),
        [`onboarding.locks.step${step}`]: true,
        updatedAt: serverTimestamp(),
      });
      window.location.href = `/athlete-onboarding/step-${nextStep}.html?id=${encodeURIComponent(uid)}`;
    } catch (error) {
      console.error(error);
      setStatus("Save failed.");
      nextBtn.disabled = false;
    }
  });

  boot();
}
