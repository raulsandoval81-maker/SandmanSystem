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
      "This appointment link is missing or invalid.",
      true
    );
    return;
  }

  setStatus("Loading appointment details...");

  /*
   * Secure appointment lookup will be added here.
   *
   * The future flow:
   *
   * 1. Gatekeeper creates a limited public appointment record.
   * 2. The record is identified by a random token.
   * 3. This page loads only the appointment information.
   * 4. Private interest-lead information remains protected.
   */

  setStatus(
    "This appointment link is not active yet. Please use the details in your confirmation email or contact your coach.",
    true
  );
}

loadAppointment();