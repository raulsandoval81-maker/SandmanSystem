import "./journey-eligibility.js";

import {
  db,
  doc,
  getDoc,
  onSnapshot
} from "../assets/js/firebase-init.js";

const tokenId = String(
  new URLSearchParams(location.search)
    .get("token") || ""
).trim();

if (tokenId) {
  const intakeRef = doc(db, "intakes", tokenId);
  const statusEl = document.getElementById("approve-status");
  const approveBtn = document.getElementById("btn-approve");
  const uidInput = document.getElementById("c-uid");
  let committedUid = "";

  function applyCommittedActivation(
    intake = {},
    { recoveredFromError = false } = {}
  ) {
    const status = String(intake.status || "").trim().toLowerCase();
    const approvedUid = String(intake.approvedUid || "").trim();

    if (status !== "approved" || !approvedUid) return false;

    committedUid = approvedUid;

    if (uidInput) uidInput.value = approvedUid;

    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.removeAttribute("aria-busy");
      approveBtn.classList.remove("is-busy");
    }

    if (statusEl) {
      statusEl.textContent = recoveredFromError
        ? `✓ Activation complete (${approvedUid}). The athlete record was committed; a supplemental notification or legacy follow-up may still need attention.`
        : `✓ Activation complete (${approvedUid}).`;
    }

    return true;
  }

  onSnapshot(
    intakeRef,
    (snapshot) => {
      if (snapshot.exists()) {
        applyCommittedActivation(snapshot.data() || {});
      }
    },
    (error) => {
      console.warn("[activation-success-watch] listener failed:", error);
    }
  );

  if (statusEl) {
    const observer = new MutationObserver(async () => {
      const text = String(statusEl.textContent || "").toLowerCase();
      if (!text.includes("approve failed")) return;

      try {
        const snapshot = await getDoc(intakeRef);
        if (snapshot.exists()) {
          applyCommittedActivation(
            snapshot.data() || {},
            { recoveredFromError: true }
          );
        }
      } catch (error) {
        console.warn("[activation-success-watch] recovery check failed:", error);
      }
    });

    observer.observe(statusEl, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  window.addEventListener("pageshow", async () => {
    if (committedUid) return;

    try {
      const snapshot = await getDoc(intakeRef);
      if (snapshot.exists()) {
        applyCommittedActivation(snapshot.data() || {});
      }
    } catch (error) {
      console.warn("[activation-success-watch] pageshow check failed:", error);
    }
  });
}
