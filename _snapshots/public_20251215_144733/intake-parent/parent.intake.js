// /intake-parent/parent.intake.js
// Parent Intake (Split v2) — token-gated submit + waiver unlock
// HTML IDs (locked):
// parentEmail, parentPhone, athleteName, dob, city, state, emergency, medical
// openWaiverBtn, waiverStatus, waiverCheck, signatureParent, signatureDate, submitBtn

import { db } from "/intake-shared/fire.js";
import { doc, setDoc, serverTimestamp } from "/vendor/firebase/10.13.1/firebase-firestore.js";

import { getInviteFromURL, requireValidInvite } from "/intake-shared/token.js";
import { digitsOnly, titleCase, splitFullName } from "/intake-shared/helpers.js";
import { validateEmail, validateUSPhone10 } from "/intake-shared/validators.js";

// -------------------- DOM helpers --------------------
const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value ?? "").trim();
const setDisabled = (id, v) => { const el = $(id); if (el) el.disabled = !!v; };

// Your HTML uses:
// <p id="waiverStatus">Status: <strong>Not Viewed</strong></p>
function setWaiverStatusStrong(text, color = "") {
  const el = $("waiverStatus");
  if (!el) return;
  const style = color ? ` style="color:${color}"` : "";
  el.innerHTML = `Status: <strong${style}>${text}</strong>`;
}

// -------------------- Waiver config --------------------
const WAIVER_URL = "/waiver/sandman-waiver-v3.pdf"; // Hosting must serve this exact path
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
  setDisabled("signatureDate", false);
  maybeUnlockSubmit();
}

// -------------------- Normalizers --------------------
function normalizeState(s) {
  return String(s || "").trim().toUpperCase().slice(0, 2);
}

function normalizePhoneDigits10(s) {
  return digitsOnly(s).slice(0, 10);
}

// Emergency parsing (free-form “Name & Phone”)
function parseEmergency(raw) {
  const t = String(raw || "").trim();
  const phone = digitsOnly(t).slice(0, 10);
  const name = t
    .replace(phone, "")
    .replace(/[-()]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name: titleCase(name), phone };
}

// -------------------- Validation --------------------
function fail(msg, focusId) {
  setWaiverStatusStrong(`⚠ ${msg}`, "#fbbf24");
  if (focusId && $(focusId)) $(focusId).focus();
  throw new Error(msg);
}

function validateFormBasics() {
  const email = val("parentEmail");
  const phoneDigits = normalizePhoneDigits10(val("parentPhone"));
  const full = val("athleteName");
  const dob = val("dob");
  const city = val("city");
  const state = normalizeState(val("state"));
  const emergency = val("emergency");
  const medical = val("medical");

  if (!validateEmail(email)) fail("Enter a valid parent email.", "parentEmail");
  if (!validateUSPhone10(phoneDigits)) fail("Enter a valid 10-digit parent phone.", "parentPhone");
  if (!full) fail("Enter athlete first & last name.", "athleteName");

  const { first, last } = splitFullName(full);
  if (!first || !last) fail("Athlete name must include first and last name.", "athleteName");

  if (!dob) fail("Enter date of birth.", "dob");
  if (!city) fail("Enter city.", "city");
  if (!state || state.length !== 2) fail("Enter state (2 letters).", "state");
  if (!emergency) fail("Enter emergency contact (name and phone).", "emergency");

  const emer = parseEmergency(emergency);
  if (!validateUSPhone10(emer.phone)) fail("Emergency contact must include a 10-digit phone number.", "emergency");

  return {
    email: email.toLowerCase(),
    phoneDigits,
    first,
    last,
    dob,
    city,
    state,
    emergencyRaw: emergency,
    emerName: emer.name,
    emerPhoneDigits: emer.phone,
    medical,
  };
}

// -------------------- Firestore write --------------------
// ✅ IMPORTANT: write to intakes/{tokenId} (canonical id from verifier)
async function writeIntake(tokenId, payload) {
  await setDoc(doc(db, "intakes", tokenId), payload, { merge: true });
}

// -------------------- Submit handler --------------------
async function handleSubmit(e) {
  e.preventDefault();

  const btn = $("submitBtn");
  btn?.setAttribute("disabled", "disabled");

  try {
    // 0) token must be valid + not expired
    const { token, tokenId, exp } = await requireValidInvite(); // throws if invalid
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

    // 4) payload
    const intake = {
      tokenId,                 // canonical doc id
      tokenRaw: token,         // raw input (for logging/debug only)
      exp: exp ?? null,

      // athlete
      first: titleCase(v.first),
      last: titleCase(v.last),
      dob: v.dob,

      // location
      city: titleCase(v.city),
      state: v.state,

      // parent
      parentEmail: v.email,
      parentPhoneRaw: v.phoneDigits,

      // emergency
      emerName: v.emerName,
      emerPhoneRaw: v.emerPhoneDigits,
      emergencyRaw: v.emergencyRaw,

      // medical
      med: String(v.medical || "").trim() || "None",

      // waiver
      waiverViewed: true,
      waiverAgreed: true,
      sign,
      signDate,

      // state machine
      status: "submitted",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: "intake-parent-ui",
    };

    // 5) write
    await writeIntake(tokenId, intake);

    // 6) success UX
    setWaiverStatusStrong("Submitted ✅", "#34d399");

    // lock form inputs after submit (prevents re-submit spam)
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
function wireWaiver() {
  // start locked
  setDisabled("waiverCheck", true);
  setDisabled("signatureParent", true);
  setDisabled("signatureDate", true);
  setDisabled("submitBtn", true);

  $("openWaiverBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.open(WAIVER_URL, "_blank", "noopener");
    markWaiverViewed();
    $("returnBtn") && ($("returnBtn").style.display = "inline-flex");

  });

  ["waiverCheck", "signatureParent", "signatureDate"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    ["input", "change"].forEach((evt) => el.addEventListener(evt, maybeUnlockSubmit));
  });
}

function wirePhoneSanitizer() {
  const el = $("parentPhone");
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = digitsOnly(el.value).slice(0, 10);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // token presence check (don’t block UI here; submit will hard-block)
  const tok = getInviteFromURL();
  if (!tok) setWaiverStatusStrong("Not Viewed (missing invite token)", "#fbbf24");

  wireWaiver();
  wireReturn();
  wirePhoneSanitizer();

  $("intakeForm")?.addEventListener("submit", handleSubmit);
  $("submitBtn")?.addEventListener("click", handleSubmit);
});
