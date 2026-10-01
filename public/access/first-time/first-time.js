const roleCards = Array.from(
  document.querySelectorAll("[data-role]")
);

const panel = document.getElementById("activationPanel");
const title = document.getElementById("activationTitle");
const description = document.getElementById("activationDescription");
const notice = document.getElementById("activationNotice");
const continueLink = document.getElementById("continueLink");
const parentFields = document.getElementById("parentActivationFields");
const parentToken = document.getElementById("parentToken");
const parentEmail = document.getElementById("parentEmail");
const parentError = document.getElementById("parentActivationError");

const params = new URLSearchParams(window.location.search);
const requestedRole = String(params.get("role") || "").trim().toLowerCase();
const invitationToken = String(params.get("token") || params.get("invite") || "").trim();
const invitationEmail = String(params.get("email") || "").trim().toLowerCase();
const athleteId = String(params.get("id") || params.get("uid") || "").trim().toUpperCase();

const roleConfig = {
  parent: {
    title: "Activate Parent Access",
    description:
      "Use the Parent invitation issued by Sandman Management to register or connect your Parent account.",
    notice:
      "This invitation is for the approved Parent or guardian email only. After activation, use the normal Sandman Login page.",
    href: "/parent/auth.html?mode=activate"
  },

  athlete: {
    title: "Activate Athlete Access",
    description:
      "Register the Athlete email connected to this invitation, create a password, and connect it to the existing Sandman Athlete record.",
    notice:
      "This is a one-time activation. Athletes under 14 require recorded Parent or guardian approval before Management can issue the invitation.",
    href: "/athletes/access/activate/"
  },

  coach: {
    title: "Accept Coach Invitation",
    description:
      "Coach accounts are created through approved Sandman invitations.",
    notice:
      "Use the email address and invitation information connected to your coaching record.",
    href: "/coaches/auth/?mode=activate"
  },

  management: {
    title: "Set Up Management Access",
    description:
      "Management access supports the initial System Admin setup and approved manager invitations.",
    notice:
      "The initial System Admin setup must be completed once. Additional managers require approval or invitation.",
    href: "/management/auth/?mode=activate"
  }
};

function buildParentActivationUrl() {
  const token = String(parentToken?.value || invitationToken || "").trim();
  const email = String(parentEmail?.value || invitationEmail || "").trim().toLowerCase();

  if (!token || !email || (parentEmail && !parentEmail.validity.valid)) {
    throw new Error("Enter the invitation token and a valid Parent email.");
  }

  return `/parent/auth.html?mode=activate&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function buildAthleteActivationUrl() {
  if (!athleteId || !invitationToken || !invitationEmail) {
    throw new Error("This Athlete invitation is incomplete. Ask Sandman Management for a new activation link.");
  }

  return `/athletes/access/activate/?id=${encodeURIComponent(athleteId)}&token=${encodeURIComponent(invitationToken)}&email=${encodeURIComponent(invitationEmail)}`;
}

function selectRole(role) {
  const config = roleConfig[role];
  if (!config) return;

  roleCards.forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.role === role);
  });

  title.textContent = config.title;
  description.textContent = config.description;
  notice.textContent = config.notice;
  continueLink.href = config.href;
  continueLink.textContent = config.title;
  parentFields.hidden = role !== "parent";
  if (parentError) parentError.textContent = "";

  panel.hidden = false;
}

roleCards.forEach((card) => {
  card.addEventListener("click", () => {
    selectRole(card.dataset.role);
  });
});

if (parentToken) parentToken.value = invitationToken;
if (parentEmail) parentEmail.value = invitationEmail;

continueLink.addEventListener("click", (event) => {
  const selectedRole = roleCards.find((card) => card.classList.contains("is-selected"))?.dataset.role;

  if (selectedRole === "parent") {
    event.preventDefault();
    try {
      window.location.assign(buildParentActivationUrl());
    } catch (error) {
      if (parentError) parentError.textContent = error.message;
    }
    return;
  }

  if (selectedRole === "athlete") {
    event.preventDefault();
    try {
      window.location.assign(buildAthleteActivationUrl());
    } catch (error) {
      if (parentError) parentError.textContent = error.message;
      else window.alert(error.message);
    }
  }
});

if (roleConfig[requestedRole]) {
  selectRole(requestedRole);
}
