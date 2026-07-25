import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

const params =
  new URLSearchParams(window.location.search);

const token =
  String(
    params.get("token") || ""
  ).trim();

const status =
  document.getElementById("status");

const appointmentCards =
  document.querySelectorAll(
    ".appointment-card"
  );

const languageBlocks = [
  ...document.querySelectorAll(
    "[data-lang-block]"
  )
];

const savedLang =
  localStorage.getItem(
    "sandman-public-lang"
  ) === "es"
    ? "es"
    : "en";

const COPY = {
  en: {
    pageTitle:
      "Admissions Appointment | Sandman Combat",

    missingLink:
      "This appointment link is missing or invalid. Please refer to your Admissions Appointment confirmation email. To ask a question or request a change, reply directly to that email.",

    loading:
      "Loading appointment details...",

    unavailable:
      "This appointment link is unavailable or has expired. Please refer to your confirmation email or reply directly to that email for assistance.",

    loadError:
      "We could not load this appointment right now. Please use the details in your confirmation email or reply directly to that email for assistance.",

    placementAssessment:
      "Placement Assessment",

    newAthlete:
      "New Athlete",

    defaultAcademy:
      "Sandman Combat Academy",

    defaultAddress:
      "Please refer to your confirmation email.",

    defaultNotes:
      "Please arrive on time for your scheduled appointment."
  },

  es: {
    pageTitle:
      "Cita de Admisiones | Sandman Combat",

    missingLink:
      "Este enlace de cita no está disponible o no es válido. Consulta tu correo de confirmación de la cita de admisiones. Para hacer una pregunta o solicitar un cambio, responde directamente a ese correo.",

    loading:
      "Cargando los detalles de la cita...",

    unavailable:
      "Este enlace de cita no está disponible o ha vencido. Consulta tu correo de confirmación o responde directamente a ese correo para recibir ayuda.",

    loadError:
      "No pudimos cargar esta cita en este momento. Utiliza los detalles incluidos en tu correo de confirmación o responde directamente a ese correo para recibir ayuda.",

    placementAssessment:
      "Evaluación de Colocación",

    newAthlete:
      "Atleta Nuevo",

    defaultAcademy:
      "Academia Sandman Combat",

    defaultAddress:
      "Consulta tu correo de confirmación.",

    defaultNotes:
      "Por favor llega puntualmente a tu cita programada."
  }
};

function setText(
  id,
  value = "—"
) {
  const element =
    document.getElementById(id);

  if (!element) return;

  element.textContent =
    String(value || "").trim() || "—";
}

function setStatus(
  message = "",
  isError = false
) {
  if (!status) return;

  status.textContent = message;
  status.className = "status";

  if (isError) {
    status.classList.add("error");
  }
}

function hideAppointmentDetails() {
  appointmentCards.forEach((card) => {
    card.hidden = true;
  });
}

function showAppointmentDetails() {
  appointmentCards.forEach((card) => {
    card.hidden = false;
  });
}

function showLanguage(
  lang = "en"
) {
  const activeLang =
    lang === "es"
      ? "es"
      : "en";

  languageBlocks.forEach((node) => {
    const nodeLang =
      node.getAttribute(
        "data-lang-block"
      );

    node.classList.toggle(
      "hidden-lang",
      nodeLang !== activeLang
    );
  });

  localStorage.setItem(
    "sandman-public-lang",
    activeLang
  );

  document.documentElement.lang =
    activeLang;
}

function applyLanguage(
  lang = "en"
) {
  const activeLang =
    lang === "es"
      ? "es"
      : "en";

  const copy =
    COPY[activeLang] || COPY.en;

  document.title =
    copy.pageTitle;

  showLanguage(
    activeLang
  );
}

function getAcademyDetails(
  location = "",
  lang = "en"
) {
  const copy =
    COPY[lang] || COPY.en;

  if (location === "lompoc") {
    return {
      name: "Lompoc",
      address: [
        "Lompoc High School Wrestling Room — Room IA-1",
        "515 W College Ave",
        "Lompoc, CA 93436"
      ].join("\n")
    };
  }

  if (location === "solvang") {
    return {
      name: "Solvang",
      address: [
        "320 Alisal Road",
        "Suite 106",
        "Solvang, CA"
      ].join("\n")
    };
  }

  return {
    name: copy.defaultAcademy,
    address: copy.defaultAddress
  };
}

function formatAppointmentDate(
  value = "",
  lang = "en"
) {
  const match =
    String(value).match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return value || "—";
  }

  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12
      )
    );

  return new Intl.DateTimeFormat(
    lang === "es"
      ? "es-US"
      : "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone:
        "America/Los_Angeles"
    }
  ).format(date);
}

function formatAppointmentTime(
  value = ""
) {
  const match =
    String(value).match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (!match) {
    return value || "—";
  }

  let hour = Number(match[1]);
  const minute = match[2];

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    return value;
  }

  const period =
    hour >= 12
      ? "PM"
      : "AM";

  hour = hour % 12 || 12;

  return `${hour}:${minute} ${period}`;
}

async function loadAppointment() {
  hideAppointmentDetails();
  applyLanguage(savedLang);

  if (!token) {
    setStatus(
      COPY[savedLang].missingLink,
      true
    );
    return;
  }

  setStatus(
    COPY[savedLang].loading
  );

  try {
    const followUpRef =
      doc(
        db,
        "follow_up",
        token
      );

    const followUpSnap =
      await getDoc(followUpRef);

    if (!followUpSnap.exists()) {
      setStatus(
        COPY[savedLang].unavailable,
        true
      );
      return;
    }

    const data =
      followUpSnap.data();

    const lang =
      data.lang === "es"
        ? "es"
        : "en";

    const copy =
      COPY[lang];

    applyLanguage(lang);

    setStatus(
      copy.loading
    );

    const academy =
      getAcademyDetails(
        String(
          data.appointmentLocation || ""
        ).trim(),
        lang
      );

    const startingPath =
      data.admissionsPath === "assessment"
        ? copy.placementAssessment
        : copy.newAthlete;

    setText(
      "athleteName",
      data.athleteName
    );

    setText(
      "startingPath",
      startingPath
    );

    setText(
      "appointmentDate",
      formatAppointmentDate(
        data.appointmentDate,
        lang
      )
    );

    setText(
      "appointmentTime",
      formatAppointmentTime(
        data.appointmentTime
      )
    );

    setText(
      "coachName",
      data.appointmentCoach
    );

    setText(
      "academyName",
      academy.name
    );

    setText(
      "academyAddress",
      academy.address
    );

    setText(
      "coachNotes",
      data.appointmentNotes ||
        copy.defaultNotes
    );

    showAppointmentDetails();
    setStatus("");
  } catch (error) {
    console.error(
      "[follow-up] Unable to load appointment:",
      error
    );

    setStatus(
      COPY[savedLang].loadError,
      true
    );
  }
}

loadAppointment();
