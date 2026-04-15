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
const nextBtn  = document.getElementById("btn-next");
const scoreEl  = document.getElementById("strong-score");
const valEl    = document.getElementById("strong-val");

const setStatus = (t) => { if (statusEl) statusEl.textContent = t || ""; };

if (scoreEl && valEl) {
  valEl.textContent = String(scoreEl.value || "7");
  scoreEl.addEventListener("input", () => { valEl.textContent = String(scoreEl.value); });
}

// --------------------------------
// BOOT: ensure auth + load lock state
// --------------------------------
let athlete = null;

async function boot() {
  try {
    // 🔐 REQUIRED so request.auth exists (phone)
    await ensureSignedIn();

    const snap = await getDoc(doc(db, "athletes", uid));
    athlete = snap.exists() ? (snap.data() || {}) : null;

    // If Step 3 already locked, forward immediately
    if (athlete?.onboarding?.locks?.step3 === true) {
      window.location.href = `/athlete-onboarding/step-4.html?id=${encodeURIComponent(uid)}`;
      return;
    }

    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("Auth/load failed.");
    if (nextBtn) nextBtn.disabled = true;
  }
}

boot();

nextBtn && (nextBtn.onclick = async () => {
  const v = Number(String(scoreEl?.value ?? "").trim());
  if (!Number.isFinite(v) || v < 1 || v > 10) return setStatus("Enter a number from 1 to 10.");

  try {
    nextBtn.disabled = true;
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",

      // Step 3 completed → next step is 4
      "onboarding.step": 4,

      "onboarding.selfAssess.strong": v,
      "onboarding.selfAssess.strongAt": serverTimestamp(),

      // Step-lock model
      "onboarding.locks.step3": true,

      updatedAt: serverTimestamp(),
    });

    window.location.href = `/athlete-onboarding/step-4.html?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error(e);
    setStatus("Save failed.");
    nextBtn.disabled = false;
  }
});