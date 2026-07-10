import {
  db,
  collection,
  addDoc,
  serverTimestamp,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const form = document.getElementById("interestForm");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");

function setStatus(message = "", type = "") {
  if (!formStatus) return;

  formStatus.textContent = message;
  formStatus.className = "form-status";

  if (type) {
    formStatus.classList.add(type);
  }
}

function setSubmitting(isSubmitting) {
  if (!submitBtn) return;

  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting
    ? "Sending..."
    : "Join the Interest List";
}

function clean(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function normalizePhone(value = "") {
  return clean(value);
}

function readForm() {
  const formData = new FormData(form);

  return {
    parentName: clean(formData.get("parentName")),
    athleteName: clean(formData.get("athleteName")),
    athleteAge: Number(formData.get("athleteAge") || 0),
    phone: normalizePhone(formData.get("phone")),
    email: normalizeEmail(formData.get("email")),
    city: clean(formData.get("city")),
    programInterest: clean(formData.get("programInterest")),
    experience: clean(formData.get("experience")),
    referralSource: clean(formData.get("referralSource")),
    notes: clean(formData.get("notes"))
  };
}

function validateLead(lead = {}) {
  if (!lead.parentName) {
    return "Enter the parent or guardian name.";
  }

  if (!lead.athleteName) {
    return "Enter the athlete name.";
  }

  if (!Number.isFinite(lead.athleteAge) || lead.athleteAge < 3 || lead.athleteAge > 99) {
    return "Enter a valid athlete age.";
  }

  if (!lead.phone) {
    return "Enter a phone number.";
  }

  if (!lead.email || !lead.email.includes("@")) {
    return "Enter a valid email address.";
  }

  if (!lead.programInterest) {
    return "Select a program.";
  }

  if (!lead.experience) {
    return "Select an experience level.";
  }

  if (!lead.referralSource) {
    return "Tell us how you heard about Sandman Combat.";
  }

  return "";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  setStatus("");

  const lead = readForm();
  const validationError = validateLead(lead);

  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  setSubmitting(true);

  try {
    await ensureSignedIn();

    await addDoc(
      collection(db, "interest_leads"),
      {
        ...lead,

        status: "new",
        source: "public-connect-form",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        contactedAt: null,
        appointmentScheduledAt: null,
        enrolledAt: null,

        coachNotes: "",
        assignedCoachUid: ""
      }
    );

    window.location.href = "/thanks/contact.html";
  } catch (error) {
    console.error("[connect] submission failed:", error);

    setStatus(
      "We could not submit your information. Please try again.",
      "error"
    );

    setSubmitting(false);
  }
});

console.log("[interest] interest.js loaded");