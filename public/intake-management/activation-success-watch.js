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

function buildMintTagFromUid(uid = "", virtue = "") {
  const safeUid = String(uid || "").trim().toUpperCase();
  const safeVirtue = String(virtue || "").trim().toUpperCase();
  if (!safeUid || !safeVirtue) return "";

  const [prefix, serialRaw = ""] = safeUid.split("_");
  const serial = String(serialRaw || "").padStart(4, "0");
  if (!prefix || !serial) return "";

  return `${prefix}_CB${serial}_${safeVirtue}`;
}

function getAthleteAccessToken(intake = {}) {
  return String(
    intake.athleteAccessInvitationToken ||
    intake.athleteAccessToken ||
    intake.athleteInvitationToken ||
    ""
  ).trim();
}

function configureHandoffLinks(uid = "", intake = {}) {
  const approvedUid = String(uid || "").trim();
  if (!approvedUid) return;

  const athleteAccessToken = getAthleteAccessToken(intake);
  const onboarding = athleteAccessToken
    ? `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(approvedUid)}&token=${encodeURIComponent(athleteAccessToken)}`
    : "";
  const parentLink = `${location.origin}/parent/`;

  const modal = document.getElementById("approval-modal");
  const modalTitle = modal?.querySelector("h2");
  const modalIntro = modal?.querySelector("p");
  const approvedUidInput = document.getElementById("approved-athlete-uid");
  const onboardingInput = document.getElementById("onboarding-link");
  const parentInput = document.getElementById("parent-my-athlete-link");
  const copyUid = document.getElementById("copy-athlete-uid");
  const copyOnboarding = document.getElementById("copy-link");
  const openOnboarding = document.getElementById("open-link");
  const copyParent = document.getElementById("copy-parent-link");
  const openParent = document.getElementById("open-parent-link");

  if (modalTitle) modalTitle.textContent = "Athlete Activated";
  if (modalIntro) {
    modalIntro.textContent = athleteAccessToken
      ? "Activation is complete. Continue athlete onboarding and provide parent access below."
      : "Activation is complete. Parent access is ready. Direct Athlete onboarding requires a Management-issued Athlete access invitation first.";
  }

  const labels = modal?.querySelectorAll("label.small.muted") || [];
  labels.forEach((label) => {
    const text = String(label.textContent || "").trim();
    if (text === "Management / Athlete Onboarding") {
      label.textContent = "Athlete Onboarding Link";
    }
  });

  if (approvedUidInput) approvedUidInput.value = approvedUid;
  if (onboardingInput) {
    onboardingInput.value = onboarding || "Issue Athlete access invitation before onboarding";
    onboardingInput.readOnly = true;
    onboardingInput.setAttribute(
      "aria-label",
      onboarding
        ? "Athlete onboarding invitation link"
        : "Athlete onboarding unavailable until Management issues an Athlete access invitation"
    );
  }
  if (parentInput) parentInput.value = parentLink;

  if (copyUid) {
    copyUid.onclick = () => navigator.clipboard.writeText(approvedUid);
  }

  if (copyOnboarding) {
    copyOnboarding.disabled = !onboarding;
    copyOnboarding.onclick = onboarding
      ? () => navigator.clipboard.writeText(onboarding)
      : null;
    copyOnboarding.title = onboarding
      ? "Copy Athlete onboarding invitation link"
      : "Issue an Athlete access invitation from Management first";
  }

  if (openOnboarding) {
    openOnboarding.disabled = !onboarding;
    openOnboarding.onclick = onboarding
      ? () => window.open(onboarding, "_blank", "noopener")
      : null;
    openOnboarding.title = onboarding
      ? "Open Athlete onboarding invitation link"
      : "Issue an Athlete access invitation from Management first";
  }

  if (copyParent) {
    copyParent.onclick = () => navigator.clipboard.writeText(parentLink);
  }

  if (openParent) {
    openParent.onclick = () => window.open(parentLink, "_blank", "noopener");
  }

  modal?.classList.remove("hidden");
}

function applyCompletedReviewUI(intake = {}) {
  const approvedUid = String(intake.approvedUid || "").trim();
  if (!approvedUid) return;

  const pageTitle = document.getElementById("reviewPageTitle");
  const pageSubtitle = document.getElementById("reviewPageSubtitle");
  const correctionsCard = document.querySelector(
    'section[aria-labelledby="confirm-title"]'
  );
  const correctionsTitle = document.getElementById("confirm-title");
  const correctionsBadge = correctionsCard?.querySelector(".status-pill");
  const journeyCard = document.getElementById("journeyPickerCard");
  const journeyTitle = document.getElementById("mint-title");
  const journeyBadge = journeyCard?.querySelector(".status-pill");
  const journeyGrid = journeyCard?.querySelector(".mint-grid");
  const journeyNote = document.getElementById("journeyEligibilityNote");
  const identityCard = document.getElementById("mint-box");
  const identityBadge = identityCard?.querySelector(".status-pill");
  const approveCard = document.getElementById("approveCard");
  const mintTagInput = document.getElementById("mint-tag-output");
  const virtueSelect = document.getElementById("mint-virtue");

  if (pageTitle) pageTitle.textContent = "Enrollment Complete";
  if (pageSubtitle) {
    pageSubtitle.textContent =
      "The athlete is activated. Review the confirmed record and use the handoff links to continue setup.";
  }

  if (correctionsTitle) correctionsTitle.textContent = "Confirmed Athlete Record";
  if (correctionsBadge) correctionsBadge.textContent = "Activation Locked";

  correctionsCard
    ?.querySelectorAll("input, select, textarea, button")
    .forEach((control) => {
      control.disabled = true;
      control.setAttribute("aria-disabled", "true");
    });

  if (journeyTitle) journeyTitle.textContent = "Confirmed Placement";
  if (journeyBadge) journeyBadge.textContent = "Activated";
  if (journeyGrid) journeyGrid.hidden = true;
  if (journeyNote) journeyNote.hidden = true;

  journeyCard
    ?.querySelectorAll("button")
    .forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });

  if (identityBadge) identityBadge.textContent = "Activated";
  if (virtueSelect) {
    virtueSelect.disabled = true;
    virtueSelect.setAttribute("aria-disabled", "true");
  }

  const committedMintTag = String(
    intake.mintVirtueTag ||
    intake.mintVirtueTagDisplay ||
    intake.mintVirtueTagSerial ||
    ""
  ).trim();

  const fallbackMintTag = buildMintTagFromUid(
    approvedUid,
    intake.virtueName || virtueSelect?.value || ""
  );

  if (mintTagInput) {
    mintTagInput.value = committedMintTag || fallbackMintTag || mintTagInput.value;
  }

  if (approveCard) approveCard.hidden = true;

  configureHandoffLinks(approvedUid, intake);
}

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

    applyCompletedReviewUI(intake);
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
