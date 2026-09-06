const roleCards =
  Array.from(
    document.querySelectorAll("[data-role]")
  );

const panel =
  document.getElementById("activationPanel");

const title =
  document.getElementById("activationTitle");

const description =
  document.getElementById(
    "activationDescription"
  );

const notice =
  document.getElementById("activationNotice");

const continueLink =
  document.getElementById("continueLink");

const athleteFields =
  document.getElementById("athleteActivationFields");

const athleteId =
  document.getElementById("athleteId");

const athleteToken =
  document.getElementById("athleteToken");

const athleteEmail =
  document.getElementById("athleteEmail");

const athleteError =
  document.getElementById("athleteActivationError");

const roleConfig = {
  parent: {
    title: "Activate Parent Access",
    description:
      "Parent access must connect to an existing family and athlete record.",
    notice:
      "You will need the email or activation information associated with the family record.",
    href: "/parent/auth.html?mode=activate"
  },

  athlete: {
    title: "Activate Athlete Access",
    description:
      "Athlete access must connect to an athlete already created by Sandman staff.",
    notice:
      "You will need the athlete identifier or activation information provided by your coach.",
    href: "/athletes/auth/?mode=activate"
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


function selectRole(role) {
  const config = roleConfig[role];

  if (!config) return;

  roleCards.forEach((card) => {
    card.classList.toggle(
      "is-selected",
      card.dataset.role === role
    );
  });

  title.textContent =
    config.title;

  description.textContent =
    config.description;

  notice.textContent =
    config.notice;

  continueLink.href =
    config.href;

  athleteFields.hidden =
    role !== "athlete";

  continueLink.textContent =
    config.title;

  panel.hidden = false;
}

function athleteOnboardingUrl() {
  const id = String(athleteId.value || "")
    .trim()
    .toUpperCase();

  const token = String(athleteToken.value || "")
    .trim();

  const email = String(athleteEmail.value || "")
    .trim()
    .toLowerCase();

  if (!id || !token || !email || !athleteEmail.validity.valid) {
    throw new Error(
      "Enter the athlete ID, invitation token, and a valid athlete login email."
    );
  }

  localStorage.setItem(
    "sandman_magic_email",
    email
  );

  return (
    `/athlete-onboarding/?id=${encodeURIComponent(id)}` +
    `&token=${encodeURIComponent(token)}`
  );
}


roleCards.forEach((card) => {
  card.addEventListener(
    "click",
    () => {
      selectRole(card.dataset.role);
    }
  );
});


const params =
  new URLSearchParams(
    window.location.search
  );

const requestedRole =
  params.get("role");

athleteId.value =
  params.get("id") || params.get("uid") || "";

athleteToken.value =
  params.get("token") || params.get("invite") || "";

athleteEmail.value =
  params.get("email") || "";

continueLink.addEventListener("click", (event) => {
  if (athleteFields.hidden) return;

  event.preventDefault();
  athleteError.textContent = "";

  try {
    window.location.assign(
      athleteOnboardingUrl()
    );
  } catch (error) {
    athleteError.textContent =
      error.message;
  }
});

if (roleConfig[requestedRole]) {
  selectRole(requestedRole);
}
