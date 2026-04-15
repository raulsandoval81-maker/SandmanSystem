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

// --------------------------------
// BOOT: ensure auth + load lock state
// --------------------------------
async function boot() {
  try {
    // 🔐 REQUIRED so request.auth exists (phone)
    await ensureSignedIn();

    const snap = await getDoc(doc(db, "athletes", uid));
    athlete = snap.exists() ? (snap.data() || {}) : null;

    // If Step 8 already locked, forward immediately
    if (athlete?.onboarding?.locks?.step8 === true) {
      window.location.href = `/athlete-onboarding/step-9.html?id=${encodeURIComponent(uid)}`;
      return;
    }
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

  // Require at least hero. Legend optional (but encouraged).
  if (!hero) return setStatus("Type your childhood hero (one name).");
  // If you want BOTH required, uncomment:
  // if (!legend) return setStatus("Type your future legend (one name).");

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

      "onboarding.identity.childhoodHero": hero,
      "onboarding.identity.childhoodHeroAt": serverTimestamp(),

      // Optional but supported (write-once: blank stays blank)
      ...(legend ? {
        "onboarding.identity.futureLegend": legend,
        "onboarding.identity.futureLegendAt": serverTimestamp(),
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