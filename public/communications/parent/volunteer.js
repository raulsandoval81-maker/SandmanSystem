// ------------------------------------------------------------
// /communications/parent/volunteer.js
// Parent Volunteer Interest Form
//
// Writes:
//   paraVolunteerInbox/{requestId}
//   paraVolunteerInbox/{requestId}/thread/{messageId}
//
// Notes:
// - Volunteer requests remain separate from paraThreads.
// - Parent authentication is required.
// - Athlete and discipline context are preserved.
// - New requests begin with status: pending.
// ------------------------------------------------------------

import {
  db,
  auth,
  ensureSignedIn,
  collection,
  addDoc,
  doc,
  serverTimestamp
} from "/assets/js/firebase-init-para.js";

await ensureSignedIn();

/* =========================
   CONFIG
========================= */

const TEAM_ID = "law";
const LANG_KEY = "paraVolunteerLanguage";

/* =========================
   TRANSLATIONS
========================= */

const dict = {
  en: {
    heroTitle: "Volunteer Interest Form",
    heroSub:
      "Help support Lompoc Academy of Wrestling • Ayude a apoyar a Lompoc Academia de Lucha",

    infoHead:
      "Basic Information / Información básica",

    labelParent:
      "Parent/Guardian Name / Nombre del padre/madre",

    labelAthlete:
      "Athlete Name / Nombre del atleta",

    labelPhone:
      "Phone / Teléfono",

    labelEmail:
      "Email / Correo electrónico",

    labelLanguage:
      "Preferred Language / Idioma preferido",

    optSelect:
      "Select / Seleccione",

    optEnglish:
      "English",

    optSpanish:
      "Español",

    optBoth:
      "Both / Ambos",

    helpHead:
      "Ways I Can Help / Formas en que puedo ayudar",

    helpIntro:
      "Check any areas where you might be willing to help this season. This is not a contract — it just lets us know who to contact.",

    help1:
      "Rides / Transportation",

    help2:
      "Snacks / Meals",

    help3:
      "Scorekeeping / Table",

    help4:
      "Tournament Help",

    help5:
      "Fundraising / Sponsorships",

    help6:
      "Team Events (banquet, senior night)",

    help7:
      "Photos / Video",

    help8:
      "Wherever Needed / Donde sea necesario",

    labelNotes:
      "Notes / Notas (schedule, skills, ideas)",

    btnSubmit:
      "Submit to Coaches",

    btnBack:
      "Back to Parent Communications",

    submitting:
      "Submitting...",

    success:
      "Volunteer form submitted.",

    error:
      "Unable to submit form.",

    required:
      "Please fill in parent name, athlete name, and at least one contact method.",

    oneHelp:
      "Please select at least one area where you can help."
  },

  es: {
    heroTitle:
      "Formulario de Interés para Voluntarios",

    heroSub:
      "Ayude a apoyar a Lompoc Academia de Lucha",

    infoHead:
      "Información básica / Basic Information",

    labelParent:
      "Nombre del padre/madre / Parent/Guardian Name",

    labelAthlete:
      "Nombre del atleta / Athlete Name",

    labelPhone:
      "Teléfono / Phone",

    labelEmail:
      "Correo electrónico / Email",

    labelLanguage:
      "Idioma preferido / Preferred Language",

    optSelect:
      "Seleccione / Select",

    optEnglish:
      "Inglés",

    optSpanish:
      "Español",

    optBoth:
      "Ambos / Both",

    helpHead:
      "Formas en que puedo ayudar / Ways I Can Help",

    helpIntro:
      "Marque las áreas donde podría ayudar esta temporada. Esto no es un contrato; solo nos ayuda a saber a quién contactar.",

    help1:
      "Transportación / Rides",

    help2:
      "Snacks / Comidas",

    help3:
      "Anotación / Mesa",

    help4:
      "Ayuda en torneos",

    help5:
      "Recaudación de fondos / Patrocinios",

    help6:
      "Eventos del equipo (banquete, noche de seniors)",

    help7:
      "Fotos / Video",

    help8:
      "Donde sea necesario / Wherever Needed",

    labelNotes:
      "Notas (horario, habilidades, ideas)",

    btnSubmit:
      "Enviar a entrenadores",

    btnBack:
      "Volver a Comunicaciones Para Padres",

    submitting:
      "Enviando...",

    success:
      "Formulario enviado.",

    error:
      "No se pudo enviar el formulario.",

    required:
      "Complete el nombre del padre/madre, el nombre del atleta y al menos una forma de contacto.",

    oneHelp:
      "Seleccione al menos una forma en que puede ayudar."
  }
};

/* =========================
   DOM
========================= */

const $ = (id) =>
  document.getElementById(id);

let submitting = false;

/* =========================
   URL CONTEXT
========================= */

const params =
  new URLSearchParams(
    window.location.search
  );

const athleteId =
  String(
    params.get("athleteId") ||
    params.get("athleteUid") ||
    params.get("id") ||
    localStorage.getItem(
      "currentAthleteId"
    ) ||
    sessionStorage.getItem(
      "currentAthleteId"
    ) ||
    ""
  )
    .trim()
    .toUpperCase();

const discipline =
  normalizeDiscipline(
    params.get("discipline") ||
    localStorage.getItem(
      "currentDiscipline"
    ) ||
    sessionStorage.getItem(
      "currentDiscipline"
    ) ||
    ""
  );

/* =========================
   HELPERS
========================= */

function normalizeDiscipline(
  value = ""
) {
  const raw =
    String(value || "")
      .trim()
      .toLowerCase();

  if (raw.includes("kickbox")) {
    return "kickboxing";
  }

  if (raw.includes("wrest")) {
    return "wrestling";
  }

  if (
    raw === "mma" ||
    raw.includes("mixed martial")
  ) {
    return "mma";
  }

  if (
    raw.includes("submission") ||
    raw.includes("grappling")
  ) {
    return "submission-grappling";
  }

  if (raw.includes("box")) {
    return "boxing";
  }

  return raw;
}

function currentLang() {
  return (
    localStorage.getItem(
      LANG_KEY
    ) || "en"
  );
}

function paintVolunteer(lang) {
  const selectedLang =
    lang || currentLang();

  const bundle =
    dict[selectedLang] ||
    dict.en;

  document
    .querySelectorAll(
      "[data-i18n]"
    )
    .forEach((element) => {
      const key =
        element.getAttribute(
          "data-i18n"
        );

      if (bundle[key]) {
        element.textContent =
          bundle[key];
      }
    });

  document
    .querySelectorAll(
      ".parent-lang-btn"
    )
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.lang ===
          selectedLang
      );
    });

  localStorage.setItem(
    LANG_KEY,
    selectedLang
  );
}

function setStatus(
  message = "",
  ok = false
) {
  const element = $("status");

  if (!element) return;

  element.textContent =
    message;

  element.className =
    `status ${ok ? "ok" : "err"}`;
}

function getHelpAreas() {
  return Array.from(
    document.querySelectorAll(
      ".helpBox:checked"
    )
  ).map(
    (checkbox) =>
      checkbox.value
  );
}

function resetForm() {
  const parentNameEl =
    $("parentName");

  const athleteNameEl =
    $("athleteName");

  const phoneEl =
    $("phone");

  const emailEl =
    $("email");

  const languageEl =
    $("language");

  const notesEl =
    $("notes");

  if (parentNameEl) {
    parentNameEl.value = "";
  }

  if (athleteNameEl) {
    athleteNameEl.value = "";
  }

  if (phoneEl) {
    phoneEl.value = "";
  }

  if (emailEl) {
    emailEl.value = "";
  }

  if (languageEl) {
    languageEl.value = "";
  }

  if (notesEl) {
    notesEl.value = "";
  }

  document
    .querySelectorAll(
      ".helpBox"
    )
    .forEach((checkbox) => {
      checkbox.checked = false;
    });
}

function prefillParentIdentity() {
  const parentNameEl =
    $("parentName");

  const emailEl =
    $("email");

  if (
    parentNameEl &&
    !parentNameEl.value.trim()
  ) {
    parentNameEl.value =
      auth.currentUser
        ?.displayName || "";
  }

  if (
    emailEl &&
    !emailEl.value.trim()
  ) {
    emailEl.value =
      auth.currentUser
        ?.email || "";
  }
}

/* =========================
   SUBMIT
========================= */

async function submitVolunteerForm() {
  if (submitting) return;

  submitting = true;

  const lang =
    currentLang();

  const bundle =
    dict[lang] ||
    dict.en;

  const parentName =
    String(
      $("parentName")?.value ||
      ""
    ).trim();

  const athleteName =
    String(
      $("athleteName")?.value ||
      ""
    ).trim();

  const phone =
    String(
      $("phone")?.value || ""
    ).trim();

  const email =
    String(
      $("email")?.value || ""
    ).trim();

  const preferredLanguage =
    String(
      $("language")?.value ||
      ""
    ).trim();

  const notes =
    String(
      $("notes")?.value || ""
    ).trim();

  const helpAreas =
    getHelpAreas();

  if (
    !parentName ||
    !athleteName ||
    (!phone && !email)
  ) {
    setStatus(
      bundle.required,
      false
    );

    submitting = false;
    return;
  }

  if (!helpAreas.length) {
    setStatus(
      bundle.oneHelp,
      false
    );

    submitting = false;
    return;
  }

  const type =
    helpAreas.join(" • ");

  const availability =
    preferredLanguage ||
    "not set";

  const parentUid =
    auth.currentUser?.uid ||
    null;

  const button =
    $("btn-submit");

  const originalText =
    button?.innerHTML || "";

  if (button) {
    button.disabled = true;
    button.innerHTML =
      `⏳ ${bundle.submitting}`;
  }

  setStatus("");

  try {
    const inboxRef =
      await addDoc(
        collection(
          db,
          "paraVolunteerInbox"
        ),
        {
          teamId:
            TEAM_ID,

          parentUid,
          parentName,
          parentEmail:
            email,

          athleteId,
          athleteUid:
            athleteId,

          athleteName,
          athlete:
            athleteName,

          discipline,

          subject:
            "Volunteer Interest",

          status:
            "pending",

          source:
            "parent-volunteer-form",

          linkedVolunteerId:
            "",

          type,
          availability,
          phone,
          preferredLanguage,
          helpAreas,
          notes,

          coachHasUnread:
            true,

          parentHasUnread:
            false,

          seenByCoach:
            false,

          seenByParent:
            true,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );

    await addDoc(
      collection(
        doc(
          db,
          "paraVolunteerInbox",
          inboxRef.id
        ),
        "thread"
      ),
      {
        from:
          "parent",

        fromUid:
          parentUid,

        fromName:
          parentName,

        athleteId,
        athleteUid:
          athleteId,

        athleteName,
        discipline,

        body:
          notes ||
          `Volunteer areas: ${helpAreas.join(", ")}`,

        createdAt:
          serverTimestamp(),

        seenByCoach:
          false,

        seenByParent:
          true
      }
    );

    setStatus(
      bundle.success,
      true
    );

    resetForm();
    prefillParentIdentity();
  } catch (error) {
    console.error(
      "Volunteer submit failed:",
      error
    );

    setStatus(
      bundle.error,
      false
    );
  } finally {
    submitting = false;

    if (button) {
      button.disabled = false;
      button.innerHTML =
        originalText;
    }
  }
}

/* =========================
   BOOT
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    document
      .querySelectorAll(
        ".parent-lang-btn"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            paintVolunteer(
              button.dataset.lang
            );
          }
        );
      });

    paintVolunteer();
    prefillParentIdentity();

    $("btn-submit")
      ?.addEventListener(
        "click",
        submitVolunteerForm
      );
  }
);
