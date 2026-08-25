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


    /*
     * The current Firestore contract allows direct
     * Management routing for Santa Ynez Valley and
     * Elk Grove.
     *
     * Root/national and Lompoc currently enter
     * Admin Review until their direct routing rule
     * is explicitly activated.
     */
    const directManagementLocations = new Set([
      "santa-ynez-valley",
      "elk-grove"
    ]);

    const directToManagement =
      directManagementLocations.has(
        location.locationId
      );

    const preferredLocation =
      location.locationId || "not-sure";

    const organizationId =
      directToManagement
        ? "sandman-academy"
        : null;

    const organizationName =
      directToManagement
        ? "Sandman Academy of Combat & Fitness"
        : "";

    const academyId =
      directToManagement
        ? "sandman-academy"
        : null;

    const academyName =
      directToManagement
        ? "Sandman Academy of Combat & Fitness"
        : "";

    const locationId =
      directToManagement
        ? location.locationId
        : null;

    const locationName =
      directToManagement
        ? (
            location.locationId === "elk-grove"
              ? "Elk Grove, California"
              : "Santa Ynez Valley"
          )
        : "";

    await addDoc(
      collection(db, "general_messages"),
      {
        organization: "sandman-system",
        pipeline: "general-messaging",
        source: "public-message-page",

        status: "NEW",
        messageStatus: "NEW",

        routingStage: directToManagement
          ? "MANAGEMENT_TRIAGE"
          : "ADMIN_REVIEW",

        nextRoutingStage: directToManagement
          ? "COACH_ASSIGNED"
          : "MANAGEMENT_TRIAGE",

        routingPolicy: directToManagement
          ? "LOCAL_TO_LOCATION_MANAGER"
          : "ADMIN_TO_ORGANIZATION_LOCATION_MANAGER",

        requiredManagerLevel:
          "LOCATION_MANAGER",

        assignmentStatus: directToManagement
          ? "PENDING_MANAGEMENT"
          : "UNASSIGNED",

        contactName:
          "Stay Connected Subscriber",

        email,
        phone: "",

        topic: "stay-connected",

        message:
          "Homepage Stay Connected subscription",

        preferredOrganization:
          "sandman-academy",

        preferredLocation,

        contactConsent: true,
        language: language(),
        pagePath: window.location.pathname,

        organizationId,
        organizationName,

        academyId,
        academyName,

        locationId,
        locationName,

        assignedAdminUid: null,
        assignedManagerUid: null,
        assignedCoachUid: null,

        respondedByUid: null,
        respondedByRole: null,
        respondedAt: null,

        closedByUid: null,
        closedAt: null,

        escalated: false,
        escalationReason: "",

        coachNotes: "",
        managementNotes: "",

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
