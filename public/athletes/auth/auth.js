import {
  auth,
  db,
  functions,
  httpsCallable,
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";


const keepSignedIn =
  document.getElementById("keepSignedIn");

async function applyAuthPersistence() {
  await setPersistence(
    auth,
    keepSignedIn?.checked
      ? browserLocalPersistence
      : browserSessionPersistence
  );
}



const $ = (id) =>
  document.getElementById(id);

const tabLogin =
  $("tabLogin");

const tabActivate =
  $("tabActivate");

const panelLogin =
  $("panelLogin");

const panelActivate =
  $("panelActivate");

const loginForm =
  $("loginForm");

const loginEmail =
  $("loginEmail");

const loginPassword =
  $("loginPassword");

const loginBtn =
  $("loginBtn");

const forgotPasswordBtn =
  $("forgotPasswordBtn");

const loginStatus =
  $("loginStatus");

const activationSummary = $("activationSummary");
const activationPasswordField = $("activationPasswordField");
const activationPassword = $("activationPassword");
const activateAccessBtn = $("activateAccessBtn");
const activationStatus = $("activationStatus");

const activationParams = new URLSearchParams(window.location.search);
const activationAthleteId = String(activationParams.get("id") || activationParams.get("uid") || "").trim().toUpperCase();
const activationToken = String(activationParams.get("token") || "").trim();
const activationEmail = String(activationParams.get("email") || "").trim().toLowerCase();
const activationMode = activationParams.get("mode") === "activate"
  || (Boolean(activationAthleteId && activationToken && activationEmail)
    && isSignInWithEmailLink(auth, window.location.href));

let resolvingAuth = false;
let redirecting = false;

function setStatus(
  message = "",
  kind = ""
) {
  loginStatus.textContent =
    message;

  loginStatus.className =
    `status${kind ? ` ${kind}` : ""}`;
}

function setActivationStatus(message = "", kind = "") {
  activationStatus.textContent = message;
  activationStatus.className = `status${kind ? ` ${kind}` : ""}`;
}

function onboardingIsComplete(athlete = {}) {
  const onboarding = athlete.onboarding || {};
  return onboarding.status === "complete" || Boolean(onboarding.completedAt) || onboarding.locks?.step9 === true;
}

function activationUrl() {
  const url = new URL("/athletes/auth/", window.location.origin);
  url.searchParams.set("mode", "activate");
  url.searchParams.set("id", activationAthleteId);
  url.searchParams.set("token", activationToken);
  url.searchParams.set("email", activationEmail);
  return url.toString();
}

function validateActivationContext() {
  if (!activationAthleteId || !activationToken || !activationEmail) {
    throw new Error("This Athlete invitation is incomplete. Ask Sandman Management for a new complete activation link.");
  }
}

async function finishAthleteActivation() {
  validateActivationContext();
  const password = activationPassword.value;
  if (password.length < 8) {
    activationPasswordField.hidden = false;
    throw new Error("Create a password with at least 8 characters to finish activation.");
  }

  activateAccessBtn.disabled = true;
  try {
    setActivationStatus("Verifying the emailed sign-in link...");
    let user = auth.currentUser;
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const credential = await signInWithEmailLink(auth, activationEmail, window.location.href);
      user = credential.user;
    }
    if (!user || user.isAnonymous) throw new Error("Open the secure sign-in link from your email to continue.");
    if (String(user.email || "").trim().toLowerCase() !== activationEmail) {
      throw new Error("The signed-in email does not match this Athlete invitation.");
    }

    setActivationStatus("Creating the Athlete password...");
    await updatePassword(user, password);

    setActivationStatus("Binding direct access to the existing Athlete...");
    const consume = httpsCallable(functions, "consumeAccessInvitation");
    const result = await consume({ tokenId: activationToken });
    const boundAthleteId = String(result?.data?.athleteUid || "").trim().toUpperCase();
    if (result?.data?.role !== "athlete" || boundAthleteId !== activationAthleteId) {
      throw new Error("The invitation did not bind the expected Athlete record.");
    }

    setActivationStatus("Direct access activated. Opening your Athlete workspace...", "ok");
    const athleteSnap = await getDoc(doc(db, "athletes", activationAthleteId));
    if (!athleteSnap.exists()) throw new Error("The existing Athlete record could not be loaded after activation.");
    const destination = onboardingIsComplete(athleteSnap.data())
      ? `/athletes/hub/?id=${encodeURIComponent(activationAthleteId)}`
      : `/athlete-onboarding/step-2.html?id=${encodeURIComponent(activationAthleteId)}`;
    window.location.replace(destination);
  } catch (error) {
    console.error("[athlete-auth] activation failed:", error);
    setActivationStatus(error?.message || "Athlete activation could not be completed.", "error");
    activateAccessBtn.disabled = false;
  }
}

async function sendAthleteActivationLink() {
  try {
    validateActivationContext();
    activateAccessBtn.disabled = true;
    setActivationStatus("Sending the secure Athlete sign-in email...");
    await sendSignInLinkToEmail(auth, activationEmail, {
      url: activationUrl(),
      handleCodeInApp: true
    });
    activationPasswordField.hidden = false;
    setActivationStatus(`Secure sign-in sent to ${activationEmail}. Open that email on this device to continue.`, "ok");
  } catch (error) {
    console.error("[athlete-auth] activation email failed:", error);
    setActivationStatus(error?.message || "Unable to send the secure sign-in email.", "error");
    activateAccessBtn.disabled = false;
  }
}

function showLogin() {
  tabLogin.classList.add(
    "is-active"
  );

  tabActivate.classList.remove(
    "is-active"
  );

  tabLogin.setAttribute(
    "aria-selected",
    "true"
  );

  tabActivate.setAttribute(
    "aria-selected",
    "false"
  );

  panelLogin.classList.add(
    "is-active"
  );

  panelActivate.classList.remove(
    "is-active"
  );
}

function showActivate() {
  tabActivate.classList.add(
    "is-active"
  );

  tabLogin.classList.remove(
    "is-active"
  );

  tabActivate.setAttribute(
    "aria-selected",
    "true"
  );

  tabLogin.setAttribute(
    "aria-selected",
    "false"
  );

  panelActivate.classList.add(
    "is-active"
  );

  panelLogin.classList.remove(
    "is-active"
  );
}

function revealPage() {
  document.body.classList.remove(
    "auth-pending"
  );

  document.body.classList.add(
    "auth-ready"
  );
}

async function findAthleteId(
  authUid
) {
  const athleteQuery =
    query(
      collection(
        db,
        "athletes"
      ),
      where(
        "authUid",
        "==",
        authUid
      ),
      limit(1)
    );

  const snapshot =
    await getDocs(
      athleteQuery
    );

  if (snapshot.empty) {
    return "";
  }

  return snapshot.docs[0].id;
}

function openAthleteHub(
  athleteId
) {
  if (
    redirecting ||
    !athleteId
  ) {
    return;
  }

  redirecting = true;

  window.location.replace(
    `/athletes/hub/?id=${encodeURIComponent(
      athleteId
    )}`
  );
}

async function resolveSignedInAthlete(
  user
) {
  if (
    !user ||
    user.isAnonymous ||
    resolvingAuth
  ) {
    return;
  }

  resolvingAuth = true;

  try {
    setStatus(
      "Finding your athlete profile..."
    );

    const athleteId =
      await findAthleteId(
        user.uid
      );

    if (!athleteId) {
      await signOut(auth);

      setStatus(
        "No athlete profile is connected to this account. Use your coach-issued invitation or contact your coach.",
        "error"
      );

      revealPage();

      return;
    }

    setStatus(
      "Profile found. Opening Athlete Hub...",
      "ok"
    );

    openAthleteHub(
      athleteId
    );
  } catch (error) {
    console.error(
      "[athlete-auth] lookup failed:",
      error
    );

    setStatus(
      "Unable to locate your athlete profile.",
      "error"
    );

    revealPage();
  } finally {
    resolvingAuth = false;
  }
}

tabLogin.addEventListener(
  "click",
  showLogin
);

tabActivate.addEventListener(
  "click",
  showActivate
);

activateAccessBtn.addEventListener("click", async () => {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    await finishAthleteActivation();
  } else {
    await sendAthleteActivationLink();
  }
});

loginForm.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const email =
      loginEmail.value
        .trim()
        .toLowerCase();

    const password =
      loginPassword.value;

    if (
      !email ||
      !password
    ) {
      setStatus(
        "Enter both email and password.",
        "error"
      );

      return;
    }

    loginBtn.disabled = true;
    forgotPasswordBtn.disabled = true;

    try {
      setStatus(
        "Signing in..."
      );

      await applyAuthPersistence();

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      await resolveSignedInAthlete(
        credential.user
      );
    } catch (error) {
      console.error(
        "[athlete-auth] sign-in failed:",
        error
      );

      let message =
        "Login failed.";

      if (
        error?.code ===
        "auth/invalid-credential"
      ) {
        message =
          "Wrong email or password.";
      }

      if (
        error?.code ===
        "auth/too-many-requests"
      ) {
        message =
          "Too many attempts. Try again later.";
      }

      setStatus(
        message,
        "error"
      );
    } finally {
      loginBtn.disabled = false;
      forgotPasswordBtn.disabled = false;
    }
  }
);

forgotPasswordBtn.addEventListener(
  "click",
  async () => {
    const email =
      loginEmail.value
        .trim()
        .toLowerCase();

    if (!email) {
      setStatus(
        "Enter your email first.",
        "error"
      );

      return;
    }

    try {
      setStatus(
        "Sending account recovery email..."
      );

      await sendPasswordResetEmail(
        auth,
        email
      );

      setStatus(
        "If an activated athlete account exists for that email, a recovery message will arrive. If access has never been activated, use the invitation issued by Sandman Management.",
        "ok"
      );
    } catch (error) {
      console.error(
        "[athlete-auth] recovery failed:",
        error
      );

      setStatus(
        "If an activated athlete account exists for that email, a recovery message will arrive. If access has never been activated, use the invitation issued by Sandman Management.",
        "ok"
      );
    }
  }
);

onAuthStateChanged(
  auth,
  async (user) => {
    if (activationMode) {
      showActivate();
      loginEmail.value = activationEmail;
      activationSummary.textContent = activationAthleteId && activationEmail
        ? `Activate direct access for ${activationAthleteId} using ${activationEmail}.`
        : "This activation link is incomplete. Return to the invitation issued by Sandman Management.";
      if (isSignInWithEmailLink(auth, window.location.href)) {
        activationPasswordField.hidden = false;
        activateAccessBtn.textContent = "Finish Athlete Activation";
        setActivationStatus("Create your password, then finish activation.");
      }
      revealPage();
      return;
    }

    if (
      user &&
      !user.isAnonymous
    ) {
      loginEmail.value =
        user.email || "";

      await resolveSignedInAthlete(
        user
      );

      return;
    }

    revealPage();
  }
);
