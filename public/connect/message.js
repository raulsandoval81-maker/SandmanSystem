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

        passType: clean(
          form.passType?.value
        ),

        message: clean(
          form.message?.value
        ),

        contactConsent: Boolean(
          form.contactConsent?.checked
        ),

        language:
          currentLanguage(),

        pagePath:
          window.location.pathname,

        /*
         * Public Message Us has no location context.
         * Every public message enters Admin Review.
         */
        routingStage:
          "ADMIN_REVIEW",

        nextRoutingStage:
          "MANAGEMENT_TRIAGE",

        routingPolicy:
          "PUBLIC_TO_SYSTEM_ADMIN",

        requiredManagerLevel:
          "SYSTEM_ADMIN",

        assignmentStatus:
          "UNASSIGNED",

        /*
         * Admin determines the final academy/location
         * only when routing is actually needed.
         */
        preferredOrganization:
          "sandman-system",

        preferredLocation:
          "",

        organizationId:
          null,

        organizationName:
          "",

        academyId:
          null,

        academyName:
          "",

        locationId:
          null,

        locationName:
          "",

        assignedAdminUid:
          null,

        assignedManagerUid:
          null,

        assignedCoachUid:
          null,

        respondedByUid:
          null,

        respondedByRole:
          null,

        respondedAt:
          null,

        closedByUid:
          null,

        closedAt:
          null,

        escalated:
          false,

        escalationReason:
          "",

        coachNotes:
          "",

        managementNotes:
          "",

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp()
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
