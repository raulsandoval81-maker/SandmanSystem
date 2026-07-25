import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

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
    min: 6,
    max: 13,
    en: "Zero2Hero Wrestling · Ages 6–13",
    es: "Zero2Hero Lucha · Edades 6–13"
  },
  {
    value: "zero2hero-kickboxing",
    min: 6,
    max: 13,
    en: "Zero2Hero Kickboxing · Ages 6–13",
    es: "Zero2Hero Kickboxing · Edades 6–13"
  },
  {
    value: "path2legend-wrestling",
    min: 14,
    max: null,
    en: "Path2Legend Wrestling · Ages 14+",
    es: "Path2Legend Lucha · 14+"
  },
  {
    value: "path2legend-boxing",
    min: 14,
    max: null,
    en: "Path2Legend Boxing · Ages 14+",
    es: "Path2Legend Boxeo · 14+"
  },
    {
    value: "fitness",
    min: 12,
    max: null,
    en: "Everyday Fitness · Ages 12+",
    es: "Fitness Diario · 12+"
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

  return {
    parentName:
      clean(formData.get("parentName")),

    athleteName:
      clean(formData.get("athleteName")),

    athleteAge:
      Number(formData.get("athleteAge") || 0),

    shirtSize:
      clean(formData.get("shirtSize")),

    preferredDiscipline:
      clean(
        formData.get("preferredDiscipline")
      ),

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

    programInterest:
      clean(formData.get("programInterest")),

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

  if (
    !Number.isFinite(lead.athleteAge) ||
    lead.athleteAge < 3 ||
    lead.athleteAge > 99
  ) {
    return message(
      "Enter a valid athlete age.",
      "Ingresa una edad válida para el atleta."
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
    !lead.email.includes("@")
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

  if (!lead.programInterest) {
    return message(
      "Select a program.",
      "Selecciona un programa."
    );
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

      await addDoc(
        collection(
          db,
          "interest_leads"
        ),
        {
          ...lead,

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

      const thanksUrl =
        lead.preferredLanguage === "es"
          ? "/connect/thanks/contact.html?lang=es"
          : "/connect/thanks/contact.html?lang=en";

      window.location.href = thanksUrl;
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

  // Default state
  addOption(
    "",
    "Select a program",
    "Selecciona un programa"
  );

  if (
    !Number.isFinite(age) ||
    age < 6
  ) {
    programInterest.value = "";
    return;
  }

  const availablePrograms = [];

  if (age >= 6 && age <= 13) {
    availablePrograms.push(
      {
        value: "zero2hero-wrestling",
        en: "Zero2Hero Wrestling · Ages 6–13",
        es: "Zero2Hero Lucha · Edades 6–13"
      },
      {
        value: "zero2hero-kickboxing",
        en: "Zero2Hero Kickboxing · Ages 6–13",
        es: "Zero2Hero Kickboxing · Edades 6–13"
      }
    );
  }

  if (age >= 12) {
    availablePrograms.push({
      value: "fitness",
      en: "Everyday Fitness · Ages 12+",
      es: "Fitness Diario · 12+"
    });
  }

  if (age >= 14) {
    availablePrograms.push(
      {
        value: "path2legend-wrestling",
        en: "Path2Legend Wrestling · Ages 14+",
        es: "Path2Legend Lucha · 14+"
      },
      {
        value: "path2legend-boxing",
        en: "Path2Legend Boxing · Ages 14+",
        es: "Path2Legend Boxeo · 14+"
      }
    );
  }

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
}

renderIntent();

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
          setStatus("");
        }, 0);
      }
    );
  });

athleteAge?.addEventListener(
  "input",
  updatePrograms
);

updatePrograms();