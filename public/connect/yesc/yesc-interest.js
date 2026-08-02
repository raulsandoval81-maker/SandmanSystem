import {
  db,
  addDoc,
  collection,
  serverTimestamp
} from "../../assets/js/firebase-init.js";

const form =
  document.getElementById("yescInterestForm");

const statusEl =
  document.getElementById("yescFormStatus");

const submitButton =
  document.getElementById("yescSubmitButton");

const yescContactName =
  document.getElementById("contactName");

const yescParticipantName =
  document.getElementById("participantName");

const yescParticipantNameField =
  document.getElementById(
    "yescParticipantNameField"
  );

const registrantRoleInputs =
  Array.from(
    document.querySelectorAll(
      'input[name="registrantRole"]'
    )
  );

function clean(value = "") {
  return String(value).trim();
}

function currentLanguage() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const queryLanguage =
    params.get("lang");

  if (queryLanguage === "es") {
    return "es";
  }

  return document.documentElement.lang === "es"
    ? "es"
    : "en";
}

function setStatus(message, type = "") {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.className = "form-status";

  if (type) {
    statusEl.classList.add(
      `is-${type}`
    );
  }
}

function buildLead(formData) {
  const registrantRole =
    clean(
      formData.get("registrantRole")
    ) || "parent-guardian";

  const contactName =
    clean(
      formData.get("contactName")
    );

  const enteredParticipantName =
    clean(
      formData.get("participantName")
    );

  const participantName =
    registrantRole === "adult-athlete"
      ? contactName
      : enteredParticipantName;

  const participantAge =
    Number.parseInt(
      clean(
        formData.get("participantAge")
      ),
      10
    );

  return {
    organization: "YESC",
    pipeline: "yesc",
    source: "marketing-fitness",
    status: "new",

    registrantRole,

    registrantName:
      contactName,

    contactName,

    parentName:
      registrantRole === "parent-guardian"
        ? contactName
        : "",

    email:
      clean(
        formData.get("email")
      ).toLowerCase(),

    phone:
      clean(
        formData.get("phone")
      ),

    preferredContact:
      clean(
        formData.get("preferredContact")
      ),

    participantName,

    athleteName:
      participantName,

    participantAge:
      Number.isFinite(participantAge)
        ? participantAge
        : null,

    programInterest:
      clean(
        formData.get("programInterest")
      ),

    message:
      clean(
        formData.get("message")
      ),

    language:
      currentLanguage(),

    pagePath:
      window.location.pathname,

    createdAt:
      serverTimestamp()
  };
}

function validateLead(lead) {
  const isSpanish =
    currentLanguage() === "es";

  if (!lead.contactName) {
    return isSpanish
      ? "Ingresa tu nombre."
      : "Please enter your name.";
  }

  if (
    !lead.email ||
    !lead.email.includes("@")
  ) {
    return isSpanish
      ? "Ingresa un correo electrónico válido."
      : "Please enter a valid email address.";
  }

  if (!lead.phone) {
    return isSpanish
      ? "Ingresa un número de teléfono."
      : "Please enter a phone number.";
  }

  if (!lead.preferredContact) {
    return isSpanish
      ? "Elige un método de contacto preferido."
      : "Please choose a preferred contact method.";
  }

  if (
    lead.registrantRole ===
      "parent-guardian" &&
    !lead.participantName
  ) {
    return isSpanish
      ? "Ingresa el nombre del participante."
      : "Please enter the participant name.";
  }

  if (
    !Number.isFinite(
      lead.participantAge
    )
  ) {
    return isSpanish
      ? "Ingresa la edad del participante."
      : "Please enter the participant age.";
  }

  if (!lead.programInterest) {
    return isSpanish
      ? "Elige un programa."
      : "Please choose a program.";
  }

  return "";
}

function createTimeout(
  milliseconds = 12000
) {
  return new Promise(
    (_, reject) => {
      window.setTimeout(
        () => {
          reject(
            new Error(
              "YESC inquiry submission timed out."
            )
          );
        },
        milliseconds
      );
    }
  );
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
  const isAdultAthlete =
    getRegistrantRole() ===
    "adult-athlete";

  if (yescParticipantNameField) {
    yescParticipantNameField.hidden =
      isAdultAthlete;
  }

  if (yescParticipantName) {
    yescParticipantName.required =
      !isAdultAthlete;

    yescParticipantName.disabled =
      isAdultAthlete;

    if (isAdultAthlete) {
      yescParticipantName.value =
        yescContactName?.value || "";
    }
  }
}

registrantRoleInputs.forEach((input) => {
  input.addEventListener(
    "change",
    updateRegistrantRoleUI
  );
});

yescContactName?.addEventListener(
  "input",
  () => {
    if (
      getRegistrantRole() ===
        "adult-athlete" &&
      yescParticipantName
    ) {
      yescParticipantName.value =
        yescContactName.value;
    }
  }
);

updateRegistrantRoleUI();

form?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const formData =
      new FormData(form);

    const lead =
      buildLead(formData);

    const validationMessage =
      validateLead(lead);

    if (validationMessage) {
      setStatus(
        validationMessage,
        "error"
      );

      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    setStatus(
      currentLanguage() === "es"
        ? "Enviando tu consulta…"
        : "Sending your inquiry…"
    );

    try {
      const writePromise =
        addDoc(
          collection(
            db,
            "interest_leads"
          ),
          lead
        );

      await Promise.race([
        writePromise,
        createTimeout()
      ]);

      const language =
        currentLanguage();

      window.location.assign(
        `/connect/yesc/interest-respond.html?lang=${language}`
      );

    } catch (error) {
      console.error(
        "YESC inquiry submission failed:",
        error
      );

      const timedOut =
        error instanceof Error &&
        error.message.includes(
          "timed out"
        );

      setStatus(
        currentLanguage() === "es"
          ? timedOut
            ? "La solicitud tardó demasiado. Inténtalo de nuevo."
            : "No pudimos enviar tu consulta. Inténtalo de nuevo."
          : timedOut
            ? "The submission took too long. Please try again."
            : "We could not send your inquiry. Please try again.",
        "error"
      );

      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }
);