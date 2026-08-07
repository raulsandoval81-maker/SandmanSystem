// /intake-athlete/athlete.intake.js
// Adult Athlete Intake (Split v1) — token-gated submit + waiver unlock
// Required HTML IDs:
// athleteEmail, athletePhone
// athleteName, dob
// city, state
// emergencyName, emergencyPhone
// medical
// openWaiverBtnEn, openWaiverBtnEs, waiverStatus, waiverCheck, signatureAthlete, signatureDate, submitBtn
// intakeForm

import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  ensureSignedIn, // ✅ REQUIRED so request.auth != null on phones
} from "../assets/js/firebase-init.js";

import { getInviteFromURL, requireValidInvite } from "/intake-shared/token.js";
import { digitsOnly, titleCase, splitFullName } from "/intake-shared/helpers.js";
import { validateEmail, validateUSPhone10 } from "/intake-shared/validators.js";

// -------------------- DOM helpers --------------------
const $ = (id) => document.getElementById(id);
const val = (id) => String($(id)?.value ?? "").trim();
const setDisabled = (id, v) => {
  const el = $(id);
  if (el) el.disabled = !!v;
};

function setWaiverStatusStrong(text, color = "") {
  const el = $("waiverStatus");
  if (!el) return;
  const style = color ? ` style="color:${color}"` : "";
  el.innerHTML = `Status: <strong${style}>${text}</strong>`;
}

// -------------------- Waiver config --------------------

const WAIVER_URL_EN =
  "/waiver/sandman-participation-waiver-en.pdf";

const WAIVER_URL_ES =
  "/waiver/sandman-participation-waiver-es.pdf";
let waiverViewed = false;

let leadLanguagePreference = null;

function normalizeLanguagePreference(value = "") {
  const language = String(value || "")
    .trim()
    .toLowerCase();

  if (
    language === "es" ||
    language === "spanish" ||
    language === "español" ||
    language === "espanol"
  ) {
    return "es";
  }

  if (
    language === "en" ||
    language === "english" ||
    language === "inglés" ||
    language === "ingles"
  ) {
    return "en";
  }

  return null;
}

// -------------------- Waiver gating --------------------
function waiverAgreementOK() {
  return (
    waiverViewed &&
    !!$("waiverCheck")?.checked &&
    !!val("signatureAthlete") &&
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
  setDisabled("signatureAthlete", false);

  const todayISO = new Date().toISOString().slice(0, 10);
  const dateEl = $("signatureDate");
  if (dateEl) {
    dateEl.value = todayISO;
    dateEl.readOnly = true;
    dateEl.disabled = true; // hard lock
  }

  maybeUnlockSubmit();
}

function openWaiver(url) {
  window.open(url, "_blank", "noopener");
  markWaiverViewed();
}

$("openWaiverBtnEn")?.addEventListener("click", () => {
  openWaiver(WAIVER_URL_EN);
});

$("openWaiverBtnEs")?.addEventListener("click", () => {
  openWaiver(WAIVER_URL_ES);
});

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
  // athlete contact
  const email = val("athleteEmail");
  const phoneDigits = normalizePhoneDigits10(val("athletePhone"));

  // athlete
  const full = val("athleteName");
  const dob = val("dob");

  // location
  const city = val("city");
  const state = normalizeState(val("state"));

  // emergency (split)
  const emerName = val("emergencyName");
  const emerPhoneDigits = normalizePhoneDigits10(val("emergencyPhone"));

  // medical
  const medical = val("medical");

  if (!validateEmail(email)) fail("Enter a valid athlete email.", "athleteEmail");
  if (!validateUSPhone10(phoneDigits))
    fail("Enter a valid 10-digit athlete phone.", "athletePhone");

  if (!full) fail("Enter athlete first & last name.", "athleteName");
  const { first, last } = splitFullName(full);
  if (!first || !last)
    fail("Athlete name must include first and last name.", "athleteName");

  if (!dob) fail("Enter date of birth.", "dob");

  // if TEAM is required, uncomment:

  if (!city) fail("Enter city.", "city");
  if (!state || state.length !== 2) fail("Enter state (2 letters).", "state");

  if (!emerName) fail("Enter emergency contact name.", "emergencyName");
  if (!validateUSPhone10(emerPhoneDigits))
    fail("Enter a valid 10-digit emergency phone.", "emergencyPhone");

  return {
    email: email.toLowerCase(),
    phoneDigits,

    first,
    last,
    dob,

    city: titleCase(city),
    state,

    emerName: titleCase(emerName),
    emerPhoneDigits,

    medical: String(medical || "").trim(),
  };
}

async function prefillFromLead(connectLeadId) {
  if (!connectLeadId) return;

  const snap = await getDoc(
    doc(db, "interest_leads", connectLeadId)
  );

  if (!snap.exists()) return;

  const lead = snap.data();

  leadLanguagePreference = normalizeLanguagePreference(
    lead.languagePreference ||
    lead.preferredLanguage ||
    lead.language ||
    ""
  );

  $("athleteName").value = lead.athleteName || "";
  $("athleteEmail").value = lead.email || "";
  $("athletePhone").value = lead.phone || "";

  // Optional if you collected these:
  // $("city").value = lead.city || "";
  // $("state").value = lead.state || "";
}

// -------------------- Firestore write --------------------
// ✅ write to intakes/{tokenId} (canonical id from verifier)
async function writeIntake(tokenId, payload) {
  const safe = {
    ...payload,
    tokenId,                 // ✅ force correct
    updatedAt: serverTimestamp(), // ✅ always refresh
  };

  // Optional: only set createdAt once
  if (!safe.createdAt) safe.createdAt = serverTimestamp();

  await setDoc(doc(db, "intakes", tokenId), safe, { merge: true });
}
// -------------------- Submit handler --------------------
async function handleSubmit(e) {
  e?.preventDefault?.();

  const btn = $("submitBtn");
  btn?.setAttribute("disabled", "disabled");

  try {
    // 0) token must be valid + not expired
    const { token, tokenId, exp } = await requireValidInvite();

    const connectLeadId =
      token.connectLeadId || null;

    const intakeMode =
      String(token.mode || "new_athlete").trim();

    const existingAthleteUid =
      String(token.existingAthleteUid || "").trim();

    const forTrack =
      String(token.forTrack || "").trim();

    const forLane =
      String(token.forLane || "").trim();

    if (intakeMode === "add_sport") {
      if (
        !existingAthleteUid ||
        !forTrack ||
        !forLane
      ) {
        fail(
          "This add-sport invite is missing athlete or journey information."
        );
      }
    }

    if (!tokenId)
      fail("Invite token missing canonical id (tokenId).", "openWaiverBtn");

    // 1) waiver gate
    if (!waiverAgreementOK()) {
      fail("Open waiver PDF, check the box, add signature + date.", "openWaiverBtn");
    }

    // 2) validate fields
    const v = validateFormBasics();

    // 3) signature
    const sign = titleCase(val("signatureAthlete"));
    const signDate = val("signatureDate");
    if (!sign) fail("Type your full name as signature.", "signatureAthlete");
    if (!signDate) fail("Select today’s date.", "signatureDate");

    // 4) payload (canonical)
    const intake = {

      connectLeadId,

      mode:
        intakeMode === "add_sport"
          ? "add_sport"
          : "new_athlete",

      existingAthleteUid:
        intakeMode === "add_sport"
          ? existingAthleteUid
          : "",

      forTrack:
        intakeMode === "add_sport"
          ? forTrack
          : null,

      forLane:
        intakeMode === "add_sport"
          ? forLane
          : null,

      requestedTrackCode:
        intakeMode === "add_sport"
          ? String(token.requestedTrackCode || "").trim()
          : null,

      requestedDiscipline:
        intakeMode === "add_sport"
          ? String(token.requestedDiscipline || "").trim()
          : null,

      existingAthleteName:
        intakeMode === "add_sport"
          ? String(token.existingAthleteName || "").trim()
          : null,

      workflowVersion:
        String(token.workflowVersion || "v1"),

      // ---- token + lifecycle ----
      tokenId,
      tokenRaw: token,
      exp: exp ?? null,

      // ---- ROOT MIRRORS ----
      first: titleCase(v.first),
      last: titleCase(v.last),
      dob: v.dob,

      // ---- structured ----
      athlete: {
        first: titleCase(v.first),
        last: titleCase(v.last),
        dob: v.dob,
        email: v.email,
        phoneDigits: v.phoneDigits,
        languagePreference:
          leadLanguagePreference ||
          normalizeLanguagePreference(token.languagePreference) ||
          null,
      },

      location: {
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

      // ---- coach controlled later ----
      status: "submitted", // invited → submitted → approved
      minted: false,
      approvedUid: null,

      // ---- system ----
      source: "intake-athlete-ui",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // 5) write
    await writeIntake(tokenId, intake);

    // 6) success UX
    setWaiverStatusStrong("Submitted ✅", "#34d399");

    // lock form inputs after submit
    document
      .querySelectorAll("#intakeForm input, #intakeForm textarea, #intakeForm button")
      .forEach((el) => {
        el.disabled = true;
      });

    // allow opening waiver still (optional)
    if ($("openWaiverBtnEn")) {
      $("openWaiverBtnEn").disabled = false;
    }

    if ($("openWaiverBtnEs")) {
      $("openWaiverBtnEs").disabled = false;
    }

    console.log("[intake-athlete] submitted:", tokenId, intake);
    window.location.href = "/intake-athlete/thanks.html";
  } catch (err) {
    console.error("[intake-athlete] submit error:", err);
    btn?.removeAttribute("disabled");
    setWaiverStatusStrong(`⚠ ${err?.message || err}`, "#fbbf24");
  }
}

// -------------------- Wiring --------------------
function wireWaiver() {
  setDisabled("waiverCheck", true);
  setDisabled("signatureAthlete", true);
  setDisabled("signatureDate", true);
  setDisabled("submitBtn", true);

  $("waiverCheck")
  ?.addEventListener("change", () => {

    const checked =
      !!$("waiverCheck")?.checked;

    setDisabled(
      "signatureAthlete",
      !checked
    );

    maybeUnlockSubmit();
  });

["signatureAthlete", "signatureDate"].forEach((id) => {

  const el = $(id);

  if (!el) return;

  ["input", "change"].forEach((evt) =>
    el.addEventListener(evt, maybeUnlockSubmit)
  );
});
}

function wirePhoneSanitizer(id) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = digitsOnly(el.value).slice(0, 10);
  });
}

// -------------------- Invite mode UI --------------------
function formatDisciplineLabel(value = "") {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
    mma: "MMA",
    "submission-grappling": "Submission Grappling"
  };

  return labels[key] || key || "—";
}

async function applyInviteModeUI(invite) {

  const token =
    invite?.token || {};

  const mode =
    String(token.mode || "new_athlete")
      .trim()
      .toLowerCase();

  if (mode !== "add_sport") {
    return;
  }

  const athleteName =
    String(
      token.existingAthleteName ||
      token.existingAthleteUid ||
      ""
    ).trim();

  const discipline =
    String(
      token.requestedDiscipline ||
      token.forLane ||
      ""
    )
      .trim()
      .toLowerCase();

  const banner =
    $("intakeModeBanner");

  if (banner) {
    banner.hidden = false;
  }

  if ($("intakePageTitle")) {
    $("intakePageTitle").textContent =
      "Add Athlete Discipline";
  }

  if ($("intakePageTitleEs")) {
    $("intakePageTitleEs").textContent =
      "Agregar disciplina del atleta";
  }

  if ($("existingAthleteDisplay")) {
    $("existingAthleteDisplay").textContent =
      athleteName || "Existing athlete";
  }

  if ($("requestedDisciplineDisplay")) {
    $("requestedDisciplineDisplay").textContent =
      formatDisciplineLabel(discipline);
  }

  if ($("placementNote")) {
    $("placementNote").innerHTML = `
      Confirm your information below. The coach will attach
      <strong>${formatDisciplineLabel(discipline)}</strong>
      to the athlete's existing Sandman profile.
      <span class="lang-alt-block">
        Confirme la información del atleta y del padre o tutor.
        El entrenador agregará esta disciplina al perfil existente del atleta.
      </span>
    `;
  }

  if ($("submitLabelEn")) {
    $("submitLabelEn").textContent =
      "Submit Add-Discipline Intake";
  }

  if ($("submitLabelEs")) {
    $("submitLabelEs").textContent =
      "Enviar solicitud para agregar disciplina";
  }
}

// -------------------- Boot --------------------
document.addEventListener("DOMContentLoaded", async () => {
  // ✅ AUTH FIRST (phones)
  try {
    await ensureSignedIn();
  } catch (e) {
    console.error("[intake-athlete] ensureSignedIn failed:", e);
    setWaiverStatusStrong("⚠ Auth failed (cannot submit).", "#fbbf24");
    setDisabled("submitBtn", true);
    return;
  }

  // status if missing token
  const tok = getInviteFromURL();
  if (!tok) {
    setWaiverStatusStrong(
      "⚠ Missing invite token.",
      "#fbbf24"
    );
  } else {


    try {
      const invite = await requireValidInvite();

      await applyInviteModeUI(invite);

      await prefillFromLead(
        invite.token.connectLeadId || null
      );
    } catch (err) {
      console.error(
        "[intake-athlete] invite mode UI failed:",
        err
      );

      setWaiverStatusStrong(
        `⚠ ${err?.message || "Invite could not be loaded."}`,
        "#fbbf24"
      );
    }
  }

  wireWaiver();
  wirePhoneSanitizer("athletePhone");
  wirePhoneSanitizer("emergencyPhone");

  $("intakeForm")?.addEventListener("submit", handleSubmit);
});