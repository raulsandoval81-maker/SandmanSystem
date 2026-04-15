// ======================================================
// Athlete Onboarding — Step 7 (Finisher)
// No Back. Live with your choice.
// Writes: athletes/{uid} onboarding.selfAssess.finisher (boolean)
// ======================================================

import {
  db,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const params = new URLSearchParams(window.location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
if (!uid) { alert("Missing ?id="); throw new Error("Missing ?id="); }

const statusEl = document.getElementById("status");
const btnYes   = document.getElementById("btn-yes");
const btnNo    = document.getElementById("btn-no");
const nextBtn  = document.getElementById("btn-next");

const setStatus = (t) => statusEl && (statusEl.textContent = t || "");

let selected = null;
let athlete = null;

function lockChoice() {
  if (btnYes) btnYes.disabled = true;
  if (btnNo)  btnNo.disabled  = true;
}

function unlockChoice() {
  if (btnYes) btnYes.disabled = false;
  if (btnNo)  btnNo.disabled  = false;
}

function enableNext() {
  if (nextBtn) nextBtn.disabled = false;
}

function disableNext() {
  if (nextBtn) nextBtn.disabled = true;
}

// --------------------------------
// BOOT: ensure auth + load lock state
// --------------------------------
async function boot() {
  try {
    disableNext();
    setStatus("");

    // 🔐 REQUIRED so request.auth exists (phone)
    await ensureSignedIn();

    const snap = await getDoc(doc(db, "athletes", uid));
    athlete = snap.exists() ? (snap.data() || {}) : null;

    // If Step 7 already locked, forward immediately
    if (athlete?.onboarding?.locks?.step7 === true) {
      window.location.href = `/athlete-onboarding/step-8.html?id=${encodeURIComponent(uid)}`;
      return;
    }
  } catch (e) {
    console.error(e);
    setStatus("Auth/load failed.");
    lockChoice();
    disableNext();
  }
}

boot();

async function saveChoice(val) {
  // ✅ Client-side write-once guard (rules will enforce later)
  if (athlete?.onboarding?.locks?.step7 === true) {
    window.location.href = `/athlete-onboarding/step-8.html?id=${encodeURIComponent(uid)}`;
    return;
  }

  try {
    selected = val;
    lockChoice();
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",

      // Step 7 completed → next step is 8
      "onboarding.step": 8,

      "onboarding.selfAssess.finisher": !!val,
      "onboarding.selfAssess.finisherAt": serverTimestamp(),

      // Step-lock model
      "onboarding.locks.step7": true,

      updatedAt: serverTimestamp(),
    });

    setStatus(val ? "Saved: Yes" : "Saved: No");
    enableNext();
  } catch (e) {
    console.error(e);
    setStatus("Save failed. Refresh and try again.");
    // allow retry if save fails
    unlockChoice();
    disableNext();
  }
}

btnYes && (btnYes.onclick = () => saveChoice(true));
btnNo  && (btnNo.onclick  = () => saveChoice(false));

nextBtn && (nextBtn.onclick = () => {
  if (selected === null) return setStatus("Choose Yes or No.");
  window.location.href = `/athlete-onboarding/step-8.html?id=${encodeURIComponent(uid)}`;
});