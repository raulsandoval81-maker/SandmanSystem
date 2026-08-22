import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const form = document.getElementById("messageForm");
const submitBtn = document.getElementById("submitBtn");
const statusEl = document.getElementById("formStatus");
const languageInput = document.getElementById("preferredLanguage");

function clean(value) {
  return String(value || "").trim();
}

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
    languageInput.value = currentLanguage();
  }
}

syncLanguage();

const languageObserver = new MutationObserver(
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

      const preferredOrganization = clean(
        form.preferredOrganization?.value
      );

      const preferredLocation = clean(
        form.preferredLocation?.value
      );

      /*
       * Known local academy entrances already know
       * their organization, academy, and location.
       *
       * They enter the existing Management queue
       * directly instead of waiting for Admin routing.
       *
       * Unknown / national entrances retain the
       * original Admin review path.
       */
      const isSantaYnezLocal =
        preferredOrganization === "sandman-academy" &&
        preferredLocation === "santa-ynez-valley";

      const isLompocLocal =
        preferredOrganization === "sandman-academy" &&
        preferredLocation === "lompoc";

      const isElkGroveLocal =
        preferredOrganization === "sandman-academy" &&
        preferredLocation === "elk-grove";

      const isKnownLocal =
        isSantaYnezLocal ||
        isLompocLocal ||
        isElkGroveLocal;

      const payload = {
        organization: "sandman-system",
        pipeline: "general-messaging",
        source: "public-message-page",

        status: "NEW",
        messageStatus: "NEW",

        contactName: clean(
          form.contactName?.value
        ),

        email: clean(
          form.email?.value
        ).toLowerCase(),

        phone: clean(
          form.phone?.value
        ),

        topic: clean(
          form.messageTopic?.value
        ),

        message: clean(
          form.message?.value
        ),

        /*
         * Public routing preferences.
         *
         * These help System Admin identify the intended
         * organization and location. They do not create
         * the official routing assignment.
         */
        preferredOrganization,
        preferredLocation,

        contactConsent: Boolean(
          form.contactConsent?.checked
        ),

        language: currentLanguage(),
        pagePath: window.location.pathname,

        routingStage:
          isKnownLocal
            ? "MANAGEMENT_TRIAGE"
            : "ADMIN_REVIEW",

        nextRoutingStage:
          isKnownLocal
            ? "COACH_ASSIGNED"
            : "MANAGEMENT_TRIAGE",

        routingPolicy:
          isKnownLocal
            ? "LOCAL_TO_LOCATION_MANAGER"
            : "ADMIN_TO_ORGANIZATION_LOCATION_MANAGER",

        requiredManagerLevel:
          "LOCATION_MANAGER",

        assignmentStatus:
          isKnownLocal
            ? "PENDING_MANAGEMENT"
            : "UNASSIGNED",

        /*
         * Local academy pages already know their
         * canonical routing identity.
         *
         * National / unknown entries remain empty
         * until Admin determines where they belong.
         */
        organizationId:
          isKnownLocal
            ? "sandman-academy"
            : null,

        organizationName:
          isKnownLocal
            ? "Sandman Academy of Combat & Fitness"
            : "",

        academyId:
          isKnownLocal
            ? "sandman-academy"
            : null,

        academyName:
          isKnownLocal
            ? "Sandman Academy of Combat & Fitness"
            : "",

        locationId:
          isKnownLocal
            ? preferredLocation
            : null,

        locationName:
          isElkGroveLocal
            ? "Elk Grove, California"
            : isLompocLocal
              ? "Lompoc"
              : isSantaYnezLocal
                ? "Santa Ynez Valley"
                : "",

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
      };

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
          ? (
              isElkGroveLocal
                ? "Mensaje recibido. La gerencia de Elk Grove lo revisará."
                : isLompocLocal
                  ? "Mensaje recibido. El equipo de administración de Lompoc lo revisará."
                  : isSantaYnezLocal
                  ? "Mensaje recibido. El equipo de administración del Valle de Santa Ynez lo revisará."
                  : "Mensaje recibido. Nuestro equipo del sistema lo dirigirá al lugar correspondiente."
            )
          : (
              isElkGroveLocal
                ? "Message received. Elk Grove Management will review it."
                : isLompocLocal
                  ? "Message received. Lompoc management will review it."
                  : isSantaYnezLocal
                  ? "Message received. Santa Ynez Valley management will review it."
                  : "Message received. Our system team will route it appropriately."
            ),
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