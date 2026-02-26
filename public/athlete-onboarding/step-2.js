import { db, doc, updateDoc, serverTimestamp } from "../assets/js/firebase-init.js";

const params = new URLSearchParams(window.location.search);
const uid = (params.get("id") || params.get("uid") || "").trim().toUpperCase();
if (!uid) { alert("Missing ?id="); throw new Error("Missing ?id="); }

const statusEl = document.getElementById("status");
const nextBtn  = document.getElementById("btn-next");
const scoreEl  = document.getElementById("honor-score");
const valEl    = document.getElementById("honor-val");

const setStatus = (t) => { if (statusEl) statusEl.textContent = t || ""; };

if (scoreEl && valEl) {
  valEl.textContent = String(scoreEl.value || "7");
  scoreEl.addEventListener("input", () => { valEl.textContent = String(scoreEl.value); });
}

nextBtn && (nextBtn.onclick = async () => {
  const v = Number(String(scoreEl?.value ?? "").trim());
  if (!Number.isFinite(v) || v < 1 || v > 10) return setStatus("Enter a number from 1 to 10.");

  try {
    nextBtn.disabled = true;
    setStatus("Saving…");

    await updateDoc(doc(db, "athletes", uid), {
      "onboarding.version": "v1",
      "onboarding.status": "in_progress",
      "onboarding.step": 2,
      "onboarding.selfAssess.honor": v,
      "onboarding.selfAssess.honorAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    window.location.href = `/athlete-onboarding/step-3.html?id=${encodeURIComponent(uid)}`;
  } catch (e) {
    console.error(e);
    setStatus("Save failed.");
    nextBtn.disabled = false;
  }
});
