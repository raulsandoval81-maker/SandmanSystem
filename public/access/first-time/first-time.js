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

const parentFields =
  document.getElementById("parentActivationFields");

const parentToken =
  document.getElementById("parentToken");

const parentEmail =
  document.getElementById("parentEmail");

const parentError =
  document.getElementById("parentActivationError");

const roleConfig = {
  parent: {
    title: "Activate Parent Access",
    description:
      "Parent access must connect to an existing family and athlete record.",
    notice:
      "Use the private invitation issued by Sandman Management.",
    href: "/parent/auth.html?mode=activate"
  },

  athlete: {
    title: "Activate Athlete Access",
    description:
      "Athlete access must connect to an athlete already created by Sandman staff.",
    notice:
      "You will need the athlete identifier or activation information provided by your coach.",
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

  parentFields.hidden =
    role !== "parent";

  continueLink.textContent =
    config.title;

  panel.hidden = false;
}

function parentActivationUrl() {
  const token = String(parentToken.value || "").trim();
  const email = String(parentEmail.value || "").trim().toLowerCase();
  if (!token || !email || !parentEmail.validity.valid) {
    throw new Error("Enter the invitation token and a valid Parent email.");
  }
  return `/parent/auth.html?mode=activate&token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
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

parentToken.value =
  params.get("token") || params.get("invite") || "";

parentEmail.value =
  params.get("email") || "";

continueLink.addEventListener("click", (event) => {
  if (parentFields.hidden) return;

  event.preventDefault();
  try {
    window.location.assign(parentActivationUrl());
  } catch (error) {
    parentError.textContent = error.message;
  }
});

if (roleConfig[requestedRole]) {
  selectRole(requestedRole);
}
