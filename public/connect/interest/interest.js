import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

import {
  getAcademyIdFromUrl,
  getLanguageFromUrl,
  normalizeInterestType,
  buildLeadRoutingMetadata,
  buildAcademyDestination
} from "/assets/js/academy-routing.js";

const form =
  document.getElementById("interestForm");

const submitBtn =
  document.getElementById("submitBtn");

const formStatus =
  document.getElementById("formStatus");

const intentNotice =
  document.getElementById("intentNotice");

const intentText =
  document.getElementById("intentText");

const athleteAge =
  document.getElementById("athleteAge");

const preferredDiscipline =
  document.getElementById("preferredDiscipline");

const programInterest =
  document.getElementById("programInterest");

const PROGRAMS = [
  {
    value: "zero2hero-wrestling",
    journey: "zero2hero",
    discipline: "wrestling",
    min: 7,
    max: 13,
    en: "Zero2Hero Wrestling · Ages 7–13",
    es: "Zero2Hero Lucha · Edades 7–13"
  },
  {
    value: "zero2hero-boxing",
    journey: "zero2hero",
    discipline: "boxing",
    min: 7,
    max: 13,
    en: "Zero2Hero Boxing · Ages 7–13",
    es: "Zero2Hero Boxeo · Edades 7–13"
  },
  {
    value: "zero2hero-muay-thai",
    journey: "zero2hero",
    discipline: "muay-thai",
    min: 7,
    max: 13,
    en: "Zero2Hero Muay Thai · Ages 7–13",
    es: "Zero2Hero Muay Thai · Edades 7–13"
  },
  {
    value: "path2legend-wrestling",
    journey: "path2legend",
    discipline: "wrestling",
    min: 14,
    max: null,
    en: "Path2Legend Wrestling · Ages 14+",
    es: "Path2Legend Lucha · Edades 14+"
  },
  {
    value: "path2legend-boxing",
    journey: "path2legend",
    discipline: "boxing",
    min: 14,
    max: null,
    en: "Path2Legend Boxing · Ages 14+",
    es: "Path2Legend Boxeo · Edades 14+"
  },
  {
    value: "path2legend-muay-thai",
    journey: "path2legend",
    discipline: "muay-thai",
    min: 14,
    max: null,
    en: "Path2Legend Muay Thai · Ages 14+",
    es: "Path2Legend Muay Thai · Edades 14+"
  },
  {
    value: "quest2mastery-mma",
    journey: "quest2mastery",
    discipline: "mma",
    min: 16,
    max: null,
    en: "Quest2Mastery MMA · Ages 16+",
    es: "Quest2Mastery MMA · Edades 16+"
  },
  {
    value: "quest2mastery-sub-grappling",
    journey: "quest2mastery",
    discipline: "submission-grappling",
    min: 16,
    max: null,
    en: "Quest2Mastery Submission Grappling · Ages 16+",
    es: "Quest2Mastery Grappling de Sumisión · Edades 16+"
  }
];

function currentLanguage() {
  return document.documentElement.lang === "es"
    ? "es"
    : "en";
}

function message(en, es) {
  return currentLanguage() === "es"
    ? es
    : en;
}

function setStatus(text = "", type = "") {
  if (!formStatus) return;

  formStatus.textContent = text;
  formStatus.className = "form-status";

  if (type) {
    formStatus.classList.add(type);
  }
}

function renderSubmitButton(isSubmitting = false) {
  if (!submitBtn) return;

  const language = currentLanguage();

  submitBtn.disabled = isSubmitting;
  submitBtn.setAttribute(
    "aria-busy",
    String(isSubmitting)
  );

  if (isSubmitting) {
    submitBtn.textContent =
      language === "es"
        ? "Enviando..."
        : "Sending...";

    return;
  }

  submitBtn.innerHTML = `
    <span data-lang="en">
      Request an Admissions Appointment
    </span>

    <span data-lang="es">
      Solicitar una Cita de Admisión
    </span>
  `;
}

function setSubmitting(isSubmitting) {
  renderSubmitButton(isSubmitting);
}

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function normalizePhone(value = "") {
  return clean(value);
}

function readForm() {
  const formData = new FormData(form);

  const selectedProgram =
  PROGRAMS.find(
    (program) =>
      program.value ===
      clean(formData.get("programInterest"))
  );

  const params =
    new URLSearchParams(
      window.location.search
    );

  const academyId =
    getAcademyIdFromUrl(
      window.location.search
    );

  const interestType =
    normalizeInterestType(
      clean(formData.get("interestType")) ||
      clean(params.get("interest")) ||
      clean(params.get("intent")) ||
      (
        selectedProgram
          ? "combat"
          : "combat"
      )
    );

  return {
    academyId,
    interestType,

    parentName:
      clean(formData.get("parentName")),

    athleteName:
      clean(formData.get("athleteName")),

    athleteAge:
      Number(formData.get("athleteAge") || 0),

    shirtSize:
      clean(formData.get("shirtSize")),

    programInterest:
      clean(formData.get("programInterest")),

      journey:
    selectedProgram?.journey || "",

    preferredDiscipline:
      selectedProgram?.discipline || "",


    primaryGoal:
      clean(formData.get("primaryGoal")),

    phone:
      normalizePhone(formData.get("phone")),

    email:
      normalizeEmail(formData.get("email")),

    city:
      clean(formData.get("city")),

    preferredLocation:
      clean(formData.get("preferredLocation")),

    preferredMeetingWindow:
      clean(
        formData.get("preferredMeetingWindow")
      ),

    admissionsPath:
      clean(formData.get("admissionsPath")),

    referralSource:
      clean(formData.get("referralSource")),

    preferredLanguage:
      clean(
        formData.get("preferredLanguage")
      ) || currentLanguage(),

    intent:
      clean(
        new URLSearchParams(
          window.location.search
        ).get("intent")
      ) || "general",

    notes:
      clean(formData.get("notes"))
  };
}

function validateLead(lead = {}) {
  if (!lead.parentName) {
    return message(
      "Enter the parent or guardian name.",
      "Ingresa el nombre del padre, madre o tutor."
    );
  }

  if (!lead.athleteName) {
    return message(
      "Enter the athlete name.",
      "Ingresa el nombre del atleta."
    );
  }

  const isCombatInterest =
    lead.interestType === "combat" ||
    lead.interestType === "both";

  const minimumAge =
    isCombatInterest
      ? 7
      : 2;

  if (
    !Number.isFinite(lead.athleteAge) ||
    lead.athleteAge < minimumAge ||
    lead.athleteAge > 99
  ) {
    return message(
      isCombatInterest
        ? "Enter a valid athlete age (7 or older)."
        : "Enter a valid participant age.",
      isCombatInterest
        ? "Ingresa una edad válida (7 años o más)."
        : "Ingresa una edad válida para el participante."
    );
  }

  if (!lead.phone) {
    return message(
      "Enter a phone number.",
      "Ingresa un número de teléfono."
    );
  }

if (
  !lead.email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    lead.email
  )
) {
  return message(
    "Enter a valid email address.",
    "Ingresa un correo electrónico válido."
  );
}

  if (!lead.preferredLocation) {
    return message(
      "Select a preferred academy location.",
      "Selecciona una ubicación preferida."
    );
  }

  if (!lead.preferredMeetingWindow) {
    return message(
      "Select your preferred meeting availability.",
      "Selecciona tu horario preferido para reunirte."
    );
  }

  if (isCombatInterest) {
    if (!lead.programInterest) {
      return message(
        "Select a combat program.",
        "Selecciona un programa de combate."
      );
    }

    const selectedProgram =
      PROGRAMS.find(
        (program) =>
          program.value ===
          lead.programInterest
      );

    if (!selectedProgram) {
      return message(
        "Select a valid Sandman program.",
        "Selecciona un programa Sandman válido."
      );
    }

    const validAge =
      lead.athleteAge >= selectedProgram.min &&
      (
        selectedProgram.max === null ||
        lead.athleteAge <= selectedProgram.max
      );

    if (!validAge) {
      return message(
        "The selected program does not match the athlete's age.",
        "El programa seleccionado no corresponde con la edad del atleta."
      );
    }
  }

  if (
    !["new", "assessment"].includes(
      lead.admissionsPath
    )
  ) {
    return message(
      "Choose how the athlete would like to begin.",
      "Elige cómo le gustaría comenzar al atleta."
    );
  }

  if (!lead.referralSource) {
    return message(
      "Tell us how you heard about Sandman Combat.",
      "Indícanos cómo supiste de Sandman Combat."
    );
  }

  return "";
}

form?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    setStatus("");

    const lead = readForm();
    const validationError =
      validateLead(lead);

    if (validationError) {
      setStatus(
        validationError,
        "error"
      );

      return;
    }

    setSubmitting(true);

    try {
      await ensureSignedIn();

      const routingMetadata =
        buildLeadRoutingMetadata({
          academyId: lead.academyId,
          interestType: lead.interestType
        });

      await addDoc(
        collection(
          db,
          "interest_leads"
        ),
        {
          ...lead,
          ...routingMetadata,

          status: "new",
          source: "public-connect-form",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),

          contactedAt: null,
          appointmentScheduledAt: null,
          enrolledAt: null,

          coachNotes: "",
          assignedCoachUid: ""
        }
      );

      const language =
        lead.preferredLanguage === "es"
          ? "es"
          : getLanguageFromUrl(
              window.location.search
            );

      const routesAwayFromSandman =
        lead.interestType === "fitness" ||
        lead.interestType === "after-school";

      if (routesAwayFromSandman) {
        const destination =
          buildAcademyDestination({
            academyId: lead.academyId,
            interestType: lead.interestType,
            language,
            additionalParams: {
              submitted: "1"
            }
          });

        window.location.assign(destination);
        return;
      }

      window.location.assign(
        `/connect/thanks/?lang=${language}`
      );
    } catch (error) {
      console.error(
        "[connect] submission failed:",
        error
      );

      setStatus(
        message(
          "We could not submit your information. Please try again.",
          "No pudimos enviar tu información. Inténtalo de nuevo."
        ),
        "error"
      );

      setSubmitting(false);
    }
  }
);

console.log(
  "[interest] interest.js loaded"
);

// -------------------- Intent --------------------

const intentLabels = {
  "academy-introduction": {
    en: "Admissions Appointment",
    es: "Cita de Admisión"
  },

  "trial": {
    en: "Program Introduction",
    es: "Introducción al Programa"
  },

  "membership": {
    en: "Program Information",
    es: "Información del Programa"
  },

  "unlimited": {
    en: "Program Information",
    es: "Información del Programa"
  },

  "family-wellness": {
    en: "Family Program Information",
    es: "Información del Programa Familiar"
  }
};

const selectedIntent =
  new URLSearchParams(
    window.location.search
  ).get("intent");

function renderIntent() {
  const selectedLabel =
    intentLabels[selectedIntent];

  if (
    !selectedLabel ||
    !intentNotice ||
    !intentText
  ) {
    return;
  }

  intentNotice.style.display = "block";

  intentText.textContent =
    selectedLabel[currentLanguage()];
}

function updatePrograms() {
  if (!athleteAge || !programInterest) return;

  const age = Number(athleteAge.value);
  const previousValue =
    programInterest.value;

  programInterest.innerHTML = "";

  function addOption(value, en, es) {
    const option =
      document.createElement("option");

    option.value = value;

    option.textContent =
      currentLanguage() === "es"
        ? es
        : en;

    programInterest.appendChild(option);
  }

  addOption(
    "",
    "Select a program",
    "Selecciona un programa"
  );

  if (
    !Number.isFinite(age) ||
    age < 7
  ) {
    programInterest.value = "";
    syncPreferredDiscipline();
    return;
  }

  const availablePrograms =
    PROGRAMS.filter((program) => {
      const meetsMinimum =
        age >= program.min;

      const meetsMaximum =
        program.max === null ||
        age <= program.max;

      return (
        meetsMinimum &&
        meetsMaximum
      );
    });

  availablePrograms.forEach((program) => {
    addOption(
      program.value,
      program.en,
      program.es
    );
  });

  const previousStillValid =
    availablePrograms.some(
      (program) =>
        program.value === previousValue
    );

  programInterest.value =
    previousStillValid
      ? previousValue
      : "";

  syncPreferredDiscipline();
}

function syncPreferredDiscipline() {
  if (!programInterest) return;

  const selectedProgram =
    PROGRAMS.find(
      (program) =>
        program.value ===
        programInterest.value
    );

  if (preferredDiscipline) {
    preferredDiscipline.value =
      selectedProgram
        ? selectedProgram.discipline
        : "";
  }
}

document
  .querySelectorAll(
    "[data-set-language]"
  )
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        window.setTimeout(() => {
          renderSubmitButton(false);
          renderIntent();
          updatePrograms();
          syncPreferredDiscipline();
          setStatus("");
        }, 0);
      }
    );
  });

athleteAge?.addEventListener(
  "input",
  updatePrograms
);

programInterest?.addEventListener(
  "change",
  syncPreferredDiscipline
);

renderIntent();

updatePrograms();
syncPreferredDiscipline();