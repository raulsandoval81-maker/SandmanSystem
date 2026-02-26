// ======================================================
// Athlete Onboarding — Step 8 (Hero + Legend)
// Reads/Writes: athletes/{uid}
// Fields written:
//   onboarding.identity.childhoodHero
//   onboarding.identity.futureLegend
// ======================================================

import { db, doc, updateDoc, serverTimestamp } from "../assets/js/firebase-init.js";

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

nextBtn?.addEventListener("click", async () => {
  const hero = (heroEl?.value || "").trim();
  const legend = (legendEl?.value || "").trim();

  // Require at least hero. Legend optional (but encouraged).
  if (!hero) return setStatus("Type your childhood hero (one name).");
  // If you want BOTH required, uncomment:
  // if (!legend) return setStatus("Type your future legend (one name).");

  try {
    nextBtn.disabled = true;
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",
      "onboarding.step": 8,

      "onboarding.identity.childhoodHero": hero,
      "onboarding.identity.childhoodHeroAt": serverTimestamp(),

      // Optional but supported
      ...(legend ? {
        "onboarding.identity.futureLegend": legend,
        "onboarding.identity.futureLegendAt": serverTimestamp(),
      } : {}),

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
