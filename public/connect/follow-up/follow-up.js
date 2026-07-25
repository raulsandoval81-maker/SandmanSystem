const params =
  new URLSearchParams(window.location.search);

const token =
  String(params.get("token") || "").trim();

const status =
  document.getElementById("status");

const appointmentCards =
  document.querySelectorAll(".appointment-card");

function setStatus(message = "", isError = false) {
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

  /*
   * Secure appointment lookup will be added here.
   *
   * Future flow:
   *
   * 1. Gatekeeper creates a limited public appointment record.
   * 2. The record is identified by a secure random token.
   * 3. This page loads only approved appointment information.
   * 4. Private interest-lead information remains protected.
   * 5. Families use email as the primary communication method.
   */

  setStatus(
    "This appointment link is not active yet. Please use the appointment details provided in your confirmation email. To ask a question, reschedule, or update your information, reply directly to that email.",
    true
  );
}

loadAppointment();