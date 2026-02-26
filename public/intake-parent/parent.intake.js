// /intake-parent/parent.intake.js
// Parent Intake (Split v2) — token-gated submit + waiver unlock
// Required HTML IDs:
// parentEmail, parentPhone
// athleteName, dob
// team, city, state
// emergencyName, emergencyPhone
// medical
// openWaiverBtn, waiverStatus, waiverCheck, signatureParent, signatureDate, submitBtn
// intakeForm

import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,          // ✅ add this
  serverTimestamp
} from "../assets/js/firebase-init.js";

import { getInviteFromURL, requireValidInvite } from "/intake-shared/token.js";
import { digitsOnly, titleCase, splitFullName } from "/intake-shared/helpers.js";
import { validateEmail, validateUSPhone10 } from "/intake-shared/validators.js";

// -------------------- DOM helpers --------------------
const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value ?? "").trim();
const setDisabled = (id, v) => { const el = $(id); if (el) el.disabled = !!v; };

function setWaiverStatusStrong(text, color = "") {
  const el = $("waiverStatus");
  if (!el) return;
  const style = color ? ` style="color:${color}"` : "";
  el.innerHTML = `Status: <strong${style}>${text}</strong>`;
}

// -------------------- Waiver config --------------------
const WAIVER_URL = "/waiver/sandman-waiver-v3.pdf";
let waiverViewed = false;

// -------------------- Waiver gating --------------------
function waiverAgreementOK() {
  return (
    waiverViewed &&
    !!$("waiverCheck")?.checked &&
    !!val("signatureParent") &&
    !!val("signatureDate")
  );
}

function maybeUnlockSubmit() {
  setDisabled("submitBtn", !waiverAgreementOK());
}

function markWaiverViewed() {
  waiverViewed = true;
  setWaiverStatusStrong("Viewed");

  setDisabled("waiverCheck", false);
  setDisabled("signatureParent", false);

  const todayISO = new Date().toISOString().slice(0, 10);
  const dateEl = $("signatureDate");
  if (dateEl) {
    dateEl.value = todayISO;
    dateEl.readOnly = true;
    dateEl.disabled = true; // hard lock
  }

  maybeUnlockSubmit();
}

// -------------------- Normalizers --------------------
function normalizeState(s) {
  return String(s || "").trim().toUpperCase().slice(0, 2);
}

function normalizePhoneDigits10(s) {
  return digitsOnly(s).slice(0, 10);
}

// -------------------- Validation --------------------
function fail(msg, focusId) {
  setWaiverStatusStrong(`⚠ ${msg}`, "#fbbf24");
  if (focusId && $(focusId)) $(focusId).focus();
  throw new Error(msg);
}

function validateFormBasics() {
  // parent
  const email = val("parentEmail");
  const phoneDigits = normalizePhoneDigits10(val("parentPhone"));

  // athlete
  const full = val("athleteName");
  const dob = val("dob");

  // location
  const team = val("team");
  const city = val("city");
  const state = normalizeState(val("state"));

  // emergency (split)
  const emerName = val("emergencyName");
  const emerPhoneDigits = normalizePhoneDigits10(val("emergencyPhone"));

  // medical
  const medical = val("medical");

  if (!validateEmail(email)) fail("Enter a valid parent email.", "parentEmail");
  if (!validateUSPhone10(phoneDigits)) fail("Enter a valid 10-digit parent phone.", "parentPhone");

  if (!full) fail("Enter athlete first & last name.", "athleteName");
  const { first, last } = splitFullName(full);
  if (!first || !last) fail("Athlete name must include first and last name.", "athleteName");

  if (!dob) fail("Enter date of birth.", "dob");

  // if TEAM is required, uncomment:
  // if (!team) fail("Enter team/school name.", "team");

  if (!city) fail("Enter city.", "city");
  if (!state || state.length !== 2) fail("Enter state (2 letters).", "state");

  if (!emerName) fail("Enter emergency contact name.", "emergencyName");
  if (!validateUSPhone10(emerPhoneDigits)) fail("Enter a valid 10-digit emergency phone.", "emergencyPhone");

  return {
    email: email.toLowerCase(),
    phoneDigits,

    first,
    last,
    dob,

    team: team ? titleCase(team) : null,
    city: titleCase(city),
    state,

    emerName: titleCase(emerName),
    emerPhoneDigits,

    medical: String(medical || "").trim(),
  };
}

// -------------------- Firestore write --------------------
// ✅ write to intakes/{tokenId} (canonical id from verifier)
async function writeIntake(tokenId, payload) {
  await setDoc(doc(db, "intakes", tokenId), payload, { merge: true });
}

// -------------------- Submit handler --------------------
async function handleSubmit(e) {
  e?.preventDefault?.();

  const btn = $("submitBtn");
  btn?.setAttribute("disabled", "disabled");

  try {
    // 0) token must be valid + not expired
    const { token, tokenId, exp } = await requireValidInvite();
    if (!tokenId) fail("Invite token missing canonical id (tokenId).", "openWaiverBtn");

    // 1) waiver gate
    if (!waiverAgreementOK()) {
      fail("Open waiver PDF, check the box, add signature + date.", "openWaiverBtn");
    }

    // 2) validate fields
    const v = validateFormBasics();

    // 3) signature
    const sign = titleCase(val("signatureParent"));
    const signDate = val("signatureDate");
    if (!sign) fail("Type your full name as signature.", "signatureParent");
    if (!signDate) fail("Select today’s date.", "signatureDate");

// 4) payload (clean, consistent shape)
// ------------------------------------------------------
// Parent Intake Payload (Canonical)
// ------------------------------------------------------
const intake = {
  // ---- token + lifecycle ----
  tokenId,
  tokenRaw: token,
  exp: exp ?? null,

  // ---- ROOT MIRRORS (for coach lists, queries, UI speed) ----
  first: titleCase(v.first),
  last: titleCase(v.last),
  dob: v.dob,

  // ---- structured data ----
  athlete: {
    first: titleCase(v.first),
    last: titleCase(v.last),
    dob: v.dob,
  },

  parent: {
    email: v.email,
    phoneDigits: v.phoneDigits,
  },

  location: {
    team: v.team,
    city: v.city,
    state: v.state,
  },

  emergency: {
    name: v.emerName,
    phoneDigits: v.emerPhoneDigits,
  },

  medical: String(v.medical || "").trim() || "None",

  waiver: {
    viewed: true,
    agreed: true,
    signatureName: sign,
    signatureDate: signDate,
  },

  // ---- state flags (coach-controlled later) ----
  status: "submitted",     // invited → submitted → approved
  minted: false,           // flipped TRUE when coach mints
  approvedUid: null,       // set on approve

  // ---- system ----
  source: "intake-parent-ui",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

    // 5) write
    await writeIntake(tokenId, intake);
// during submit
    // 6) success UX
    setWaiverStatusStrong("Submitted ✅", "#34d399");

    // lock form inputs after submit
    document.querySelectorAll("#intakeForm input, #intakeForm textarea, #intakeForm button")
      .forEach((el) => { el.disabled = true; });

    // allow opening the waiver still (optional)
    if ($("openWaiverBtn")) $("openWaiverBtn").disabled = false;

    console.log("[intake-parent] submitted:", tokenId, intake);
  } catch (err) {
    console.error("[intake-parent] submit error:", err);
    btn?.removeAttribute("disabled");
    setWaiverStatusStrong(`⚠ ${err?.message || err}`, "#fbbf24");
  }
}

// -------------------- Wiring --------------------
function wireReturn() {
  const btn = $("returnBtn");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    document
      .getElementById("intakeForm")
      ?.scrollIntoView({ behavior: "smooth" });
  });
}

function wireWaiver() {
  setDisabled("waiverCheck", true);
  setDisabled("signatureParent", true);
  setDisabled("signatureDate", true);
  setDisabled("submitBtn", true);

  $("openWaiverBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.open(WAIVER_URL, "_blank", "noopener");
    markWaiverViewed();
  });

  ["waiverCheck", "signatureParent", "signatureDate"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    ["input", "change"].forEach((evt) => el.addEventListener(evt, maybeUnlockSubmit));
  });
}

function wirePhoneSanitizer(id) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = digitsOnly(el.value).slice(0, 10);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const tok = getInviteFromURL();
  if (!tok) setWaiverStatusStrong("Not Viewed (missing invite token)", "#fbbf24");
  wireWaiver(); // 🔑 REQUIRED

  wirePhoneSanitizer("parentPhone");
  wirePhoneSanitizer("emergencyPhone");

  $("intakeForm")?.addEventListener("submit", handleSubmit);

  // Don’t double-fire: keep this OFF unless you have a non-submit button.
  // $("submitBtn")?.addEventListener("click", handleSubmit);
});
