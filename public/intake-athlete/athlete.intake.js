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
  ensureSignedIn,
} from "../assets/js/firebase-init.js";

import { getInviteFromURL, requireValidInvite } from "/intake-shared/token.js";
import { digitsOnly, titleCase, splitFullName } from "/intake-shared/helpers.js";
import { validateEmail, validateUSPhone10 } from "/intake-shared/validators.js";

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

const WAIVER_URL_EN =
  "/waiver/sandman-adult-participation-waiver-en.pdf";

const WAIVER_URL_ES =
  "/waiver/sandman-adult-participation-waiver-es.pdf";
let waiverViewed = false;

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
    dateEl.disabled = true;
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

function normalizeState(s) {
  return String(s || "").trim().toUpperCase().slice(0, 2);
}

function normalizePhoneDigits10(s) {
  return digitsOnly(s).slice(0, 10);
}

function fail(msg, focusId) {
  setWaiverStatusStrong(`⚠ ${msg}`, "#fbbf24");
  if (focusId && $(focusId)) $(focusId).focus();
  throw new Error(msg);
}

function validateFormBasics() {
  const email = val("athleteEmail");
  const phoneDigits = normalizePhoneDigits10(val("athletePhone"));

  const full = val("athleteName");
  const dob = val("dob");

  const city = val("city");
  const state = normalizeState(val("state"));

  const emerName = val("emergencyName");
  const emerPhoneDigits = normalizePhoneDigits10(val("emergencyPhone"));

  const medical = val("medical");

  if (!validateEmail(email)) fail("Enter a valid athlete email.", "athleteEmail");
  if (!validateUSPhone10(phoneDigits))
    fail("Enter a valid 10-digit athlete phone.", "athletePhone");

  if (!full) fail("Enter athlete first & last name.", "athleteName");
  const { first, last } = splitFullName(full);
  if (!first || !last)
    fail("Athlete name must include first and last name.", "athleteName");

  if (!dob) fail("Enter date of birth.", "dob");

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

function setPrefillIfBlank(elementId, value) {
  const element = $(elementId);

  if (
    !element ||
    String(element.value || "").trim()
  ) {
    return;
  }

  const nextValue = String(value || "").trim();
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

  setPrefillIfBlank("athleteName", prefill.athleteName);
  setPrefillIfBlank("dob", prefill.dob);
  setPrefillIfBlank("city", prefill.city);
  setPrefillIfBlank("state", prefill.state);
  setPrefillIfBlank("athleteEmail", prefill.email);
  setPrefillIfBlank("athletePhone", prefill.phone);

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
    lead.athleteName || lead.participantName
  );
  setPrefillIfBlank(
    "dob",
    lead.dob || lead.dateOfBirth
  );
  setPrefillIfBlank(
    "athleteEmail",
    lead.email
  );
  setPrefillIfBlank(
    "athletePhone",
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

async function writeIntake(tokenId, payload) {
  const safe = {
    ...payload,
    tokenId,
    updatedAt: serverTimestamp(),
  };

  if (!safe.createdAt) safe.createdAt = serverTimestamp();

  await setDoc(doc(db, "intakes", tokenId), safe, { merge: true });
}

async function handleSubmit(e) {
  e?.preventDefault?.();

  const btn = $("submitBtn");
  btn?.setAttribute("disabled", "disabled");

  try {
    const { rawToken, token, tokenId, exp } = await requireValidInvite();

    const intakeAudience =
      String(token.intakeAudience || "").trim().toLowerCase();

    if (intakeAudience !== "adult_athlete") {
      fail("This invite is not an Adult Athlete intake.");
    }

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
      fail("Invite token missing canonical id (tokenId).", "openWaiverBtnEn");

    if (!waiverAgreementOK()) {
      fail("Open waiver PDF, check the box, add signature + date.", "openWaiverBtnEn");
    }

    const v = validateFormBasics();

    const sign = titleCase(val("signatureAthlete"));
    const signDate = val("signatureDate");
    if (!sign) fail("Type your full name as signature.", "signatureAthlete");
    if (!signDate) fail("Select today’s date.", "signatureDate");

    const intake = {
      connectLeadId,

      proposalId:
        String(token.proposalId || "").trim() || null,

      locationId:
        String(token.locationId || "").trim() || null,

      intakeAudience: "adult_athlete",

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
        email: v.email,
        phoneDigits: v.phoneDigits,
        languagePreference:
          leadLanguagePreference ||
          normalizeLanguagePreference(token.languagePreference) ||
          null,
      },

      athleteEmail: v.email,
      email: v.email,
      athletePhoneDigits: v.phoneDigits,
      phoneDigits: v.phoneDigits,

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
        signerType: "adult_athlete",
        signingAuthority: "self",
        signatureName: sign,
        signatureDate: signDate,
      },

      status: "submitted",
      minted: false,
      approvedUid: null,

      source: "intake-athlete-ui",
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
      Confirm your information below. Management will attach
      <strong>${formatDisciplineLabel(discipline)}</strong>
      to the athlete's existing Sandman profile.
      <span class="lang-alt-block">
        Confirme la información del atleta.
        Administración agregará esta disciplina al perfil existente del atleta.
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

document.addEventListener("DOMContentLoaded", async () => {
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
    console.error("[intake-athlete] ensureSignedIn failed:", e);
    setWaiverStatusStrong("⚠ Auth failed (cannot submit).", "#fbbf24");
    setDisabled("submitBtn", true);
    return;
  }

  const tok = getInviteFromURL();
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
        "adult_athlete"
      ) {
        throw new Error("This invite is not an Adult Athlete intake.");
      }

      await applyInviteModeUI(invite);

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