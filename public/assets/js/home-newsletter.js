import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const form = document.getElementById("homeNewsletterForm");
const emailInput = document.getElementById("homeNewsletterEmail");
const consentInput = document.getElementById("homeNewsletterConsent");
const submitButton = document.getElementById("homeNewsletterSubmit");
const statusElement = document.getElementById("homeNewsletterStatus");

function language() {
  return document.documentElement.lang === "es" ? "es" : "en";
}

function setStatus(message, type = "") {
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.classList.remove("is-success", "is-error");

  if (type) {
    statusElement.classList.add(`is-${type}`);
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    setStatus(
      language() === "es"
        ? "Ingresa un correo válido y acepta recibir actualizaciones."
        : "Enter a valid email and agree to receive updates.",
      "error"
    );

    return;
  }

  const email = String(emailInput?.value || "")
    .trim()
    .toLowerCase();

  submitButton.disabled = true;

  setStatus(
    language() === "es"
      ? "Guardando tu suscripción..."
      : "Saving your subscription..."
  );

  try {
    await ensureSignedIn();

    const result = await addDoc(
      collection(db, "newsletter_subscribers"),
      {
        email,
        organization: "sandman-academy",
        source: "public-homepage",
        status: "ACTIVE",
        interests: [
          "combat",
          "fitness",
          "community-events",
          "promotions"
        ],
        language: language(),
        consent: Boolean(consentInput?.checked),
        pagePath: window.location.pathname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    sessionStorage.setItem(
      "sandmanNewsletterSubscriberId",
      result.id
    );

    form.reset();

    setStatus(
      language() === "es"
        ? "Listo. Te mantendremos informado."
        : "You’re subscribed. We’ll keep you updated.",
      "success"
    );

  } catch (error) {
    console.error(
      "[home-newsletter] subscription failed:",
      error
    );

    setStatus(
      language() === "es"
        ? "No pudimos guardar tu correo. Inténtalo de nuevo."
        : "We could not save your email. Please try again.",
      "error"
    );

  } finally {
    submitButton.disabled = false;
  }
});
