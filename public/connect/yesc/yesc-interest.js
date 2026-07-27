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

    contactName:
      clean(
        formData.get("contactName")
      ),

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

    participantName:
      clean(
        formData.get("participantName")
      ),

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

  if (!lead.participantName) {
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
            "yescInterest"
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