import "./journey-eligibility.js";

import {
  db,
  doc,
  getDoc,
  onSnapshot,
  functions,
  httpsCallable
} from "../assets/js/firebase-init.js";

const tokenId = String(
  new URLSearchParams(location.search)
    .get("token") || ""
).trim();

const issueAccessInvitationCall =
  httpsCallable(functions, "issueAccessInvitation");

let issuedAthleteAccessToken = "";
let issuedAthleteAccessUid = "";

function buildMintTagFromUid(uid = "", virtue = "") {
  const safeUid = String(uid || "").trim().toUpperCase();
  const safeVirtue = String(virtue || "").trim().toUpperCase();
  if (!safeUid || !safeVirtue) return "";

  const [prefix, serialRaw = ""] = safeUid.split("_");
  const serial = String(serialRaw || "").padStart(4, "0");
  if (!prefix || !serial) return "";

  return `${prefix}_CB${serial}_${safeVirtue}`;
}

function getAthleteAccessToken(intake = {}, uid = "") {
  const approvedUid = String(uid || "").trim().toUpperCase();

  if (
    issuedAthleteAccessToken &&
    issuedAthleteAccessUid === approvedUid
  ) {
    return issuedAthleteAccessToken;
  }

  return String(
    intake.athleteAccessInvitationToken ||
    intake.athleteAccessToken ||
    intake.athleteInvitationToken ||
    ""
  ).trim();
}

function getDobFromIntake(intake = {}) {
  return String(
    intake.managementCorrections?.dob?.corrected ||
    intake.dob ||
    intake.athlete?.dob ||
    ""
  ).trim();
}

function getAgeFromDob(dob = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob).trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  const dayDiff = now.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function defaultAthleteAccessMode(uid = "", intake = {}) {
  if (String(uid || "").toUpperCase().startsWith("F8_")) {
    return "hybrid";
  }

  const age = getAgeFromDob(getDobFromIntake(intake));
  if (age === null || age < 18) return "hybrid";
  return "self_managed";
}

function buildAthleteOnboardingLink(uid = "", invitationToken = "") {
  const approvedUid = String(uid || "").trim();
  const token = String(invitationToken || "").trim();
  if (!approvedUid || !token) return "";

  return `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(approvedUid)}&token=${encodeURIComponent(token)}`;
}

function configureHandoffLinks(uid = "", intake = {}) {
  const approvedUid = String(uid || "").trim();
  if (!approvedUid) return;

  const athleteAccessToken = getAthleteAccessToken(intake, approvedUid);
  const onboarding = buildAthleteOnboardingLink(
    approvedUid,
    athleteAccessToken
  );
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
  const accessEmail = document.getElementById("athlete-access-email");
  const accessMode = document.getElementById("athlete-access-mode");
  const parentApproved = document.getElementById("athlete-parent-approved");
  const parentApprovalRow = document.getElementById("athlete-parent-approval-row");
  const issueAccessBtn = document.getElementById("issue-athlete-access");
  const accessStatus = document.getElementById("athlete-access-status");

  if (modalTitle) modalTitle.textContent = "Athlete Activated";
  if (modalIntro) {
    modalIntro.textContent = athleteAccessToken
      ? "Activation is complete. Athlete onboarding and parent access are ready below."
      : "Activation is complete. Issue secure Athlete access before using the onboarding link.";
  }

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

  if (accessMode && !accessMode.dataset.initialized) {
    accessMode.value = defaultAthleteAccessMode(approvedUid, intake);
    accessMode.dataset.initialized = "true";
  }

  const syncParentApproval = () => {
    const hybrid = accessMode?.value === "hybrid";
    if (parentApprovalRow) parentApprovalRow.hidden = !hybrid;
    if (parentApproved && !hybrid) parentApproved.checked = false;
  };

  if (accessMode) {
    accessMode.onchange = syncParentApproval;
    syncParentApproval();
  }

  if (athleteAccessToken) {
    if (accessEmail) accessEmail.disabled = true;
    if (accessMode) accessMode.disabled = true;
    if (parentApproved) parentApproved.disabled = true;
    if (issueAccessBtn) issueAccessBtn.disabled = true;
    if (accessStatus) {
      accessStatus.textContent =
        "Athlete access invitation issued. Use the onboarding link below.";
    }
  } else {
    if (accessEmail) accessEmail.disabled = false;
    if (accessMode) accessMode.disabled = false;
    if (parentApproved) parentApproved.disabled = false;
    if (issueAccessBtn) issueAccessBtn.disabled = false;

    if (issueAccessBtn) {
      issueAccessBtn.onclick = async () => {
        const email = String(accessEmail?.value || "")
          .trim()
          .toLowerCase();
        const mode = String(accessMode?.value || "").trim();
        const approvalRecorded = parentApproved?.checked === true;

        if (!email || !email.includes("@")) {
          if (accessStatus) {
            accessStatus.textContent =
              "Enter the Athlete login email before issuing access.";
          }
          accessEmail?.focus();
          return;
        }

        if (mode === "hybrid" && !approvalRecorded) {
          if (accessStatus) {
            accessStatus.textContent =
              "Record Parent / guardian approval before issuing Hybrid Athlete access.";
          }
          parentApproved?.focus();
          return;
        }

        issueAccessBtn.disabled = true;
        if (accessEmail) accessEmail.disabled = true;
        if (accessMode) accessMode.disabled = true;
        if (parentApproved) parentApproved.disabled = true;
        if (accessStatus) accessStatus.textContent = "Issuing secure Athlete access…";

        try {
          const response = await issueAccessInvitationCall({
            role: "athlete",
            athleteUid: approvedUid,
            email,
            accessMode: mode,
            parentApproved: mode === "hybrid" ? approvalRecorded : false
          });

          const result = response?.data || {};
          const invitationToken = String(result.tokenId || "").trim();

          if (!invitationToken) {
            throw new Error("Invitation was created without a token.");
          }

          issuedAthleteAccessUid = approvedUid.toUpperCase();
          issuedAthleteAccessToken = invitationToken;

          const generatedLink = buildAthleteOnboardingLink(
            approvedUid,
            invitationToken
          );

          if (onboardingInput) onboardingInput.value = generatedLink;
          if (copyOnboarding) {
            copyOnboarding.disabled = false;
            copyOnboarding.onclick = () => navigator.clipboard.writeText(generatedLink);
          }
          if (openOnboarding) {
            openOnboarding.disabled = false;
            openOnboarding.onclick = () => window.open(generatedLink, "_blank", "noopener");
          }

          if (accessStatus) {
            const expires = Number(result.exp || 0);
            accessStatus.textContent = expires
              ? `Athlete access issued. Invitation expires ${new Date(expires).toLocaleString()}.`
              : "Athlete access issued. Use the onboarding link below.";
          }

          if (modalIntro) {
            modalIntro.textContent =
              "Activation is complete. Athlete onboarding and parent access are ready below.";
          }
        } catch (error) {
          console.error("[athlete-access] issue invitation failed:", error);

          if (accessStatus) {
            accessStatus.textContent =
              error?.message || "Unable to issue Athlete access invitation.";
          }

          issueAccessBtn.disabled = false;
          if (accessEmail) accessEmail.disabled = false;
          if (accessMode) accessMode.disabled = false;
          if (parentApproved) parentApproved.disabled = false;
        }
      };
    }
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
