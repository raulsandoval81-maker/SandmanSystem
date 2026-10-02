// ======================================================
// Management Enrollment — Review & Mint (TOKEN FLOW)
// Sandman Systems™
//
// Updated:
// - Keeps existing F8 / F4 mint flow intact
// - Adds framework/programTrack/art placement bridge
// - Uses Management-confirmed athlete identity at activation
// - Preserves the submitted intake as the read-only source record
// - Does NOT rewrite XP engine
// ======================================================

import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable,
  ensureSignedIn
} from "../assets/js/firebase-init.js";

import {
  renderManagementLifecycle
} from "/assets/js/management-lifecycle.js";

ensureSignedIn().catch(console.error);

const $ = (id) => document.getElementById(id);

const DEFAULT_LOCATION_ID = "lompoc";
const DEFAULT_COACH_IDS = ["coach_sandoval"];

// ------------------------------------------------------
// URL → tokenId (REVIEW PAGE)
// ------------------------------------------------------
const params = new URLSearchParams(location.search);
const tokenId = (params.get("token") || "").trim();
const approveIntakeCall =
  httpsCallable(functions, "approveIntakeCall");

if (!tokenId) {
  alert("Missing ?token= in URL");
  throw new Error("Missing ?token=");
}

const intakeRef = doc(db, "intakes", tokenId);

let INTAKE_CACHE = null;

function renderIntakeLifecycle(intake = {}) {
  const activated =
    intake.status === "approved" &&
    Boolean(intake.approvedUid);

  renderManagementLifecycle(
    $("intakeLifecycle"),
    activated
      ? {
          currentStage: "intake-activation",
          completedThrough: "checkout-enrollment",
          currentLabel: "Activation Complete",
          caseLabel: intake.approvedUid,
          guidance:
            "This intake has an approved athlete UID and requires no further activation action."
        }
      : {
          currentStage: "intake-activation",
          completedThrough: "checkout-enrollment",
          currentLabel: "Intake Review",
          caseLabel: tokenId,
          guidance:
            "Review the submitted intake, correct athlete details if needed, then approve and activate."
        }
  );
}

function applyActivatedCompletionView(uid, intake = {}) {
  const corrections =
    $("reviewCorrectionsCard");

  const decisions =
    $("reviewDecisionStack");

  if (corrections) {
    corrections.hidden = true;
  }

  if (decisions) {
    decisions.hidden = true;
  }

  const pageTitle =
    $("reviewPageTitle");

  const pageSubtitle =
    $("reviewPageSubtitle");

  const nextStep =
    $("activationNextStep");

  const audience =
    intakeAudienceFromRecord(intake);

  const isAdult =
    audience === "adult_athlete";

  if (pageTitle) {
    pageTitle.textContent =
      "Enrollment Complete";
  }

  if (pageSubtitle) {
    pageSubtitle.textContent =
      isAdult
        ? "The athlete is activated. Athlete first-time access is the next account step; Coach handles training and development from here."
        : "The athlete is activated. Parent first-time access is the next account step; Coach handles training and development from here.";
  }

  if (nextStep) {
    nextStep.textContent =
      isAdult
        ? "Enrollment activation is complete. Issue Athlete first-time access from Recently Activated when the athlete is ready to register. Coach handles training, placement, development, and any athletic follow-up."
        : "Enrollment activation is complete. Issue Parent first-time access from Recently Activated when the family is ready to register. Coach handles training, placement, development, and any athletic follow-up.";
  }

  document.body.classList.add(
    "is-activation-complete"
  );

  if ($("approved-athlete-uid")) {
    $("approved-athlete-uid").value =
      uid;
  }

  wireActivatedUidActions(
    uid,
    intake
  );
}

// ------------------------------------------------------
// Activated UID handoff actions
// ------------------------------------------------------
function activatedContact(intake = {}) {
  const audience =
    intakeAudienceFromRecord(intake);

  const isAdult =
    audience === "adult_athlete";

  const email =
    String(
      isAdult
        ? intake.athlete?.email || intake.email || intake.athleteEmail || ""
        : intake.parent?.email || intake.parentEmail || intake.email || ""
    )
      .trim()
      .toLowerCase();

  const phone =
    String(
      isAdult
        ? intake.athlete?.phoneDigits || intake.phoneDigits || intake.athletePhoneDigits || ""
        : intake.parent?.phoneDigits || intake.parentPhoneDigits || intake.phoneDigits || ""
    )
      .replace(/\D/g, "");

  const athleteName =
    `${intake.first || intake.athlete?.first || ""} ${intake.last || intake.athlete?.last || ""}`
      .trim() ||
    "Sandman Athlete";

  return {
    audience,
    isAdult,
    email,
    phone,
    athleteName
  };
}

function uidMessage(uid, intake = {}) {
  const {
    isAdult,
    athleteName
  } = activatedContact(intake);

  const subject =
    `Sandman Combat Athlete UID — ${athleteName}`;

  const body =
    isAdult
      ? [
          `${athleteName} is activated in Sandman Combat™.`,
          "",
          `Athlete UID: ${uid}`,
          "",
          "Keep this UID for athlete identification and support. Your Sandman Combat™ Athlete first-time access link is a separate registration step."
        ].join("\n")
      : [
          `${athleteName} is activated in Sandman Combat™.`,
          "",
          `Athlete UID: ${uid}`,
          "",
          "Keep this UID for athlete identification and support. Your Sandman Combat™ Parent first-time access link is a separate registration step."
        ].join("\n");

  return {
    subject,
    body
  };
}

function wireActivatedUidActions(uid, intake = {}) {
  const {
    email,
    phone
  } = activatedContact(intake);

  const {
    subject,
    body
  } = uidMessage(uid, intake);

  const emailButton =
    $("email-athlete-uid");

  const textButton =
    $("text-athlete-uid");

  const copyButton =
    $("copy-athlete-uid");

  const status =
    $("athlete-uid-action-status");

  if (emailButton) {
    emailButton.disabled =
      !email;

    emailButton.title =
      email
        ? `Email Athlete UID to ${email}`
        : "No email is attached to this intake";

    emailButton.onclick =
      email
        ? () => {
            location.href =
              `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          }
        : null;
  }

  if (textButton) {
    textButton.disabled =
      !phone;

    textButton.title =
      phone
        ? `Text Athlete UID to ${phone}`
        : "No phone number is attached to this intake";

    textButton.onclick =
      phone
        ? () => {
            location.href =
              `sms:${encodeURIComponent(phone)}?&body=${encodeURIComponent(body)}`;
          }
        : null;
  }

  if (copyButton) {
    copyButton.onclick =
      async () => {
        await navigator.clipboard.writeText(
          uid
        );

        if (status) {
          status.textContent =
            `✓ Athlete UID ${uid} copied.`;
        }
      };
  }

  if (status) {
    const destinations = [
      email ? `email: ${email}` : "",
      phone ? `text: ${phone}` : ""
    ].filter(Boolean);

    status.textContent =
      destinations.length
        ? `Ready to send via ${destinations.join(" · ")}.`
        : "No email or phone is attached to this intake. Copy the UID if needed.";
  }
}

// ------------------------------------------------------
// UI helpers
// ------------------------------------------------------
function setApproveEnabled(on) {
  const btn = $("btn-approve");
  if (btn) btn.disabled = !on;
}

function hideApprovalModal() {
  const modal = $("approval-modal");
  if (modal) modal.classList.add("hidden");
}

function showApprovalModal() {
  const modal = $("approval-modal");
  if (modal) modal.classList.remove("hidden");
}

function setApprovedUI(on, uid = "") {
  const modal = $("approval-modal");
  const linkInput = $("onboarding-link");
  const copyBtn = $("copy-link");
  const openBtn = $("open-link");
  const approveBtn = $("btn-approve");

  if (modal) modal.classList.toggle("hidden", !on);

  if (linkInput) {
    linkInput.value = on
      ? `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(uid)}`
      : "";
  }

  if (copyBtn) copyBtn.disabled = !on;
  if (openBtn) openBtn.disabled = !on;
  if (approveBtn) approveBtn.disabled = on;
}

setApprovedUI(false);
setApproveEnabled(false);
if ($("approve-status")) $("approve-status").textContent = "";
hideApprovalModal();
setPadlockStatus("—");

if ($("copy-link")) $("copy-link").disabled = true;
if ($("open-link")) $("open-link").disabled = true;

function setPadlockStatus(status = "—") {
  const el = $("m-padlock");
  if (!el) return;
  el.textContent = status;
}

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
function slugTeamId(s) {
  const out = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return out || null;
}

function cleanNamePart(value = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeState(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isF8Uid(uid) {
  return String(uid || "").startsWith("F8_");
}

function getDobFromIntake(s = {}) {
  return s.dob || s.athlete?.dob || "";
}

function getAgeFromDob(dob) {
  const value = String(dob || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
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

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  if (birth > todayStart) return null;

  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  const dayDiff = today.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function getAgeFromIntake(s = {}) {
  const reviewDob =
    String(
      $("c-dob")?.value ||
      s.managementCorrections?.dob?.corrected ||
      ""
    ).trim();

  if (reviewDob) {
    return getAgeFromDob(reviewDob);
  }

  const directAge =
    s.age ??
    s.athlete?.age ??
    s.profile?.age ??
    null;

  if (directAge !== null && directAge !== undefined && directAge !== "") {
    const n = Number(directAge);
    if (Number.isFinite(n)) return n;
  }

  return getAgeFromDob(getDobFromIntake(s));
}

function buildPlacementFromTrack(track, s = {}) {
  const t = String(track || "").trim().toUpperCase();
  const selectedProgramTrack =
    $("c-program-track")?.value || "";

  if (selectedProgramTrack === "zero2hero-kickboxing") {
    return {
      framework: "foundry8",
      programTrack: "zero2hero",
      art: "muay-thai",
      ladderKey: "F8",
      rosterIds: ["youth-kickboxing"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      track: "zero2hero",
      trackCode: "zero2hero-kickboxing"
    };
  }

  if (t === "F8") {
    return {
      framework: "foundry8",
      programTrack: "zero2hero",
      art: "wrestling",
      ladderKey: "F8",
      rosterIds: ["youth-wrestling"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      track: "zero2hero",
      trackCode: "zero2hero-wrestling"
    };
  }

  if (selectedProgramTrack === "path2legend-boxing") {
    return {
      framework: "foundry4",
      programTrack: "path2legend",
      art: "boxing",
      ladderKey: "F4",
      rosterIds: ["teen-adult-boxing"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      track: "path2legend",
      trackCode: "path2legend-boxing"
    };
  }

  if (selectedProgramTrack === "quest2mastery") {
    return {
      framework: "foundry4",
      programTrack: "quest2mastery",
      art: "mma",
      ladderKey: "Q2M",
      rosterIds: ["adult-mma"],
      locationId: DEFAULT_LOCATION_ID,
      coachIds: DEFAULT_COACH_IDS,
      track: "quest2mastery",
      trackCode: "quest2mastery-mma"
    };
  }

  return {
    framework: "foundry4",
    programTrack: "path2legend",
    art: "wrestling",
    ladderKey: "F4",
    rosterIds: ["teen-wrestling"],
    locationId: DEFAULT_LOCATION_ID,
    coachIds: DEFAULT_COACH_IDS,
    track: "path2legend",
    trackCode: "path2legend-wrestling"
  };
}

// ------------------------------------------------------
// Virtues by track
// ------------------------------------------------------
const F8_VIRTUES = [
  "FOCUS","EFFORT","ATTITUDE","RESPECT",
  "SPEED","POWER","AGILITY","COMBAT"
];

const F4_VIRTUES = [
  "HONOR","COURAGE","DISCIPLINE","INTEGRITY",
  "PATIENCE","WISDOM","STRENGTH","TENACITY"
];

function setVirtuesForTrack(track) {
  const sel = $("mint-virtue");
  if (!sel) return;

  const list = track === "F4" ? F4_VIRTUES : F8_VIRTUES;

  sel.innerHTML = "";
  list.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });

  updateMintTagPreview();
}

// ------------------------------------------------------
// Virtue codes
// ------------------------------------------------------
const VIRTUE_CODE = {
  FOCUS: "FOC",
  EFFORT: "EFF",
  ATTITUDE: "ATT",
  RESPECT: "RSP",
  SPEED: "SPD",
  POWER: "PWR",
  AGILITY: "AGL",
  COMBAT: "CBT",
  HONOR: "HNR",
  COURAGE: "CRG",
  DISCIPLINE: "DSC",
  INTEGRITY: "INT",
  PATIENCE: "PAT",
  WISDOM: "WSD",
  STRENGTH: "ST",
  TENACITY: "TEN"
};

function getVirtueCode(virtueName) {
  const key = String(virtueName || "").trim().toUpperCase();
  return VIRTUE_CODE[key] || key.slice(0, 2) || "NA";
}

// ------------------------------------------------------
// Mint tag helpers
// ------------------------------------------------------
function buildPreviewTag(track, virtue) {
  const t = String(track || "").trim().toUpperCase();
  const v = String(virtue || "").trim().toUpperCase();
  if (!t || !v) return "";
  return `${t}_CB0000_${v}`;
}

function buildTagFromUid(uid, virtue) {
  const u = String(uid || "");
  if (!u || !virtue) return "";

  const prefix = u.slice(0, 2);
  const serial = (u.split("_")[1] || "0000").padStart(4, "0");
  const v = String(virtue || "").trim().toUpperCase();

  return `${prefix}_CB${serial}_${v}`;
}

function updateMintTagPreview() {
  const out = $("mint-tag-output");
  const track = ($("c-track")?.value || "").trim().toUpperCase();
  const virtue = ($("mint-virtue")?.value || "").trim().toUpperCase();

  const preview = buildPreviewTag(track, virtue);
  if (out) out.value = preview;
}

$("mint-virtue")?.addEventListener("change", updateMintTagPreview);

// ------------------------------------------------------
// Paint Mint UI
// ------------------------------------------------------
function paintMintUI({
  track = "",
  tier = "",
  rank = "",
  uid = "",
  padlock = "—"
}) {
  const trackDisplay = track || "—";

  const tierRankText =
    (tier && rank)
      ? `${tier}_${rank}`
      : (tier || rank || "—");

  const lock = uid ? padlock : "—";

  if ($("m-track")) $("m-track").textContent = trackDisplay;
  if ($("m-rank")) $("m-rank").textContent = tierRankText;
  if ($("m-padlock")) $("m-padlock").textContent = lock;
  if ($("c-uid")) $("c-uid").value = uid || "";
}

// ------------------------------------------------------
// Management enrollment review
// ------------------------------------------------------
function applyReviewModeUI() {
  // Management Enrollment reviews new-athlete intake only.
}

// ------------------------------------------------------
// Intake role
// ------------------------------------------------------
function intakeAudienceFromRecord(s = {}) {
  return (
    s.intakeAudience ||
    (
      s.source === "intake-athlete-ui"
        ? "adult_athlete"
        : s.source === "intake-parent-ui"
          ? "parent_guardian"
          : null
    )
  );
}

// ------------------------------------------------------
// Submitted intake record
// ------------------------------------------------------
function renderSubmittedIntakeRecord(s = {}) {
  const dob =
    s.dob ??
    s.athlete?.dob ??
    "—";

  const city =
    s.location?.city ??
    "—";

  const state =
    s.location?.state ??
    "—";

  const contactEmail =
    s.parent?.email ??
    s.athlete?.email ??
    "—";

  const contactPhone =
    s.parent?.phoneDigits ??
    s.athlete?.phoneDigits ??
    "—";

  const intakeAudience =
    intakeAudienceFromRecord(s);

  const completedByLabel =
    intakeAudience === "adult_athlete"
      ? "Adult Athlete"
      : intakeAudience === "parent_guardian"
        ? "Parent / Guardian"
        : "—";

  const emerName =
    s.emergency?.name ??
    "—";

  const emerPhone =
    s.emergency?.phoneDigits ??
    "—";

  const medical =
    s.medical ??
    "—";

  const submittedFirst =
    s.first ??
    s.athlete?.first ??
    "";

  const submittedLast =
    s.last ??
    s.athlete?.last ??
    "";

  if ($("s-firstlast")) {
    $("s-firstlast").textContent =
      `${submittedFirst} ${submittedLast}`.trim() ||
      "—";
  }

  if ($("s-dob")) {
    $("s-dob").textContent =
      dob;
  }

  if ($("s-city")) {
    $("s-city").textContent =
      city;
  }

  if ($("s-state")) {
    $("s-state").textContent =
      state;
  }

  if ($("s-email")) {
    $("s-email").textContent =
      contactEmail;
  }

  if ($("s-phone")) {
    $("s-phone").textContent =
      contactPhone;
  }

  if ($("s-completed-by")) {
    $("s-completed-by").textContent =
      completedByLabel;
  }

  if ($("s-emer")) {
    $("s-emer").textContent =
      `${emerName} (${emerPhone})`;
  }

  if ($("s-med")) {
    $("s-med").textContent =
      medical;
  }
}

// ------------------------------------------------------
// Load submission
// ------------------------------------------------------
async function loadSubmission() {
  const snap = await getDoc(intakeRef);

  if (!snap.exists()) {
    alert("Submission not found.");
    throw new Error("Missing submission");
  }

  const s = snap.data() || {};
  INTAKE_CACHE = s;

  applyReviewModeUI(s);
  renderIntakeLifecycle(s);
  renderSubmittedIntakeRecord(s);

  if (s.status === "approved" && s.approvedUid) {
    const uid = s.approvedUid;

    applyActivatedCompletionView(
      uid,
      s
    );

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) $("approve-status").textContent = "✓ Already approved.";
    setApproveEnabled(false);

    const track = isF8Uid(uid) ? "F8" : "F4";
    const programTrack = String(s.programTrack || "").toLowerCase();

    let tier = "T0";
    let rank = "Apprentice";

    if (isF8Uid(uid)) {
      rank = "Shadow";
    }

    if (programTrack === "quest2mastery") {
      rank = "Apprentice";
    }

    paintMintUI({
      track,
      tier,
      rank,
      uid,
      padlock: "—"
    });

    setPadlockStatus("READY");

    const virtueName = String(s.virtueName || "").trim().toUpperCase();
    if ($("mint-tag-output")) {
      $("mint-tag-output").value =
        s.mintVirtueTag ||
        s.mintVirtueTagDisplay ||
        buildTagFromUid(uid, virtueName) ||
        "";
    }

    openSuccessModal(uid);
    return;
  }

  const athleteFirst = cleanNamePart(
    s.managementCorrections?.athlete?.first ||
    s.first ||
    s.athlete?.first ||
    ""
  );

  const athleteLast = cleanNamePart(
    s.managementCorrections?.athlete?.last ||
    s.last ||
    s.athlete?.last ||
    ""
  );

  const dob = s.dob ?? s.athlete?.dob ?? "—";

  if ($("c-first")) {
    $("c-first").value = athleteFirst;
  }

  if ($("c-legal-last")) {
    $("c-legal-last").value = athleteLast;
  }

  if ($("c-initial") && !$("c-initial").value) {
    $("c-initial").value = athleteFirst
      ? athleteFirst[0].toUpperCase()
      : "";
  }

  if ($("c-last") && !$("c-last").value) {
    $("c-last").value = athleteLast;
  }

  if ($("c-city")) {
    $("c-city").value =
      s.managementCorrections?.location?.city ||
      s.location?.city ||
      "";
  }

  if ($("c-state")) {
    $("c-state").value = normalizeState(
      s.managementCorrections?.location?.state ||
      s.location?.state ||
      ""
    );
  }

  const reviewDob =
    s.managementCorrections?.dob?.corrected ||
    getDobFromIntake(s) ||
    "";

  if ($("c-dob")) {
    $("c-dob").value = reviewDob;
  }

  const submittedTeam =
    String(s.location?.team || "").trim();

  if ($("c-team")) {
    const knownTeams = [
      "Sandman Academy of Combat & Fitness",
      "Independent"
    ];

    if (!submittedTeam) {
      $("c-team").value = "";
    } else if (knownTeams.includes(submittedTeam)) {
      $("c-team").value = submittedTeam;
    } else {
      $("c-team").value = "other";

      if ($("c-team-other")) {
        $("c-team-other").value = submittedTeam;
      }

      if ($("c-team-other-wrap")) {
        $("c-team-other-wrap").hidden = false;
      }
    }
  }

  hideApprovalModal();
  setApproveEnabled(false);
  if ($("approve-status")) $("approve-status").textContent = "";
  if ($("copy-link")) $("copy-link").disabled = true;
  if ($("open-link")) $("open-link").disabled = true;

  applyAgeGuardrails();
  console.log("[management-review] loaded intake", { tokenId, status: s.status });
}

loadSubmission().catch(console.error);

// Keep public identity convenient while still independently editable.
$("c-first")?.addEventListener("input", () => {
  const first = cleanNamePart($("c-first")?.value || "");
  const initial = $("c-initial");
  if (initial && !String(initial.value || "").trim()) {
    initial.value = first ? first[0].toUpperCase() : "";
  }
});

$("c-legal-last")?.addEventListener("input", () => {
  const legalLast = cleanNamePart($("c-legal-last")?.value || "");
  const publicLast = $("c-last");
  if (publicLast && !String(publicLast.value || "").trim()) {
    publicLast.value = legalLast;
  }
});

$("c-initial")?.addEventListener("input", () => {
  const el = $("c-initial");
  if (!el) return;
  el.value = String(el.value || "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 1)
    .toUpperCase();
});

$("c-state")?.addEventListener("input", () => {
  const el = $("c-state");
  if (!el) return;
  el.value = String(el.value || "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();
});

$("c-dob")?.addEventListener(
  "change",
  () => {
    if ($("c-track")) $("c-track").value = "";
    if ($("c-tier")) $("c-tier").value = "";
    if ($("c-rank")) $("c-rank").value = "";
    if ($("c-program-track")) $("c-program-track").value = "";

    paintMintUI({
      track: "",
      tier: "",
      rank: "",
      uid: "",
      padlock: "—"
    });

    setMintButtonState("");
    setApproveEnabled(false);
    applyAgeGuardrails();
  }
);

$("c-team")?.addEventListener(
  "change",
  () => {
    const isOther =
      $("c-team")?.value === "other";

    if ($("c-team-other-wrap")) {
      $("c-team-other-wrap").hidden = !isOther;
    }

    if (!isOther && $("c-team-other")) {
      $("c-team-other").value = "";
    }
  }
);

function applyAgeGuardrails() {
  const s = INTAKE_CACHE || {};
  const age = getAgeFromIntake(s);

  const z2h = $("btn-mint-z2h");
  const p2l = $("btn-mint-p2l");
  const q2m = $("btn-mint-q2m");
  const abox = $("btn-mint-boxing");

  [z2h, p2l, q2m, abox].forEach((btn) => {
    if (!btn) return;
    btn.hidden = true;
    btn.disabled = true;
  });

  if (age === null) {
    [z2h, p2l, abox].forEach((btn) => {
      if (!btn) return;
      btn.hidden = false;
      btn.disabled = false;
    });
    return;
  }

  if (age < 14) {
    if (z2h) {
      z2h.hidden = false;
      z2h.disabled = false;
    }
    return;
  }

  if (age >= 14 && age < 18) {
    if (p2l) {
      p2l.hidden = false;
      p2l.disabled = false;
    }

    if (abox) {
      abox.hidden = false;
      abox.disabled = false;
    }

    return;
  }

  if (p2l) {
    p2l.hidden = false;
    p2l.disabled = false;
  }

  if (abox) {
    abox.hidden = false;
    abox.disabled = false;
  }
}

// ------------------------------------------------------
// Mint F8 / F4 (preview only)
// ------------------------------------------------------
function mintTrack(track, programTrack = "") {
  const t = String(track || "").toUpperCase();

  let tier = "T0";
  let rank = "Apprentice";

  if (programTrack === "zero2hero") {
    rank = "Shadow";
  }

  if (programTrack === "path2legend") {
    rank = "Apprentice";
  }

  if (programTrack === "quest2mastery") {
    rank = "Apprentice";
  }

  if ($("c-track")) $("c-track").value = t;
  if ($("c-tier")) $("c-tier").value = tier;
  if ($("c-rank")) $("c-rank").value = rank;
  if ($("c-program-track")) $("c-program-track").value = programTrack;
  if ($("c-uid")) $("c-uid").value = "";

  setVirtuesForTrack(t);
  updateMintTagPreview();

  paintMintUI({
    track: programTrack || t,
    tier,
    rank,
    uid: "",
    padlock: ""
  });

  setPadlockStatus("—");
  setApprovedUI(false);
  setApproveEnabled(true);

  if ($("approve-status")) {
    $("approve-status").textContent =
      "Selection ready. Verify the Management-confirmed athlete details, then Approve.";
  }
}

function setMintButtonState(activeId) {
  [
    "btn-mint-z2h",
    "btn-mint-p2l",
    "btn-mint-q2m",
    "btn-mint-boxing"
  ].forEach((id) => {
    const btn = $(id);
    if (!btn) return;

    btn.classList.toggle(
      "is-selected",
      id === activeId
    );
  });
}

$("btn-mint-z2h")?.addEventListener("click", () => {
  mintTrack("F8", "zero2hero");
  setMintButtonState("btn-mint-z2h");
});

$("btn-mint-p2l")?.addEventListener("click", () => {
  mintTrack("F4", "path2legend");
  setMintButtonState("btn-mint-p2l");
});

$("btn-mint-q2m")?.addEventListener("click", () => {
  mintTrack("F4", "quest2mastery");
  setMintButtonState("btn-mint-q2m");
});

$("btn-mint-boxing")?.addEventListener("click", () => {
  mintTrack("F4", "path2legend-boxing");
  setMintButtonState("btn-mint-boxing");
});

// ------------------------------------------------------
// Approve (backend source of truth)
// ------------------------------------------------------
function preventDoubleTap(btn, fn) {
  let busy = false;

  return async (e) => {
    e?.preventDefault?.();
    if (busy) return;

    busy = true;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("is-busy");

    try {
      await fn(e);
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("is-busy");
      throw err;
    }
  };
}

const authReady = ensureSignedIn().catch(console.error);

function stopApproval(message) {
  setApproveEnabled(true);

  const btn = $("btn-approve");
  if (btn) {
    btn.removeAttribute("aria-busy");
    btn.classList.remove("is-busy");
  }

  alert(message);
  return false;
}

async function approveAthlete() {
  await authReady;

  const s = INTAKE_CACHE || {};

  const athleteFirst = cleanNamePart($("c-first")?.value || "");
  const athleteLast = cleanNamePart($("c-legal-last")?.value || "");
  const initial = String($("c-initial")?.value || "")
    .trim()
    .toUpperCase();
  const publicLast = cleanNamePart($("c-last")?.value || "");

  const selectedTeam =
    ($("c-team")?.value || "").trim();

  const team =
    selectedTeam === "other"
      ? ($("c-team-other")?.value || "").trim()
      : selectedTeam;

  const dob = ($("c-dob")?.value || "").trim();
  const city = cleanNamePart($("c-city")?.value || "");
  const state = normalizeState($("c-state")?.value || "");

  if (!athleteFirst || !athleteLast) {
    return stopApproval(
      "Athlete first and last name are required before activation."
    );
  }

  const age = getAgeFromDob(dob);
  if (age === null) {
    return stopApproval(
      "A valid Date of Birth is required and cannot be in the future."
    );
  }

  if (!city) {
    return stopApproval(
      "City is required before activation."
    );
  }

  if (!/^[A-Z]{2}$/.test(state)) {
    return stopApproval(
      "State must be a valid 2-letter abbreviation."
    );
  }

  if (!team) {
    return stopApproval(
      "Select a Team / Affiliation."
    );
  }

  if (!/^[A-Z]$/.test(initial) || !publicLast) {
    return stopApproval(
      "Public Initial + Public Last are required."
    );
  }

  const track = ($("c-track")?.value || "").trim().toUpperCase();
  if (!track) {
    return stopApproval(
      "Select a journey before approving."
    );
  }

  const virtue =
    ($("mint-virtue")?.value || "").trim().toUpperCase() ||
    String(s.virtueName || "HONOR")
      .trim()
      .toUpperCase();

  if (!virtue) {
    return stopApproval(
      "Pick a Mint Virtue."
    );
  }

  const confirmedFullName = `${athleteFirst} ${athleteLast}`.trim();
  const publicName = `${initial}. ${publicLast}`.trim();

  const confirmMessage = [
    "Activate this athlete with the Management-confirmed record?",
    "",
    `Athlete: ${confirmedFullName}`,
    `DOB: ${dob}`,
    `Location: ${city}, ${state}`,
    `Public identity: ${publicName}`
  ].join("\n");

  if (!window.confirm(confirmMessage)) {
    return stopApproval("Activation cancelled. No athlete record was created.");
  }

  setApproveEnabled(false);
  if ($("approve-status")) {
    $("approve-status").textContent = "Approving…";
  }

  try {
    const approveAndActivate = httpsCallable(functions, "approveAndActivate");
    const placement = buildPlacementFromTrack(track, s);
    const foundry = track.toLowerCase();

    const intakeAudience =
      s.intakeAudience ||
      (
        s.source === "intake-athlete-ui"
          ? "adult_athlete"
          : "parent_guardian"
      );

    const contactEmail =
      String(
        s.parent?.email ??
        s.athlete?.email ??
        ""
      )
        .trim()
        .toLowerCase();

    const contactPhoneDigits =
      String(
        s.parent?.phoneDigits ??
        s.athlete?.phoneDigits ??
        ""
      ).trim();

    const contactName =
      String(
        s.parent?.name ??
        s.waiver?.signatureName ??
        confirmedFullName
      ).trim();

    const contactLanguagePreference =
      s.parent?.languagePreference ??
      s.athlete?.languagePreference ??
      null;

    const intakeTeamName = String(s.location?.team || "").trim();
    const teamIdFromIntake =
      String(s.location?.teamId || "").trim() ||
      slugTeamId(intakeTeamName) ||
      slugTeamId(team);

    const payload = {
      intakeId: tokenId,

      mode: "new_athlete",

      existingAthleteUid: "",
      forTrack: null,
      forLane: null,
      requestedTrackCode: null,
      requestedDiscipline: null,
      existingAthleteName: null,

      workflowVersion:
        String(s.workflowVersion || "intake-v2"),

      foundry,
      track: placement.track,
      trackCode: placement.trackCode,

      framework: placement.framework,
      programTrack: placement.programTrack,
      art: placement.art,
      ladderKey: placement.ladderKey,
      rosterIds: placement.rosterIds,
      coachIds: placement.coachIds,
      locationId: placement.locationId,

      placement: {
        framework: placement.framework,
        programTrack: placement.programTrack,
        track: placement.track,
        trackCode: placement.trackCode,
        art: placement.art,
        ladderKey: placement.ladderKey,
        rosterIds: placement.rosterIds,
        coachIds: placement.coachIds,
        locationId: placement.locationId,
        source: "management_enrollment_review"
      },

      virtueName: virtue,
      virtueCode: getVirtueCode(virtue),

      fullName: confirmedFullName,
      publicName,
      dob,

      intakeAudience,

      contact: {
        role:
          intakeAudience === "adult_athlete"
            ? "athlete"
            : "parent_guardian",

        email: contactEmail || null,
        phoneDigits: contactPhoneDigits || null,
        name: contactName || null,
        languagePreference: contactLanguagePreference,
      },

      ...(intakeAudience === "parent_guardian"
        ? {
            parent: {
              email: contactEmail || null,
              phoneDigits: contactPhoneDigits || null,
              name: contactName || null,
              languagePreference: contactLanguagePreference,
            },
          }
        : {}),

      team: {
        name: team || intakeTeamName || null,
        teamId: teamIdFromIntake || null,
        city,
        state,
      },

      mint: {
        lane: "CB"
      },
    };

    const res = await approveAndActivate(payload);
    const data = res?.data || {};
    const uid = data.uid;

    if (!uid) throw new Error("Missing uid in response");

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) {
      $("approve-status").textContent = "✓ Approved!";
    }

    const programTrack =
      $("c-program-track")?.value || "";

    let tier = "T0";
    let rank = "Apprentice";

    if (isF8Uid(uid)) {
      rank = "Shadow";
    }

    if (programTrack === "quest2mastery") {
      rank = "Apprentice";
    }

    paintMintUI({
      track,
      tier,
      rank,
      uid,
      padlock: "READY"
    });

    setPadlockStatus("READY");

    if ($("mint-tag-output")) {
      $("mint-tag-output").value =
        data.mintVirtueTag || buildTagFromUid(uid, virtue);
    }

    setApprovedUI(true, uid);
    renderIntakeLifecycle({
      ...INTAKE_CACHE,
      status: "approved",
      approvedUid: uid
    });
    openSuccessModal(uid);

    window.location.assign(
      "/connect/thanks/welcome.html"
    );

  } catch (err) {
    console.error("[approveAthlete] approveAndActivate failed:", err);

    if ($("approve-status")) {
      $("approve-status").textContent =
        "⚠ Approve failed. Check console.";
    }

    setApproveEnabled(true);
    setApprovedUI(false);
    throw err;
  }
}

const approveBtn = $("btn-approve");
if (approveBtn) {
  approveBtn.addEventListener(
    "click",
    preventDoubleTap(approveBtn, approveAthlete)
  );
}

const linkExistingBtn = $("btn-link-existing");

if (linkExistingBtn) {
  linkExistingBtn.addEventListener(
    "click",
    preventDoubleTap(linkExistingBtn, async () => {
      await authReady;

      const existingUid =
        String($("existing-athlete-uid")?.value || "").trim();

      if (!existingUid) {
        alert("Enter existing athlete UID.");
        return;
      }

      if (
        !confirm(
          `Link this intake to existing athlete ${existingUid}?`
        )
      ) {
        return;
      }

      const statusEl = $("link-existing-status");

      try {
        if (statusEl) {
          statusEl.textContent = "Linking existing athlete…";
        }

        await approveIntakeCall({
          intakeId: tokenId,
          approvedUid: existingUid,
          note:
            "Linked to existing athlete from intake review.",
        });

        if ($("c-uid")) {
          $("c-uid").value = existingUid;
        }

        if ($("approve-status")) {
          $("approve-status").textContent =
            "✓ Intake linked to existing athlete.";
        }

        if (statusEl) {
          statusEl.textContent = `✓ Linked to ${existingUid}`;
        }

        setApprovedUI(true, existingUid);
        openSuccessModal(existingUid);
      } catch (err) {
        console.error(
          "[linkExistingAthlete] failed:",
          err
        );

        if (statusEl) {
          statusEl.textContent =
            "⚠ Link failed. Check console.";
        }

        throw err;
      }
    })
  );
}

// ------------------------------------------------------
// Onboarding modal
// ------------------------------------------------------
function openSuccessModal(uid) {
  const onboarding =
    `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(uid)}`;
  const parentLink = `${location.origin}/parent/`;

  if ($("approved-athlete-uid")) {
    $("approved-athlete-uid").value = uid;
  }

  if ($("onboarding-link")) {
    $("onboarding-link").value = onboarding;
  }

  if ($("copy-link")) {
    $("copy-link").disabled = false;
    $("copy-link").onclick =
      () => navigator.clipboard.writeText(onboarding);
  }

  if ($("open-link")) {
    $("open-link").disabled = false;
    $("open-link").onclick =
      () => window.open(onboarding, "_blank", "noopener");
  }

  if ($("parent-my-athlete-link")) {
    $("parent-my-athlete-link").value = parentLink;
  }

  if ($("copy-parent-link")) {
    $("copy-parent-link").onclick =
      () => navigator.clipboard.writeText(parentLink);
  }

  if ($("open-parent-link")) {
    $("open-parent-link").onclick =
      () => window.open(parentLink, "_blank", "noopener");
  }

  showApprovalModal();
}

// ------------------------------------------------------
// Back button
// ------------------------------------------------------
$("btn-back")?.addEventListener("click", () => {
  location.href = "./index.html";
});

// ------------------------------------------------------
// Init
// ------------------------------------------------------
updateMintTagPreview();
