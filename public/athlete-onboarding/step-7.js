// ======================================================
// Athlete Onboarding — Step 7 (Finisher)
// No Back. Live with your choice.
// Writes: athletes/{uid} onboarding.selfAssess.finisher (boolean)
// ======================================================

import { db, doc, updateDoc, serverTimestamp } from "../assets/js/firebase-init.js";

const params = new URLSearchParams(window.location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
if (!uid) { alert("Missing ?id="); throw new Error("Missing ?id="); }

const statusEl = document.getElementById("status");
const btnYes   = document.getElementById("btn-yes");
const btnNo    = document.getElementById("btn-no");
const nextBtn  = document.getElementById("btn-next");

const setStatus = (t) => statusEl && (statusEl.textContent = t || "");

let selected = null;

function lockChoice() {
  if (btnYes) btnYes.disabled = true;
  if (btnNo)  btnNo.disabled  = true;
}

function enableNext() {
  if (nextBtn) nextBtn.disabled = false;
}

async function saveChoice(val) {
  try {
    selected = val;
    lockChoice();
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",
      "onboarding.step": 7,
      "onboarding.selfAssess.finisher": !!val,
      "onboarding.selfAssess.finisherAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setStatus(val ? "Saved: Yes" : "Saved: No");
    enableNext();
  } catch (e) {
    console.error(e);
    setStatus("Save failed. Refresh and try again.");
    // allow retry if save fails
    if (btnYes) btnYes.disabled = false;
    if (btnNo)  btnNo.disabled  = false;
  }
}

btnYes && (btnYes.onclick = () => saveChoice(true));
btnNo  && (btnNo.onclick  = () => saveChoice(false));

nextBtn && (nextBtn.onclick = () => {
  if (selected === null) return setStatus("Choose Yes or No.");
  window.location.href = `/athlete-onboarding/step-8.html?id=${encodeURIComponent(uid)}`;
});
