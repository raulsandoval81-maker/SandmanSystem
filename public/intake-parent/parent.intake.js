// /intake-parent/parent.intake.js
// Parent Intake (Split v2) — token-gated submit + waiver unlock
// Required HTML IDs:
// parentName, parentEmail, parentPhone
// athleteName, dob
// city, state
// emergencyName, emergencyPhone
// medical
// openWaiverBtn, waiverStatus, waiverSignerSummary, submitBtn
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

function activeLanguage() {
  const selectedSpanish =
    document.getElementById("languageSpanish")
      ?.getAttribute("aria-pressed") === "true";

  const selectedEnglish =
    document.getElementById("languageEnglish")
      ?.getAttribute("aria-pressed") === "true";

  if (selectedSpanish) return "es";
  if (selectedEnglish) return "en";

  try {
    const saved =
      localStorage.getItem(
        "sandman-language"
      );

    if (saved === "es" || saved === "en") {
      return saved;
    }
  } catch (_) {
    // Ignore unavailable localStorage.
  }

  return document.documentElement.lang === "es"
    ? "es"
    : "en";
}

function setWaiverStatusStrong(text, color = "") {
  const el = $("waiverStatus");
  if (!el) return;

  const label =
    activeLanguage() === "es"
      ? "Estado"
      : "Status";

  const style =
    color
      ? ` style="color:${color}"`
      : "";

  el.innerHTML =
    `${label}: <strong${style}>${text}</strong>`;
}

// -------------------- Waiver config --------------------
const WAIVER_URL_EN =
  "/waiver/?audience=parent_guardian&lang=en";

const WAIVER_URL_ES =
  "/waiver/?audience=parent_guardian&lang=es";
let waiverAcceptance = null;
let currentInviteToken = "";
let inviteReady = false;

let leadLanguagePreference = null;
let intakeOwnerUid = null;

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

function localDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function calculateAge(dobDate, referenceDate = new Date()) {
  let age = referenceDate.getFullYear() - dobDate.getFullYear();
  const monthDelta = referenceDate.getMonth() - dobDate.getMonth();

  if (
    monthDelta < 0 ||
    (monthDelta === 0 && referenceDate.getDate() < dobDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function normalizeIdentityText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// -------------------- Waiver gating --------------------
function waiverStorageKey() {
  return currentInviteToken
    ? `sandman-waiver-acceptance:${currentInviteToken}`
    : "";
}

function waiverAgreementOK() {
  return Boolean(
    waiverAcceptance?.agreed === true &&
    waiverAcceptance?.signatureName &&
    waiverAcceptance?.signatureDate
  );
}

function maybeUnlockSubmit() {
  setDisabled(
    "submitBtn",
    !(inviteReady && waiverAgreementOK())
  );
}

function applyWaiverAcceptance(acceptance) {
  if (
    !acceptance ||
    acceptance.invite !== currentInviteToken ||
    acceptance.audience !== "parent_guardian" ||
    acceptance.agreed !== true
  ) {
    return;
  }

  waiverAcceptance =
    acceptance;

  const spanish =
    activeLanguage() === "es";

  setWaiverStatusStrong(
    spanish
      ? "Firmada"
      : "Signed",
    "#34d399"
  );

  const summary =
    $("waiverSignerSummary");

  if (summary) {
    summary.hidden = false;
    summary.textContent =
      spanish
        ? `Firmado por ${acceptance.signatureName} el ${acceptance.signatureDate}.`
        : `Signed by ${acceptance.signatureName} on ${acceptance.signatureDate}.`;
  }

  maybeUnlockSubmit();
}

function readWaiverAcceptance() {
  const key =
    waiverStorageKey();

  if (!key) return;

  try {
    const raw =
      localStorage.getItem(key);

    if (!raw) return;

    applyWaiverAcceptance(
      JSON.parse(raw)
    );
  } catch (_) {
    // Ignore malformed or unavailable local storage.
  }
}

function openWaiver(url) {
  window.open(
    url,
    "_blank",
    "noopener"
  );
}

$("openWaiverBtn")?.addEventListener("click", () => {
  const baseUrl =
    activeLanguage() === "es"
      ? WAIVER_URL_ES
      : WAIVER_URL_EN;

  const separator =
    baseUrl.includes("?")
      ? "&"
      : "?";

  const waiverUrl =
    currentInviteToken
      ? `${baseUrl}${separator}invite=${encodeURIComponent(currentInviteToken)}`
      : baseUrl;

  openWaiver(
    waiverUrl
  );
});

// -------------------- Normalizers --------------------
function normalizeState(s) {
  return String(s || "").trim().toUpperCase().slice(0, 2);
}

function normalizePhoneDigits10(s) {
  const digits = digitsOnly(s);
  const withoutCountryCode =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits;

  return withoutCountryCode.slice(0, 10);
}

// -------------------- Validation --------------------
function fail(msg, focusId) {
  setWaiverStatusStrong(`⚠ ${msg}`, "#fbbf24");
  if (focusId && $(focusId)) $(focusId).focus();
  throw new Error(msg);
}

function validateParentDob(dob) {
  const dobDate = parseISODate(dob);
  if (!dobDate) {
    fail("Enter a valid date of birth.", "dob");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (dobDate > today) {
    fail("Date of birth cannot be in the future.", "dob");
  }

  const age = calculateAge(dobDate, today);
  if (age >= 18) {
    fail(
      "Athletes age 18 or older must complete the Adult Athlete intake.",
      "dob"
    );
  }
}

function validateFormBasics() {
  // parent
  const parentName = val("parentName");
  const email = val("parentEmail");
  const phoneDigits = normalizePhoneDigits10(val("parentPhone"));

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

  if (!parentName)
    fail("Enter parent or guardian name.", "parentName");

  const parentParts = splitFullName(parentName);
  if (!parentParts.first || !parentParts.last) {
    fail(
      "Parent or guardian name must include first and last name.",
      "parentName"
    );
  }

  if (!validateEmail(email)) fail("Enter a valid parent email.", "parentEmail");
  if (!validateUSPhone10(phoneDigits))
    fail("Enter a valid 10-digit parent phone.", "parentPhone");

  if (!full) fail("Enter athlete first & last name.", "athleteName");
  const { first, last } = splitFullName(full);
  if (!first || !last)
    fail("Athlete name must include first and last name.", "athleteName");

  if (!dob) fail("Enter date of birth.", "dob");
  validateParentDob(dob);

  if (!city) fail("Enter city.", "city");
  if (!/^[A-Z]{2}$/.test(state)) fail("Enter state (2 letters).", "state");

  if (!emerName) fail("Enter emergency contact name.", "emergencyName");
  if (!validateUSPhone10(emerPhoneDigits))
    fail("Enter a valid 10-digit emergency phone.", "emergencyPhone");

  return {
    parentName: titleCase(parentName),
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

function setPrefillIfBlank(
  elementId,
  value
) {
  const element = $(elementId);

  if (
    !element ||
    String(element.value || "").trim()
  ) {
    return;
  }

  const nextValue =
    String(value || "").trim();

  if (nextValue) {
    element.value = nextValue;
  }
}

function prefillFromToken(prefill = {}) {
  if (
    !prefill ||
    typeof prefill !== "object"
  ) {
    return;
  }

  setPrefillIfBlank(
    "athleteName",
    prefill.athleteName
  );

  setPrefillIfBlank(
    "dob",
    prefill.dob
  );

  setPrefillIfBlank(
    "city",
    prefill.city
  );

  setPrefillIfBlank(
    "state",
    prefill.state
  );

  setPrefillIfBlank(
    "parentName",
    prefill.parentName
  );

  setPrefillIfBlank(
    "parentEmail",
    prefill.email
  );

  setPrefillIfBlank(
    "parentPhone",
    prefill.phone
  );

  leadLanguagePreference =
    normalizeLanguagePreference(
      prefill.languagePreference || ""
    ) ||
    leadLanguagePreference;
}

async function prefillFromLead(connectLeadId) {
  if (!connectLeadId) return;

  const snap = await getDoc(
    doc(db, "interest_leads", connectLeadId)
  );

  if (!snap.exists()) return;

  const lead = snap.data();

  leadLanguagePreference =
    leadLanguagePreference ||
    normalizeLanguagePreference(
      lead.languagePreference ||
      lead.preferredLanguage ||
      lead.language ||
      ""
    );

  setPrefillIfBlank(
    "athleteName",
    lead.athleteName
  );

  setPrefillIfBlank(
    "dob",
    lead.dob ||
    lead.dateOfBirth
  );

  setPrefillIfBlank(
    "parentName",
    lead.parentName ||
    lead.guardianName
  );

  setPrefillIfBlank(
    "parentEmail",
    lead.email ||
    lead.parentEmail
  );

  setPrefillIfBlank(
    "parentPhone",
    lead.phone
  );

  setPrefillIfBlank(
    "city",
    lead.city
  );

  setPrefillIfBlank(
    "state",
    lead.state
  );
}

// -------------------- Firestore write --------------------
async function writeIntake(tokenId, payload) {
  const safe = {
    ...payload,
    tokenId,
    updatedAt: serverTimestamp(),
  };

  if (!safe.createdAt) safe.createdAt = serverTimestamp();

  await setDoc(doc(db, "intakes", tokenId), safe, { merge: true });
}

// -------------------- Submit handler --------------------
async function handleSubmit(e) {
  e?.preventDefault?.();

  const btn = $("submitBtn");
  btn?.setAttribute("disabled", "disabled");

  try {
    const { rawToken, token, tokenId, exp } =
      await requireValidInvite();

    const intakeAudience =
      String(token.intakeAudience || "").trim().toLowerCase();

    if (intakeAudience !== "parent_guardian") {
      fail("This invite is not a Parent / Guardian intake.");
    }

    const connectLeadId =
      token.connectLeadId || null;

    const intakeMode =
      String(token.mode || "new_athlete").trim().toLowerCase();

    if (!["new_athlete", "add_sport"].includes(intakeMode)) {
      fail(
        "This invite uses an unsupported intake mode. Contact Management for a new invite."
      );
    }

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

    if (!inviteReady) {
      fail("This intake invite is not ready for submission.", "openWaiverBtn");
    }

    if (!waiverAgreementOK()) {
      fail(
        activeLanguage() === "es"
          ? "Abra la exención, acéptela y fírmela antes de continuar."
          : "Open the waiver, accept it, and sign it before continuing.",
        "openWaiverBtn"
      );
    }

    const v = validateFormBasics();

    if (intakeMode === "add_sport") {
      const expectedName =
        String(token.existingAthleteName || "").trim();
      const expectedDob =
        String(
          token.existingAthleteDob ||
          token.prefill?.dob ||
          ""
        ).trim();
      const submittedName = `${v.first} ${v.last}`;

      if (
        expectedName &&
        normalizeIdentityText(submittedName) !== normalizeIdentityText(expectedName)
      ) {
        fail(
          "This add-discipline invite is assigned to a different athlete. Athlete identity cannot be changed on this intake.",
          "athleteName"
        );
      }

      if (expectedDob && v.dob !== expectedDob) {
        fail(
          "Date of birth does not match the athlete assigned to this invite.",
          "dob"
        );
      }
    }

    const sign =
      titleCase(
        waiverAcceptance.signatureName
      );

    const signDate =
      waiverAcceptance.signatureDate;

    const signatureParts =
      splitFullName(sign);

    if (
      !signatureParts.first ||
      !signatureParts.last
    ) {
      fail(
        activeLanguage() === "es"
          ? "La firma electrónica debe incluir nombre y apellido."
          : "Electronic signature must include first and last name.",
        "openWaiverBtn"
      );
    }

    if (signDate !== localDateISO()) {
      fail(
        activeLanguage() === "es"
          ? "La fecha de la firma debe ser hoy."
          : "Signature date must be today.",
        "openWaiverBtn"
      );
    }

    const intake = {
      connectLeadId,

      proposalId:
        String(token.proposalId || "").trim() || null,

      locationId:
        String(token.locationId || "").trim() || null,

      intakeAudience: "parent_guardian",

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

      tokenId,
      ownerUid: intakeOwnerUid,
      tokenRaw: rawToken,
      exp: exp ?? null,

      first: titleCase(v.first),
      last: titleCase(v.last),
      dob: v.dob,

      athlete: {
        first: titleCase(v.first),
        last: titleCase(v.last),
        dob: v.dob,
      },

      parentName:
        v.parentName,

      parent: {
        name: v.parentName,
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
        signerType: "parent_guardian",
        signingAuthority: "guardian_for_athlete",
        signatureName: sign,
        signatureDate: signDate,
        acceptedAt:
          waiverAcceptance.acceptedAt || null,
        language:
          waiverAcceptance.language || activeLanguage(),
        waiverVersion:
          waiverAcceptance.waiverVersion ||
          "participation-waiver-v1",
      },

      status: "submitted",
      minted: false,
      approvedUid: null,

      source: "intake-parent-ui",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await writeIntake(tokenId, intake);

    setWaiverStatusStrong("Submitted ✅", "#34d399");

    document
      .querySelectorAll("#intakeForm input, #intakeForm textarea, #intakeForm button")
      .forEach((el) => {
        el.disabled = true;
      });

    if ($("openWaiverBtn")) {
      $("openWaiverBtn").disabled = false;
    }

    console.log("[intake-parent] submitted:", tokenId, intake);
    window.location.href = "/intake-parent/thanks.html";
  } catch (err) {
    console.error("[intake-parent] submit error:", err);
    btn?.removeAttribute("disabled");
    setWaiverStatusStrong(`⚠ ${err?.message || err}`, "#fbbf24");
    maybeUnlockSubmit();
  }
}

// -------------------- Wiring --------------------
function wireWaiver() {
  setDisabled(
    "submitBtn",
    true
  );

  window.addEventListener(
    "storage",
    (event) => {
      if (
        event.key !== waiverStorageKey() ||
        !event.newValue
      ) {
        return;
      }

      try {
        applyWaiverAcceptance(
          JSON.parse(event.newValue)
        );
      } catch (_) {
        // Ignore malformed cross-tab storage payloads.
      }
    }
  );

  window.addEventListener(
    "focus",
    readWaiverAcceptance
  );
}

function wirePhoneSanitizer(id) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => {
    el.value = normalizePhoneDigits10(el.value);
  });
}

function configureDateInputs() {
  const dobEl = $("dob");
  if (dobEl) {
    dobEl.max = localDateISO();
  }
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
      ""
    ).trim();

  const athleteDob =
    String(
      token.existingAthleteDob ||
      token.prefill?.dob ||
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

  const athleteNameEl = $("athleteName");
  if (athleteNameEl && athleteName) {
    athleteNameEl.value = athleteName;
    athleteNameEl.readOnly = true;
    athleteNameEl.setAttribute("aria-readonly", "true");
  }

  const dobEl = $("dob");
  if (dobEl && athleteDob) {
    dobEl.value = athleteDob;
    dobEl.readOnly = true;
    dobEl.setAttribute("aria-readonly", "true");
  }

  if ($("placementNote")) {
    $("placementNote").innerHTML = `
      Confirm the athlete and parent information below. The coach will attach
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
  configureDateInputs();

  try {
    const signedInUser =
      await ensureSignedIn();

    intakeOwnerUid =
      signedInUser?.uid || null;

    if (!intakeOwnerUid) {
      throw new Error(
        "Unable to establish secure intake session."
      );
    }
  } catch (e) {
    console.error("[intake-parent] ensureSignedIn failed:", e);
    setWaiverStatusStrong("⚠ Auth failed (cannot submit).", "#fbbf24");
    setDisabled("submitBtn", true);
    return;
  }

  const tok = getInviteFromURL();

  currentInviteToken =
    String(tok || "").trim();

  if (!tok) {
    setWaiverStatusStrong(
      "⚠ Missing invite token.",
      "#fbbf24"
    );
  } else {
    try {
      const invite = await requireValidInvite();

      if (
        String(invite.token.intakeAudience || "").trim().toLowerCase() !==
        "parent_guardian"
      ) {
        throw new Error("This invite is not a Parent / Guardian intake.");
      }

      const intakeMode =
        String(invite.token.mode || "new_athlete")
          .trim()
          .toLowerCase();

      if (!["new_athlete", "add_sport"].includes(intakeMode)) {
        throw new Error(
          "This invite uses an unsupported intake mode. Contact Management for a new invite."
        );
      }

      prefillFromToken(
        invite.token.prefill || {}
      );

      if (
        String(invite.token.workflowVersion || "") !== "intake-v2"
      ) {
        await prefillFromLead(
          invite.token.connectLeadId || null
        );
      }

      await applyInviteModeUI(invite);

      inviteReady = true;
    } catch (err) {
      console.error(
        "[intake-parent] invite mode UI failed:",
        err
      );

      inviteReady = false;
      setWaiverStatusStrong(
        `⚠ ${err?.message || "Invite could not be loaded."}`,
        "#fbbf24"
      );
    }
  }

  wireWaiver();
  readWaiverAcceptance();
  wirePhoneSanitizer("parentPhone");
  wirePhoneSanitizer("emergencyPhone");

  $("intakeForm")?.addEventListener("submit", handleSubmit);
});