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
  buildLeadRoutingMetadata
} from "/assets/js/academy-routing.js";
import { PROGRAMS } from "/assets/js/programs.js";

const ELK_GROVE_PROGRAM_IDS =
  new Set([
    "zero2hero-boxing",
    "path2legend-boxing"
  ]);
const form =
  document.getElementById("interestForm");

const submitBtn =
  document.getElementById("submitBtn");

const formStatus =
  document.getElementById("formStatus");

const parentNameInput =
  document.getElementById("parentName");

const athleteNameInput =
  document.getElementById("athleteName");

const athleteNameField =
  document.getElementById("athleteNameField");

const parentNameLabel =
  document.getElementById("parentNameLabel");

const registrantRoleInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="registrantRole"]'
    )
  );

const intentNotice =
  document.getElementById("intentNotice");

const intentText =
  document.getElementById("intentText");

const athleteAge =
  document.getElementById("athleteAge");

const athleteAgeLabel =
  document.getElementById("athleteAgeLabel");

const shirtSize =
  document.getElementById("shirtSize");

const shirtSizeLabel =
  document.getElementById("shirtSizeLabel");

const personDetailsHeading =
  document.getElementById("personDetailsHeading");

const preferredDiscipline =
  document.getElementById("preferredDiscipline");

const programInterest =
  document.getElementById("programInterest");

const combatProgramSection =
  document.getElementById("combatProgramSection");

const fitnessFocusSection =
  document.getElementById("fitnessFocusSection");

const fitnessFocus =
  document.getElementById("fitnessFocus");

const interestTypeInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="interestType"]'
    )
  );

const trainingIntent =
  document.getElementById("trainingIntent");

const trainingIntentNotice =
  document.getElementById("trainingIntentNotice");

const claimedPriorExperience =
  document.getElementById("claimedPriorExperience");

const claimedExperienceDetails =
  document.getElementById("claimedExperienceDetails");

const claimedExperienceRange =
  document.getElementById("claimedExperienceRange");

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
      Submit Training Request
    </span>

    <span data-lang="es">
      Enviar Solicitud de Entrenamiento
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

function getRequestedLocationId() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return clean(
    params.get("location")
  )
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getEntryMode() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const requestedEntryMode =
    clean(
      params.get("entryMode") ||
      params.get("entry")
    )
      .toLowerCase();

  if (
    [
      "walk-in",
      "staff-assisted"
    ].includes(requestedEntryMode)
  ) {
    return requestedEntryMode;
  }

  return "online";
}

function syncLocalLocationContext() {
  const locationId =
    getRequestedLocationId();

  /*
   * Location ownership now comes directly from
   * the local academy URL.
   *
   * Elk Grove currently exposes Combat only.
   */
  if (locationId === "elk-grove") {
    interestTypeInputs.forEach((input) => {
      const isCombat =
        input.value === "combat";

      input.disabled = !isCombat;
      input.checked = isCombat;

      const option =
        input.closest(
          ".interest-type-option"
        );

      if (option) {
        option.hidden = !isCombat;
      }
    });
  }
}

function readForm() {
  const formData = new FormData(form);

  const registrantRole =
    clean(
      formData.get("registrantRole")
    ) || "parent-guardian";

  const enteredRegistrantName =
    clean(
      formData.get("parentName")
    );

  const enteredAthleteName =
    clean(
      formData.get("athleteName")
    );

  const resolvedAthleteName =
    registrantRole === "adult-athlete"
      ? enteredRegistrantName
      : enteredAthleteName;

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

  const requestedLocationId =
    getRequestedLocationId();

  /*
   * Operational location ownership comes from
   * the local academy entry URL.
   *
   * Valid examples:
   *   ?location=lompoc
   *   ?location=santa-ynez-valley
   *   ?location=elk-grove
   */
  const publicLocationIds =
    new Set([
      "lompoc",
      "elk-grove",
      "santa-ynez-valley"
    ]);

  const locationId =
    publicLocationIds.has(
      requestedLocationId
    )
      ? requestedLocationId
      : "";

  const interestType =
    normalizeInterestType(
      clean(formData.get("interestType")) ||
      clean(params.get("interest")) ||
      clean(params.get("intent")) ||
      "combat"
    );

  return {
    academyId,
    locationId,
    interestType,

    trainingIntent:
      clean(formData.get("trainingIntent")),

    entryMode:
      getEntryMode(),

    registrantRole,

    registrantName:
      enteredRegistrantName,

    parentName:
      registrantRole === "parent-guardian"
        ? enteredRegistrantName
        : "",

    athleteName:
      resolvedAthleteName,

    athleteAge:
      Number(formData.get("athleteAge") || 0),

    dob:
      clean(formData.get("dob")),

    shirtSize:
      clean(formData.get("shirtSize")),

    programInterest:
      clean(formData.get("programInterest")),

    fitnessFocus:
      clean(formData.get("fitnessFocus")),

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

    state:
      clean(formData.get("state")),

    needsTeamHelp:
      formData.get("needsTeamHelp") === "yes",

    teamInterest:
      clean(formData.get("teamInterest")),

    preferredMeetingWindow:
      clean(
        formData.get("preferredMeetingWindow")
      ),

    claimedPriorExperience:
      clean(formData.get("claimedPriorExperience")),

    claimedExperienceRange:
      clean(formData.get("claimedExperienceRange")),

    claimedExperienceNotes:
      clean(formData.get("claimedExperienceNotes")),

    /*
     * Transitional compatibility only.
     *
     * Public applicants no longer choose an admissions path.
     * Prior experience is captured separately and must be
     * verified by a Coach before affecting placement/legacy XP.
     */
    admissionsPath: "new",

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
  if (!lead.registrantName) {
    return message(
      lead.registrantRole === "adult-athlete"
        ? "Enter your name."
        : "Enter the parent or guardian name.",
      lead.registrantRole === "adult-athlete"
        ? "Ingresa tu nombre."
        : "Ingresa el nombre del padre, madre o tutor."
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

  if (
    !Number.isFinite(lead.athleteAge)
  ) {
    return message(
      "Enter a valid age.",
      "Ingresa una edad válida."
    );
  }

  if (
    lead.registrantRole ===
      "parent-guardian" &&
    (
      lead.athleteAge < 7 ||
      lead.athleteAge > 19
    )
  ) {
    return message(
      "Athletes registered by a parent or guardian must be between ages 7 and 19.",
      "Los atletas registrados por un padre, madre o tutor deben tener entre 7 y 19 años."
    );
  }

  if (
    lead.registrantRole ===
      "adult-athlete" &&
    lead.athleteAge < 18
  ) {
    return message(
      "Adult athletes registering themselves must be age 18 or older.",
      "Los atletas adultos que se registran personalmente deben tener 18 años o más."
    );
  }

  if (!lead.shirtSize) {
    return message(
      lead.registrantRole === "adult-athlete"
        ? "Select your T-shirt size."
        : "Select the athlete's T-shirt size.",
      lead.registrantRole === "adult-athlete"
        ? "Selecciona tu talla de camiseta."
        : "Selecciona la talla de camiseta del atleta."
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

  const requiresMeetingAvailability =
    lead.entryMode === "online";

  if (
    requiresMeetingAvailability &&
    !lead.preferredMeetingWindow
  ) {
    return message(
      "Select your preferred meeting availability.",
      "Selecciona tu horario preferido para reunirte."
    );
  }

  if (
    ![
      "local-prospect",
      "visitor",
      "returning"
    ].includes(lead.trainingIntent)
  ) {
    return message(
      "Select whether you are local, visiting, or returning.",
      "Selecciona si eres local, visitante o estás regresando."
    );
  }

  if (!lead.locationId) {
    return message(
      "Select your academy location before continuing.",
      "Selecciona la ubicación de tu academia antes de continuar."
    );
  }

  const isFitnessInterest =
    lead.interestType === "fitness" ||
    lead.interestType === "both";

  if (
    isFitnessInterest &&
    !lead.fitnessFocus
  ) {
    return message(
      "Select a fitness focus.",
      "Selecciona un enfoque de fitness."
    );
  }

  if (
    lead.locationId === "elk-grove" &&
    (
      lead.interestType !== "combat" ||
      !ELK_GROVE_PROGRAM_IDS.has(lead.programInterest)
    )
  ) {
    return message(
      "Select an available Elk Grove Boxing program.",
      "Selecciona un programa de Boxeo disponible en Elk Grove."
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
    !["no", "yes"].includes(
      lead.claimedPriorExperience
    )
  ) {
    return message(
      "Tell us whether the athlete has previous combat-sport experience.",
      "Indícanos si el atleta tiene experiencia previa en deportes de combate."
    );
  }

  if (
    lead.claimedPriorExperience === "yes" &&
    !lead.claimedExperienceRange
  ) {
    return message(
      "Select about how long the athlete has trained.",
      "Selecciona aproximadamente cuánto tiempo ha entrenado el atleta."
    );
  }

  if (!lead.referralSource) {
    return message(
      "Tell us how you heard about Sandman Academy.",
      "Indícanos cómo supiste de Sandman Academy."
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

          /*
           * Local intake doctrine:
           *
           * Every public lead enters Management first.
           * Interest type classifies the request but
           * does not bypass Management.
           */
          routingStage: "MANAGEMENT_TRIAGE",
          nextRoutingStage: "COACH_ASSIGNED",
          routingPolicy: "LOCAL_TO_LOCATION_MANAGER",
          requiredManagerLevel: "LOCATION_MANAGER",
          assignmentStatus: "PENDING_MANAGEMENT",

          assignedAdminUid: null,
          assignedManagerUid: null,
          assignedCoachUid: null,

          coachNotes: ""
        }
      );

      const language =
        lead.preferredLanguage === "es"
          ? "es"
          : getLanguageFromUrl(
              window.location.search
            );

      /*
       * Every successful public intake receives
       * confirmation here. Management handles
       * downstream operational routing.
       */
      window.location.assign(
        "/connect/thanks/" +
        `?lang=${encodeURIComponent(language)}` +
        `&registrantRole=${encodeURIComponent(
          lead.registrantRole
        )}` +
        `&interest=${encodeURIComponent(
          lead.interestType
        )}` +
        `&trainingIntent=${encodeURIComponent(
          lead.trainingIntent
        )}` +
        `&entryMode=${encodeURIComponent(
          lead.entryMode
        )}`
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

// -------------------- Local public identity --------------------

function syncLocalInterestIdentity() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const locationId =
    params.get("location");

  const locations = {
    "santa-ynez-valley": {
      enPlace: "Santa Ynez Valley Strong",
      esPlace: "Santa Ynez Valley Strong"
    },

    "lompoc": {
      enPlace: "Lompoc Strong",
      esPlace: "Lompoc Strong"
    },

    "elk-grove": {
      enPlace: "Elk Grove Strong",
      esPlace: "Elk Grove Strong"
    }
  };

  const local =
    locations[locationId];

  if (!local) return;

  const identity =
    document.getElementById(
      "localInterestIdentity"
    );

  if (!identity) return;

  const isSpanish =
    document.documentElement
      .getAttribute("lang") === "es";

  identity.innerHTML = `
    <span class="local-rally">
      <span class="local-rally__place">
        ${
          isSpanish
            ? local.esPlace
            : local.enPlace
        }
      </span>

      <span
        class="local-rally__dot"
        aria-hidden="true"
      >
        ·
      </span>

      <span class="local-rally__call">
        ${
          isSpanish
            ? "Únete al Movimiento"
            : "Join the Movement"
        }
      </span>
    </span>
  `;
}

syncLocalInterestIdentity();

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

function getRegistrantRole() {
  const selected =
    registrantRoleInputs.find(
      (input) => input.checked
    );

  return selected?.value === "adult-athlete"
    ? "adult-athlete"
    : "parent-guardian";
}

function updateRegistrantRoleUI() {
  const role =
    getRegistrantRole();

  const isAdultAthlete =
    role === "adult-athlete";

  if (athleteNameField) {
    athleteNameField.hidden =
      isAdultAthlete;
  }

  if (athleteNameInput) {
    athleteNameInput.required =
      !isAdultAthlete;

    athleteNameInput.disabled =
      isAdultAthlete;

    if (isAdultAthlete) {
      athleteNameInput.value =
        parentNameInput?.value || "";
    }
  }

  if (parentNameLabel) {
    parentNameLabel
      .querySelectorAll(
        '[data-lang="en"]'
      )
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Your Name"
            : "Parent or Guardian Name";
      });

    parentNameLabel
      .querySelectorAll(
        '[data-lang="es"]'
      )
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Tu Nombre"
            : "Nombre del Padre, Madre o Tutor";
      });
  }

  /*
   * Person-details language follows WHO.
   */
  if (athleteAgeLabel) {
    athleteAgeLabel
      .querySelectorAll('[data-lang="en"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Your Age"
            : "Athlete Age";
      });

    athleteAgeLabel
      .querySelectorAll('[data-lang="es"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Tu Edad"
            : "Edad del Atleta";
      });
  }

  /*
   * WHO controls the allowed age range.
   *
   * Parent / Guardian:
   *   athlete age 7–19
   *
   * Adult Athlete:
   *   self-registering age 18+
   */
  if (athleteAge) {
    athleteAge.min =
      isAdultAthlete ? "18" : "7";

    athleteAge.max =
      isAdultAthlete ? "99" : "19";

    const currentAge =
      Number(athleteAge.value);

    if (
      Number.isFinite(currentAge) &&
      currentAge > 0 &&
      (
        currentAge < Number(athleteAge.min) ||
        currentAge > Number(athleteAge.max)
      )
    ) {
      athleteAge.value = "";
    }
  }

  if (shirtSizeLabel) {
    shirtSizeLabel
      .querySelectorAll('[data-lang="en"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Your T-Shirt Size"
            : "Athlete T-Shirt Size";
      });

    shirtSizeLabel
      .querySelectorAll('[data-lang="es"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Tu Talla de Camiseta"
            : "Talla de Camiseta del Atleta";
      });
  }

  if (personDetailsHeading) {
    personDetailsHeading
      .querySelectorAll('[data-lang="en"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "About You"
            : "Athlete";
      });

    personDetailsHeading
      .querySelectorAll('[data-lang="es"]')
      .forEach((element) => {
        element.textContent =
          isAdultAthlete
            ? "Sobre Ti"
            : "Atleta";
      });
  }

  /*
   * Adult registrants should not see
   * youth shirt sizes.
   *
   * Parent/guardian flows keep both youth
   * and adult sizes because older youth may
   * wear adult sizing.
   */
  if (shirtSize) {
    Array.from(shirtSize.options)
      .forEach((option) => {
        const isYouthSize =
          option.value.startsWith("Youth ");

        if (!isYouthSize) {
          return;
        }

        option.hidden =
          isAdultAthlete;

        option.disabled =
          isAdultAthlete;
      });

    if (
      isAdultAthlete &&
      shirtSize.value.startsWith("Youth ")
    ) {
      shirtSize.value = "";
    }
  }
}

function getSelectedInterestType() {
  const selected =
    interestTypeInputs.find(
      (input) => input.checked
    );

  return normalizeInterestType(
    selected?.value || "combat"
  );
}

function syncInterestTypeFromUrl() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const requestedInterest =
    normalizeInterestType(
      params.get("interest") || "combat"
    );

  const matchingInput =
    interestTypeInputs.find(
      (input) =>
        input.value === requestedInterest
    );

  if (matchingInput) {
    matchingInput.checked = true;
  }
}

function updateTrainingIntentNotice() {
  if (
    !trainingIntent ||
    !trainingIntentNotice
  ) {
    return;
  }

  const visitType =
    trainingIntent.value;

  const interestType =
    getSelectedInterestType();

  if (!visitType) {
    trainingIntentNotice.hidden = true;
    trainingIntentNotice.textContent = "";
    return;
  }

  let en = "";
  let es = "";

  if (visitType === "returning") {
    en =
      "Returning athletes are not eligible for another free trial. Management will confirm the appropriate paid re-entry option.";

    es =
      "Los atletas que regresan no son elegibles para otra prueba gratuita. Administración confirmará la opción pagada de regreso apropiada.";
  }

  if (visitType === "visitor") {
    if (interestType === "combat") {
      en =
        "Visiting Combat: $30 for one training day or $40 for two training days.";

      es =
        "Combate para visitantes: $30 por un día de entrenamiento o $40 por dos días.";
    }

    if (interestType === "fitness") {
      en =
        "Visiting Fitness: $15 drop-in.";

      es =
        "Fitness para visitantes: $15 por clase.";
    }

    if (interestType === "both") {
      en =
        "Visiting Combat: $30 for one training day or $40 for two. Visiting Fitness: $15 drop-in.";

      es =
        "Combate para visitantes: $30 por un día o $40 por dos. Fitness para visitantes: $15 por clase.";
    }
  }

  if (visitType === "local-prospect") {
    if (interestType === "combat") {
      en =
        "Local Combat Trial: one complimentary walk-in session for local residents. Proof of residence is required. A brief admissions follow-up takes place after training.";

      es =
        "Prueba Local de Combate: una sesión de cortesía para residentes locales. Se requiere comprobante de residencia. Se realizará un breve seguimiento de admisiones después del entrenamiento.";
    }

    if (interestType === "fitness") {
      en =
        "Local Fitness: $15 drop-in. If you join, the $15 is applied toward enrollment or membership.";

      es =
        "Fitness local: $15 por clase. Si te inscribes, los $15 se aplican a la inscripción o membresía.";
    }

    if (interestType === "both") {
      en =
        "Local Combat Trial: one complimentary walk-in session for local residents. Proof of residence is required. A brief admissions follow-up takes place after training. Local Fitness: $15 drop-in, applied toward enrollment or membership if you join.";

      es =
        "Prueba Local de Combate: una sesión de cortesía para residentes locales. Se requiere comprobante de residencia. Se realizará un breve seguimiento de admisiones después del entrenamiento. Fitness local: $15 por clase, aplicado a la inscripción o membresía si te inscribes.";
    }
  }

  trainingIntentNotice.textContent =
    currentLanguage() === "es"
      ? es
      : en;

  trainingIntentNotice.hidden =
    !trainingIntentNotice.textContent;
}


function updateClaimedExperienceUI() {
  if (
    !claimedPriorExperience ||
    !claimedExperienceDetails
  ) {
    return;
  }

  const hasPreviousExperience =
    claimedPriorExperience.value === "yes";

  claimedExperienceDetails.hidden =
    !hasPreviousExperience;

  if (claimedExperienceRange) {
    claimedExperienceRange.required =
      hasPreviousExperience;

    claimedExperienceRange.disabled =
      !hasPreviousExperience;

    if (!hasPreviousExperience) {
      claimedExperienceRange.value = "";
    }
  }

  const notes =
    document.getElementById(
      "claimedExperienceNotes"
    );

  if (notes) {
    notes.disabled =
      !hasPreviousExperience;

    if (!hasPreviousExperience) {
      notes.value = "";
    }
  }
}

function updateInterestTypeUI() {
  const interestType =
    getSelectedInterestType();

  const needsCombatProgram =
    interestType === "combat" ||
    interestType === "both";

  const needsFitnessFocus =
    interestType === "fitness" ||
    interestType === "both";

  if (combatProgramSection) {
    combatProgramSection.hidden =
      !needsCombatProgram;
  }

  if (programInterest) {
    programInterest.required =
      needsCombatProgram;

    programInterest.disabled =
      !needsCombatProgram;

    if (!needsCombatProgram) {
      programInterest.value = "";
    }
  }

  if (preferredDiscipline) {
    preferredDiscipline.disabled =
      !needsCombatProgram;

    if (!needsCombatProgram) {
      preferredDiscipline.value = "";
    }
  }

  if (fitnessFocusSection) {
    fitnessFocusSection.hidden =
      !needsFitnessFocus;
  }

  if (fitnessFocus) {
    fitnessFocus.required =
      needsFitnessFocus;

    fitnessFocus.disabled =
      !needsFitnessFocus;

    if (!needsFitnessFocus) {
      fitnessFocus.value = "";
    }
  }

  if (needsCombatProgram) {
    updatePrograms();
  }
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

      const availableAtLocation =
        getRequestedLocationId() !== "elk-grove" ||
        ELK_GROVE_PROGRAM_IDS.has(program.value);

      return (
        meetsMinimum &&
        meetsMaximum &&
        availableAtLocation
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
        const language =
          button.dataset.setLanguage === "es"
            ? "es"
            : "en";

        document.documentElement.lang = language;

        const url = new URL(window.location.href);
        url.searchParams.set("lang", language);

        window.history.replaceState(
          {},
          "",
          url
        );

        renderSubmitButton(false);
        renderIntent();
        updatePrograms();
        syncPreferredDiscipline();
        updateTrainingIntentNotice();
        syncLocalInterestIdentity();
        setStatus("");
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

interestTypeInputs.forEach((input) => {
  input.addEventListener(
    "change",
    () => {
      updateInterestTypeUI();
      updateTrainingIntentNotice();
    }
  );
});

trainingIntent?.addEventListener(
  "change",
  updateTrainingIntentNotice
);

claimedPriorExperience?.addEventListener(
  "change",
  updateClaimedExperienceUI
);

registrantRoleInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateRegistrantRoleUI
  );
});

parentNameInput?.addEventListener(
  "input",
  () => {
    if (
      getRegistrantRole() ===
      "adult-athlete" &&
      athleteNameInput
    ) {
      athleteNameInput.value =
        parentNameInput.value;
    }
  }
);

updateRegistrantRoleUI();

syncLocalLocationContext();

syncInterestTypeFromUrl();
syncLocalLocationContext();
updateInterestTypeUI();
updateTrainingIntentNotice();
updateClaimedExperienceUI();

renderIntent();

updatePrograms();
syncPreferredDiscipline();
