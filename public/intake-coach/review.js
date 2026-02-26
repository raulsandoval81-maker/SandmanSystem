// ======================================================
// Coach Intake — Review & Mint (TOKEN FLOW) — V1 COUNTERS
// Sandman Systems™
//
// V1 changes:
// - UID is NO LONGER generated client-side.
// - Approve is a SINGLE callable: approveAndActivate (server reserves counter + creates athlete + stamps intake).
// - Mint buttons now only set track + enable approve + show preview (0000).
//
// SAFE ADDITIONS (for Para-Comms + future targeting):
// - Cache intake doc in-memory (INTAKE_CACHE)
// - Compute teamId slug (slugTeamId)
// - Pass parent identity + teamId into approveAndActivate payload
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
// Intake cache (SAFE)
// ------------------------------------------------------
let INTAKE_CACHE = null;

// ------------------------------------------------------
// UI helpers / gates
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

  // lock approve after success
  if (approveBtn) approveBtn.disabled = on;
}

// Boot state
setApprovedUI(false);
setApproveEnabled(false);
if ($("approve-status")) $("approve-status").textContent = "";
hideApprovalModal();
if ($("copy-link")) $("copy-link").disabled = true;
if ($("open-link")) $("open-link").disabled = true;

// ------------------------------------------------------
// Small helpers
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

// ------------------------------------------------------
// Mint UI paint helpers
// ------------------------------------------------------
function paintMintUI({
  track = "",
  lane = "",
  tier = "",
  rank = "",
  uid = "",
  padlock = "🔒",
  mintTag = ""
}) {
  const LANE_MAP = {
    CB: "Combat",
    ST: "Strength",
    HN: "Honor"
  };

  const laneLabel = LANE_MAP[lane] || lane || "";

  const trackDisplay =
    (track && laneLabel) ? `${track}_${laneLabel}` : (track || "—");

  const tierRankText =
    (tier && rank) ? `${tier}_${rank}` : (tier || rank || "—");

  const lock = uid ? padlock : "—";

  if ($("m-track")) $("m-track").textContent = trackDisplay;
  if ($("m-rank"))  $("m-rank").textContent  = tierRankText;
  if ($("m-padlock")) $("m-padlock").textContent = lock;
  if ($("m-minttag")) $("m-minttag").textContent = mintTag || "—";
  if ($("c-uid")) $("c-uid").value = uid || "";
}

// ------------------------------------------------------
// Lane locks (F8 = Combat only)
// ------------------------------------------------------
function enforceLaneRulesForTrack(track) {
  const laneSel = $("mint-lane");
  if (!laneSel) return;

  if (track === "F8") {
    laneSel.value = "CB";
    laneSel.disabled = true;

    // hard-hide other options (looks locked)
    [...laneSel.options].forEach(o => {
      o.hidden = (o.value !== "CB");
    });
  } else {
    laneSel.disabled = false;
    [...laneSel.options].forEach(o => { o.hidden = false; });
  }
}

// ------------------------------------------------------
// Virtues by track (your final sets)
// ------------------------------------------------------
const F8_VIRTUES = ["FOCUS","EFFORT","ATTITUDE","RESPECT","SPEED","POWER","AGILITY","COMBAT"];
const F4_VIRTUES = ["HONOR","COURAGE","DISCIPLINE","INTEGRITY","PATIENCE","WISDOM","STRENGTH","TENACITY"];

function setVirtuesForTrack(track) {
  const sel = $("mint-virtue");
  if (!sel) return;

  const list = (track === "F4") ? F4_VIRTUES : F8_VIRTUES;

  sel.innerHTML = "";
  list.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });

  updateMintTagPreview();
}

// ------------------------------------------------------
// Virtue codes (V1 mapping)
// ------------------------------------------------------
const VIRTUE_CODE = {
  // Foundry 8
  FOCUS: "FOC",
  EFFORT: "EFF",
  ATTITUDE: "ATT",
  RESPECT: "RSP",
  SPEED: "SPD",
  POWER: "PWR",
  AGILITY: "AGL",
  COMBAT: "CBT",
  // Foundry 4
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
// Mint tag builders
// ------------------------------------------------------

// Before approve (no UID yet): show 0000 preview using track + lane + virtue
function buildPreviewTag(track, lane, virtue) {
  const t = String(track || "").trim().toUpperCase();
  const l = String(lane || "CB").trim().toUpperCase();
  const v = String(virtue || "").trim().toUpperCase();
  if (!t || !v) return "";
  return `${t}_${l}0000_${v}`;
}

// After approve (UID exists): build from UID (truth)
function buildTagFromUid(uid, lane, virtue) {
  const u = String(uid || "");
  if (!u || !virtue) return "";

  const prefix = u.slice(0, 2); // "F8" or "F4"
  const serial = (u.split("_")[1] || "0000").padStart(4, "0"); // "0004"
  const l = String(lane || "CB").trim().toUpperCase();
  const v = String(virtue || "").trim().toUpperCase();

  return `${prefix}_${l}${serial}_${v}`;
}

function isF8Uid(uid) {
  return String(uid || "").startsWith("F8_");
}

// ------------------------------------------------------
// Preview paint updater
// ------------------------------------------------------
function updateMintTagPreview() {
  const out = $("mint-tag-output"); // optional input

  const track  = ($("mint-track")?.value || $("c-track")?.value || "").trim().toUpperCase();
  const lane   = ($("mint-lane")?.value || "CB").trim().toUpperCase();
  const virtue = ($("mint-virtue")?.value || "").trim().toUpperCase();

  const preview = buildPreviewTag(track, lane, virtue);

  if (out) out.value = preview;
  if ($("m-minttag")) $("m-minttag").textContent = preview || "—";
}

["mint-track", "mint-lane", "mint-virtue"].forEach((id) => {
  $(id)?.addEventListener("change", updateMintTagPreview);
});

// ------------------------------------------------------
// Load submission (intakes/{token})
// ------------------------------------------------------
async function loadSubmission() {
  const snap = await getDoc(intakeRef);

  if (!snap.exists()) {
    alert("Submission not found.");
    throw new Error("Missing submission");
  }

  const s = snap.data() || {};
  INTAKE_CACHE = s; // ✅ cache for approve payload

  // If already approved, lock the page into approved state
  if (s.status === "approved" && s.approvedUid) {
    const uid = s.approvedUid;

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) $("approve-status").textContent = "✓ Already approved.";
    setApproveEnabled(false);

    // Intake stores forTrack/forLane in your data
    const track = String(s.forTrack || "").trim().toUpperCase() || (isF8Uid(uid) ? "F8" : "F4");
    const lane  = String(s.forLane || "CB").trim().toUpperCase();

    const virtueName = String(s.virtueName || "").trim().toUpperCase();
    const virtueCode = String(s.virtueCode || "").trim().toUpperCase();
    const virtueForTag = virtueName || virtueCode || "";

    paintMintUI({
      track,
      lane,
      tier: "T0",
      rank: isF8Uid(uid) ? "Shadow" : "Apprentice",
      uid,
      padlock: "—",
      // If you stored mintVirtueTagSerial, use it; otherwise derive safely from UID
      mintTag: s.mintVirtueTag || s.mintVirtueTagDisplay || buildTagFromUid(uid, lane, virtueForTag) || "—"
    });

    openSuccessModal(uid);
    return;
  }

  // Root mirrors (preferred) with fallback to nested athlete
  const athleteFirst = s.first ?? s.athlete?.first ?? "";
  const athleteLast  = s.last  ?? s.athlete?.last  ?? "";
  const dob          = s.dob   ?? s.athlete?.dob   ?? "—";

  // Auto-fill public initial from first name (only if empty)
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

  // Fill UI
  if ($("s-firstlast")) $("s-firstlast").textContent = `${athleteFirst} ${athleteLast}`.trim() || "—";
  if ($("s-dob")) $("s-dob").textContent = dob;

  if ($("s-city")) $("s-city").textContent = city;
  if ($("s-state")) $("s-state").textContent = state;

  if ($("s-email")) $("s-email").textContent = parentEmail;
  if ($("s-phone")) $("s-phone").textContent = parentPhone;

  if ($("s-emer")) $("s-emer").textContent = `${emerName} (${emerPhone})`;
  if ($("s-med")) $("s-med").textContent = medical;

  // Prefill coach edit fields
  if ($("c-city"))  $("c-city").value  = s.location?.city ?? "";
  if ($("c-state")) $("c-state").value = s.location?.state ?? "";
  if ($("c-team"))  $("c-team").value  = s.location?.team ?? "";

  // Helpful default: public last = athlete last (coach can overwrite)
  if ($("c-last") && !$("c-last").value) $("c-last").value = athleteLast || "";

  // Gates on load (until Mint)
  hideApprovalModal();
  setApproveEnabled(false);
  if ($("approve-status")) $("approve-status").textContent = "";
  if ($("copy-link")) $("copy-link").disabled = true;
  if ($("open-link")) $("open-link").disabled = true;

  console.log("[coach-review] loaded intake", { tokenId, status: s.status });
}

loadSubmission().catch(console.error);

// ------------------------------------------------------
// Mint F8 / F4 (enables Approve)
// NOTE: NO UID minted here anymore. Server will return UID.
// ------------------------------------------------------
function mintTrack(track) {
  track = String(track || "").toUpperCase();

  const tier = "T0";
  const rank = (track === "F8") ? "Shadow" : "Apprentice";

  // required fields for approve flow
  if ($("c-track")) $("c-track").value = track;
  if ($("c-tier")) $("c-tier").value = tier;
  if ($("c-rank")) $("c-rank").value = rank;

  // clear UID (server-minted)
  if ($("c-uid")) $("c-uid").value = "";

  // sync mint selector UI + enforce lane rules
  if ($("mint-track")) $("mint-track").value = track;
  enforceLaneRulesForTrack(track);

  // virtues switch based on track
  setVirtuesForTrack(track);

  // update preview (0000)
  updateMintTagPreview();

  const lane = ($("mint-lane")?.value || "CB").trim().toUpperCase();
  const virtue = ($("mint-virtue")?.value || "").trim().toUpperCase();
  const previewTag = buildPreviewTag(track, lane, virtue);

  // paint immediately (padlock comes after approve)
  paintMintUI({
    track,
    lane,
    tier,
    rank,
    uid: "", // unknown until server approves
    padlock: "",
    mintTag: previewTag
  });

  setApprovedUI(false);
  setApproveEnabled(true);

  if ($("approve-status")) $("approve-status").textContent =
    "Minted (server UID pending). Verify details, then Approve.";
}

$("btn-mint-f8")?.addEventListener("click", () => mintTrack("F8"));
$("btn-mint-f4")?.addEventListener("click", () => mintTrack("F4"));

// ------------------------------------------------------
// Approve (backend source of truth) — SINGLE CALLABLE
// Cloud Function: approveAndActivate
// ------------------------------------------------------

// Double-tap guard (define BEFORE binding)
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
      // keep disabled after success (approve should never run twice)
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("is-busy");
      throw err;
    }
  };
}

let authReady = ensureSignedIn().catch(console.error);

async function approveAthlete() {
  await authReady; // ensure req.auth is present

  const initial = ($("c-initial")?.value || "").trim();
  const last    = ($("c-last")?.value || "").trim();
  const team    = ($("c-team")?.value || "").trim();
  const city    = ($("c-city")?.value || "").trim();
  const state   = ($("c-state")?.value || "").trim();

  if (!initial || !last) return alert("Public Initial + Public Last required.");

  const track = ($("c-track")?.value || "").trim().toUpperCase();
  if (!track) return alert("Mint first (track missing).");

  const lane   = ($("mint-lane")?.value || "CB").trim().toUpperCase();
  const virtue = ($("mint-virtue")?.value || "").trim().toUpperCase();
  if (!virtue) return alert("Pick a Mint Virtue.");

  // V1: combat-only trackCode assumption
  const trackCode = (track === "F4") ? "foundry4-combat" : "foundry8-combat";

  setApproveEnabled(false);
  if ($("approve-status")) $("approve-status").textContent = "Approving…";

  try {
    const approveAndActivate = httpsCallable(functions, "approveAndActivate");

    const foundry = track.toLowerCase(); // "f4" | "f8"
    const publicName = `${initial}. ${last}`.trim();

    // ✅ pull parent/team identity from cached intake (SAFE)
    const s = INTAKE_CACHE || {};
    const parentEmail = String(s.parent?.email || "").trim().toLowerCase();
    const parentPhoneDigits = String(s.parent?.phoneDigits || "").trim();
    const parentName = String(s.parent?.name || s.waiver?.signatureName || "").trim();

    const intakeTeamName = String(s.location?.team || "").trim();
    const teamIdFromIntake =
      String(s.location?.teamId || "").trim() ||
      slugTeamId(intakeTeamName) ||
      slugTeamId(team);

    const res = await approveAndActivate({
      intakeId: tokenId,
      foundry,
      virtueName: virtue,
      virtueCode: getVirtueCode(virtue),
      trackCode,

      // Optional fields (harmless if ignored)
      fullName: ($("s-firstlast")?.textContent || "").trim(),
      publicName,

      // ✅ parent identity (for Para seeding later)
      parent: {
        email: parentEmail || null,
        phoneDigits: parentPhoneDigits || null,
        name: parentName || null,
      },

      // ✅ team identity (for targeting later)
      team: {
        name: team || intakeTeamName || null,
        teamId: teamIdFromIntake || null,
        city,
        state,
      },

      mint: { lane },
    });

    const data = res?.data || {};
    const uid = data.uid;
    const mintVirtueTag = data.mintVirtueTag;

    if (!uid) throw new Error("Missing uid in response");

    if ($("c-uid")) $("c-uid").value = uid;
    if ($("approve-status")) $("approve-status").textContent = "✓ Approved!";

    // UID-truth rank + tag
    const rank = isF8Uid(uid) ? "Shadow" : "Apprentice";
    const fallbackTag = buildTagFromUid(uid, lane, virtue);

    paintMintUI({
      track,
      lane,
      tier: "T0",
      rank,
      uid,
      padlock: "—",
      mintTag: mintVirtueTag || fallbackTag,
    });

    setApprovedUI(true, uid);
    openSuccessModal(uid);

  } catch (err) {
    console.error("[approveAthlete] approveAndActivate failed:", err);
    if ($("approve-status")) $("approve-status").textContent = "⚠ Approve failed. Check console.";
    setApproveEnabled(true);   // optional redundancy, safe
    setApprovedUI(false);
    throw err;                 // lets preventDoubleTap re-enable on failure
  }
}

// Bind ONCE (remove any older direct addEventListener you had before)
const approveBtn = $("btn-approve");
if (approveBtn) {
  approveBtn.addEventListener("click", preventDoubleTap(approveBtn, approveAthlete));
}

// ------------------------------------------------------
// Onboarding modal
// ------------------------------------------------------
function openSuccessModal(uid) {
  const link = `${location.origin}/athlete-onboarding/?id=${encodeURIComponent(uid)}`;

  if ($("onboarding-link")) $("onboarding-link").value = link;

  if ($("copy-link")) $("copy-link").disabled = false;
  if ($("open-link")) $("open-link").disabled = false;

  showApprovalModal();

  if ($("copy-link")) {
    $("copy-link").onclick = () => navigator.clipboard.writeText(link);
  }
  if ($("open-link")) {
    $("open-link").onclick = () => window.open(link, "_blank", "noopener");
  }
}

// Back button
$("btn-back")?.addEventListener("click", () => {
  location.href = "./index.html";
});

// initial preview paint (empty until mint)
updateMintTagPreview();