import { generalMessagePayload } from "./general-message-payload.mjs";
import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const form =
  document.getElementById("messageForm");

const submitBtn =
  document.getElementById("submitBtn");

const statusEl =
  document.getElementById("formStatus");

const languageInput =
  document.getElementById("preferredLanguage");

function currentLanguage() {
  return document.documentElement.lang === "es"
    ? "es"
    : "en";
}

function setStatus(message, type = "") {
  if (!statusEl) return;

  statusEl.textContent = message;

  statusEl.classList.remove(
    "is-error",
    "is-success"
  );

  if (type === "error") {
    statusEl.classList.add("is-error");
  }

  if (type === "success") {
    statusEl.classList.add("is-success");
  }
}

function syncLanguage() {
  if (languageInput) {
    languageInput.value =
      currentLanguage();
  }
}

syncLanguage();

const languageObserver =
  new MutationObserver(
    syncLanguage
  );

languageObserver.observe(
  document.documentElement,
  {
    attributes: true,
    attributeFilter: ["lang"]
  }
);

form?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      setStatus(
        currentLanguage() === "es"
          ? "Completa los campos requeridos."
          : "Please complete the required fields.",
        "error"
      );

      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
    }

    setStatus(
      currentLanguage() === "es"
        ? "Enviando tu mensaje..."
        : "Sending your message..."
    );

    try {
      await ensureSignedIn();

      const payload = generalMessagePayload({
        contactName: form.contactName?.value,
        email: form.email?.value,
        phone: form.phone?.value,
        topic: form.messageTopic?.value,
        passType: form.passType?.value,
        message: form.message?.value,
        contactConsent: form.contactConsent?.checked,
        language: currentLanguage(),
        pagePath: window.location.pathname
      }, serverTimestamp);

      const result = await addDoc(
        collection(
          db,
          "general_messages"
        ),
        payload
      );

      sessionStorage.setItem(
        "sandmanGeneralMessageId",
        result.id
      );

      form.reset();
      syncLanguage();

      setStatus(
        currentLanguage() === "es"
          ? "Mensaje recibido. La Administración del Sistema Sandman lo revisará y lo dirigirá si es necesario."
          : "Message received. Sandman System Administration will review it and route it if needed.",
        "success"
      );
    } catch (error) {
      console.error(
        "[general-message] submission failed:",
        error
      );

      setStatus(
        currentLanguage() === "es"
          ? "No pudimos enviar tu mensaje. Inténtalo de nuevo."
          : "We could not send your message. Please try again.",
        "error"
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }
);
