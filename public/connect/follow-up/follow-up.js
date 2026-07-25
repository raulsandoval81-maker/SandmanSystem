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

function setText(id, value = "—") {
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

function getAcademyDetails(location = "") {
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
    name: "Sandman Combat Academy",
    address: "Please refer to your confirmation email."
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

  if (!token) {
    setStatus(
      "This appointment link is missing or invalid. Please refer to your Admissions Appointment confirmation email. To ask a question or request a change, reply directly to that email.",
      true
    );
    return;
  }

  setStatus(
    "Loading appointment details..."
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
        "This appointment link is unavailable or has expired. Please refer to your confirmation email or reply directly to that email for assistance.",
        true
      );
      return;
    }

    const data =
      followUpSnap.data();

    const academy =
      getAcademyDetails(
        String(
          data.appointmentLocation || ""
        ).trim()
      );

    const lang =
      data.lang === "es"
        ? "es"
        : "en";

    setText(
      "athleteName",
      data.athleteName
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
        "Please arrive approximately 10 minutes early."
    );

    showAppointmentDetails();
    setStatus("");
  } catch (error) {
    console.error(
      "[follow-up] Unable to load appointment:",
      error
    );

    setStatus(
      "We could not load this appointment right now. Please use the details in your confirmation email or reply directly to that email for assistance.",
      true
    );
  }
}

loadAppointment();