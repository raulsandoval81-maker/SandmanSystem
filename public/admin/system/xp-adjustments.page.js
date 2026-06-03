import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import { requireAdmin } from "/assets/js/admin-guard.js";

import { db } from "/assets/js/firebase-init.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

import {
  applyXpAdjustment
} from "/admin/services/admin.service.js?v=3";
const auth = getAuth();

onAuthStateChanged(auth, (user) => {
  console.log("AUTH UID:", user?.uid);
});

console.log("[xp-adjustments] JS loaded");

const uidEl = document.getElementById("uid");
const amountEl = document.getElementById("amount");
const kindEl = document.getElementById("kind");
const noteEl = document.getElementById("note");

const statusEl = document.getElementById("status");
const btnApply = document.getElementById("btnApply");

const previewEl = document.getElementById("athletePreview");

function setStatus(message, isError = false) {
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff8a8a" : "#9ca3af";
}

async function previewAthlete(uid) {

  const athleteId = String(uid || "")
    .trim()
    .toUpperCase();

  if (!previewEl) return;

  if (!athleteId) {
    previewEl.innerHTML = "";
    return;
  }

  try {

    previewEl.innerHTML = "Checking athlete...";

    const ref = doc(db, "athletes", athleteId);

    const snap = await getDoc(ref);

    if (!snap.exists()) {

      previewEl.innerHTML = `
        <div class="bad">
          Athlete not found.
        </div>
      `;

      return;
    }

    const a = snap.data() || {};

    const athleteName =
      a.name ||
      a.athleteName ||
      a.displayName ||
      a.fullName ||
      [a.firstName, a.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Unnamed Athlete";

    previewEl.innerHTML = `
      <div class="athlete-preview-card">

        <strong>
          ${athleteName}
        </strong>

        <div>
          ${a.journey || a.track || "—"}
        </div>

        <div>
          ${a.tier || "—"} · Combat ${Number(a.xp || 0)} XP
        </div>

        <div>
          Strength ${Number(a.xpStrength || 0)} XP · Honor ${Number(a.xpHonor || 0)} XP
        </div>

      </div>
    `;

  } catch (err) {

    console.error(
      "[xp-adjustments] preview failed:",
      err
    );

    previewEl.innerHTML = `
      <div class="bad">
        Preview failed.
      </div>
    `;
  }
}

uidEl?.addEventListener("input", () => {
  previewAthlete(uidEl.value);
});

uidEl?.addEventListener("blur", () => {
  previewAthlete(uidEl.value);
});

uidEl?.addEventListener("change", () => {
  previewAthlete(uidEl.value);
});

btnApply?.addEventListener("click", async () => {

  console.log(
    "[xp-adjustments] button clicked"
  );

  try {

    btnApply.disabled = true;

    setStatus("Applying adjustment...");

    const result = await applyXpAdjustment({
      uid: uidEl.value,
      amount: Number(amountEl.value),
      kind: kindEl.value,
      note: noteEl.value
    });

    setStatus(
      `Applied ${result.amount} XP to ${result.uid}.`
    );

    amountEl.value = "";
    noteEl.value = "";

    await previewAthlete(uidEl.value);

  } catch (err) {

    console.error(
      "[xp-adjustments] apply failed:",
      err
    );

    setStatus(
      err?.message || "Adjustment failed.",
      true
    );

  } finally {

    btnApply.disabled = false;
  }
});

await requireAdmin();