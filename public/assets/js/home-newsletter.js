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


function resolveLocation() {
  const path = window.location.pathname;

  const locations = {
    "/locations/santa-ynez-valley/": {
      locationId: "santa-ynez-valley",
      locationName: "Santa Ynez Valley"
    },

    "/locations/lompoc/": {
      locationId: "lompoc",
      locationName: "Lompoc"
    },

    "/locations/elk-grove/": {
      locationId: "elk-grove",
      locationName: "Elk Grove"
    }
  };

  for (const [prefix, location] of Object.entries(locations)) {
    if (path.startsWith(prefix)) {
      return location;
    }
  }

  return {
    locationId: null,
    locationName: null
  };
}


form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = String(emailInput?.value || "")
    .trim()
    .toLowerCase();

  // Validate email directly instead of relying on the form-level
  // reportValidity() path. This gives the visitor a precise message.
  if (!email || !emailInput?.checkValidity()) {
    setStatus(
      language() === "es"
        ? "Ingresa un correo electrónico válido."
        : "Enter a valid email address.",
      "error"
    );

    emailInput?.focus();
    return;
  }

  if (!consentInput?.checked) {
    setStatus(
      language() === "es"
        ? "Acepta recibir actualizaciones para continuar."
        : "Please agree to receive updates to continue.",
      "error"
    );

    consentInput?.focus();
    return;
  }

  submitButton.disabled = true;

  setStatus(
    language() === "es"
      ? "Guardando tu suscripción..."
      : "Saving your subscription..."
  );

  try {
    await ensureSignedIn();

    const location = resolveLocation();

    const result = await addDoc(
      collection(db, "newsletter_subscribers"),
      {
        email,
        organization: "sandman-academy",

        locationId: location.locationId,
        locationName: location.locationName,

        queueScope: location.locationId
          ? "LOCATION_MANAGEMENT"
          : "CENTRAL_MANAGEMENT",

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


    await addDoc(
      collection(db, "general_messages"),
      {
        contactName: "",
        email,
        phone: "",

        topic: "stay-connected",
        message: "Homepage Stay Connected subscription",

        organizationId: "sandman-academy",
        organizationName:
          "Sandman Academy of Combat & Fitness",

        locationId: location.locationId,
        locationName: location.locationName,

        queueScope: location.locationId
          ? "LOCATION_MANAGEMENT"
          : "CENTRAL_MANAGEMENT",

        source: "public-homepage",
        subscriberId: result.id,

        routingStage: "MANAGEMENT_TRIAGE",
        assignmentStatus: "PENDING_MANAGEMENT",
        messageStatus: "REVIEWING",

        language: language(),

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
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
