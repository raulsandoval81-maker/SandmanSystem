// ======================================================
// Coach Intake — Review & Mint (TOKEN FLOW)
// Sandman Systems™
//
// Final polish:
// - Aligned to current review.html
// - Experience Credit preview wired in
// - Sends experience.years to approveAndActivate
// - Keeps lane locked to Combat (CB) for current flow
// - Optional coach adjustment fields included in payload
// ======================================================

import {
  db,
  doc,
  getDoc,
  functions,
  httpsCallable,
  ensureSignedIn
} from "../assets/js/firebase-init.js";

ensureSignedIn().catch(console.error);

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------
// URL → tokenId (REVIEW PAGE)
// ------------------------------------------------------
const params = new URLSearchParams(location.search);
const tokenId = (params.get("token") || "").trim();

if (!tokenId) {
  alert("Missing ?token= in URL");
  throw new Error("Missing ?token=");
}

// Firestore doc: intakes/{tokenId}
const intakeRef = doc(db, "intakes", tokenId);

// ------------------------------------------------------
// Intake cache
// ------------------------------------------------------
let INTAKE_CACHE = null;

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

// Boot state
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

function isF8Uid(uid) {
  return String(uid || "").startsWith("F8_");
}

// ------------------------------------------------------
// Experience Credit preview
// ------------------------------------------------------
function getExperiencePlan(years) {
  const y = Number(years || 0);

  if (y === 1) {
    return {
      yearsVerified: 1,
      total: 200,
      issuedNow: 200,
      held: 0,
      schedule: "full_t0"
    };
  }

  if (y === 2) {
    return {
      yearsVerified: 2,
      total: 400,
      issuedNow: 200,
      held: 200,
      schedule: "deferred_t1_entry"
    };
  }

  if (y >= 3) {
    return {
      yearsVerified: 3,
      total: 600,
      issuedNow: 300,
      held: 300,
      schedule: "deferred_t1_entry"
    };
  }

  return {
    yearsVerified: 0,
    total: 0,
    issuedNow: 0,
    held: 0,
    schedule: "—"
  };
}

function updateExperiencePreview() {
  const years = Number($("c-exp-years")?.value || 0);
  const plan = getExperiencePlan(years);

  if ($("exp-total")) $("exp-total").textContent = String(plan.total);
  if ($("exp-now")) $("exp-now").textContent = String(plan.issuedNow);
  if ($("exp-hold")) $("exp-hold").textContent = String(plan.held);
  if ($("exp-schedule")) $("exp-schedule").textContent = plan.schedule;
}

// ------------------------------------------------------
// Virtues by track
// ------------------------------------------------------
const F8_VIRTUES = ["FOCUS","EFFORT","ATTITUDE","RESPECT","SPEED","POWER","AGILITY","COMBAT"];
const F4_VIRTUES = ["HONOR","COURAGE","DISCIPLINE","INTEGRITY","PATIENCE","WISDOM","STRENGTH","TENACITY"];

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
  const tierRankText = (tier && rank) ? `${tier}_${rank}` : (tier || rank || "—");
  const lock = uid ? padlock : "—";

  if ($("m-track")) $("m-track").textContent = trackDisplay;
  if ($("m-rank")) $("m-rank").textContent = tierRankText;
  if ($("m-padlock")) $("m-padlock").textContent = lock;
  if ($("c-uid")) $("c-uid").value = uid || "";
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

  if (s.status === "approved" && s.approvedUid) {
    const uid = s.approvedUid;

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) $("approve-status").textContent = "✓ Already approved.";
    setApproveEnabled(false);

    const track = String(s.forTrack || "").trim().toUpperCase() || (isF8Uid(uid) ? "F8" : "F4");

    paintMintUI({
      track,
      tier: "T0",
      rank: isF8Uid(uid) ? "Shadow" : "Apprentice",
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

  const athleteFirst = s.first ?? s.athlete?.first ?? "";
  const athleteLast  = s.last  ?? s.athlete?.last  ?? "";
  const dob          = s.dob   ?? s.athlete?.dob   ?? "—";

  if ($("c-initial") && !$("c-initial").value) {
    const first = String(athleteFirst || "").trim();
    $("c-initial").value = first ? first[0].toUpperCase() : "";
  }

  const city  = s.location?.city ?? "—";
  const state = s.location?.state ?? "—";

  const parentEmail = s.parent?.email ?? "—";
  const parentPhone = s.parent?.phoneDigits ?? "—";

  const emerName  = s.emergency?.name ?? "—";
  const emerPhone = s.emergency?.phoneDigits ?? "—";

  const medical = s.medical ?? "—";

  if ($("s-firstlast")) $("s-firstlast").textContent = `${athleteFirst} ${athleteLast}`.trim() || "—";
  if ($("s-dob")) $("s-dob").textContent = dob;

  if ($("s-city")) $("s-city").textContent = city;
  if ($("s-state")) $("s-state").textContent = state;
  if ($("s-email")) $("s-email").textContent = parentEmail;
  if ($("s-phone")) $("s-phone").textContent = parentPhone;
  if ($("s-emer")) $("s-emer").textContent = `${emerName} (${emerPhone})`;
  if ($("s-med")) $("s-med").textContent = medical;

  if ($("c-city")) $("c-city").value = s.location?.city ?? "";
  if ($("c-state")) $("c-state").value = s.location?.state ?? "";
  if ($("c-team")) $("c-team").value = s.location?.team ?? "";

  if ($("c-last") && !$("c-last").value) {
    $("c-last").value = athleteLast || "";
  }

  hideApprovalModal();
  setApproveEnabled(false);
  if ($("approve-status")) $("approve-status").textContent = "";
  if ($("copy-link")) $("copy-link").disabled = true;
  if ($("open-link")) $("open-link").disabled = true;

  updateExperiencePreview();
  console.log("[coach-review] loaded intake", { tokenId, status: s.status });
}

loadSubmission().catch(console.error);

// ------------------------------------------------------
// Mint F8 / F4 (preview only)
// ------------------------------------------------------
function mintTrack(track) {
  const t = String(track || "").toUpperCase();
  const tier = "T0";
  const rank = t === "F8" ? "Shadow" : "Apprentice";

  if ($("c-track")) $("c-track").value = t;
  if ($("c-tier")) $("c-tier").value = tier;
  if ($("c-rank")) $("c-rank").value = rank;
  if ($("c-uid")) $("c-uid").value = "";

  setVirtuesForTrack(t);
  updateMintTagPreview();

  paintMintUI({
    track: t,
    tier,
    rank,
    uid: "",
    padlock: ""
  });
  setPadlockStatus("—");

  setApprovedUI(false);
  setApproveEnabled(true);

  if ($("approve-status")) {
    $("approve-status").textContent = "Minted (server UID pending). Verify details, then Approve.";
  }
}

$("btn-mint-f8")?.addEventListener("click", () => mintTrack("F8"));
$("btn-mint-f4")?.addEventListener("click", () => mintTrack("F4"));

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

async function approveAthlete() {
  await authReady;

  const initial = ($("c-initial")?.value || "").trim();
  const last = ($("c-last")?.value || "").trim();
  const team = ($("c-team")?.value || "").trim();
  const city = ($("c-city")?.value || "").trim();
  const state = ($("c-state")?.value || "").trim();
  const years = Number($("c-exp-years")?.value || 0);

  const adjustXp = Number($("c-adjust-xp")?.value || 0);
  const adjustNote = ($("c-adjust-note")?.value || "").trim();

  if (!initial || !last) {
    return alert("Public Initial + Public Last required.");
  }

  const track = ($("c-track")?.value || "").trim().toUpperCase();
  if (!track) {
    return alert("Mint first (track missing).");
  }

  const virtue = ($("mint-virtue")?.value || "").trim().toUpperCase();
  if (!virtue) {
    return alert("Pick a Mint Virtue.");
  }

  const trackCode = track === "F4" ? "foundry4-combat" : "foundry8-combat";

  setApproveEnabled(false);
  if ($("approve-status")) $("approve-status").textContent = "Approving…";

  try {
    const approveAndActivate = httpsCallable(functions, "approveAndActivate");

    const foundry = track.toLowerCase();
    const publicName = `${initial}. ${last}`.trim();

    const s = INTAKE_CACHE || {};
    const parentEmail = String(s.parent?.email || "").trim().toLowerCase();
    const parentPhoneDigits = String(s.parent?.phoneDigits || "").trim();
    const parentName = String(s.parent?.name || s.waiver?.signatureName || "").trim();

    const intakeTeamName = String(s.location?.team || "").trim();
    const teamIdFromIntake =
      String(s.location?.teamId || "").trim() ||
      slugTeamId(intakeTeamName) ||
      slugTeamId(team);

    const payload = {
      intakeId: tokenId,
      foundry,
      virtueName: virtue,
      virtueCode: getVirtueCode(virtue),
      trackCode,

      fullName: ($("s-firstlast")?.textContent || "").trim(),
      publicName,

      parent: {
        email: parentEmail || null,
        phoneDigits: parentPhoneDigits || null,
        name: parentName || null,
      },

      team: {
        name: team || intakeTeamName || null,
        teamId: teamIdFromIntake || null,
        city,
        state,
      },

      mint: {
        lane: "CB"
      },

      experience: {
        years
      }
    };

    if (adjustXp > 0) {
      payload.adjustment = {
        amount: adjustXp,
        note: adjustNote || "Coach adjustment",
        kind: "DAILY_GRIND",
        source: "coach_adjustment"
      };
    }

    const res = await approveAndActivate(payload);

    const data = res?.data || {};
    const uid = data.uid;

    if (!uid) throw new Error("Missing uid in response");

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) $("approve-status").textContent = "✓ Approved!";

    const rank = isF8Uid(uid) ? "Shadow" : "Apprentice";

paintMintUI({
  track,
  tier: "T0",
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
    openSuccessModal(uid);

  } catch (err) {
    console.error("[approveAthlete] approveAndActivate failed:", err);
    if ($("approve-status")) {
      $("approve-status").textContent = "⚠ Approve failed. Check console.";
    }
    setApproveEnabled(true);
    setApprovedUI(false);
    throw err;
  }
}

const approveBtn = $("btn-approve");
if (approveBtn) {
  approveBtn.addEventListener("click", preventDoubleTap(approveBtn, approveAthlete));
}

// ------------------------------------------------------
// Onboarding modal
// ------------------------------------------------------
function openSuccessModal(uid) {
  const onboarding = `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(uid)}`;
const parentLink = `${location.origin}/parent/index.html?uid=${encodeURIComponent(uid)}`;
  // UID
  if ($("approved-athlete-uid")) {
    $("approved-athlete-uid").value = uid;
  }

  // ONBOARDING
  if ($("onboarding-link")) {
    $("onboarding-link").value = onboarding;
  }

  if ($("copy-link")) {
    $("copy-link").disabled = false;
    $("copy-link").onclick = () => navigator.clipboard.writeText(onboarding);
  }

  if ($("open-link")) {
    $("open-link").disabled = false;
    $("open-link").onclick = () => window.open(onboarding, "_blank", "noopener");
  }

  // 🔥 PARENT LINK (NEW)
  if ($("parent-my-athlete-link")) {
    $("parent-my-athlete-link").value = parentLink;
  }

  if ($("copy-parent-link")) {
    $("copy-parent-link").onclick = () => navigator.clipboard.writeText(parentLink);
  }

  if ($("open-parent-link")) {
    $("open-parent-link").onclick = () => window.open(parentLink, "_blank", "noopener");
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
$("c-exp-years")?.addEventListener("change", updateExperiencePreview);
updateExperiencePreview();
updateMintTagPreview();