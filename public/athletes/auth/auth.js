import {
  auth,
  db,
  collection,
  query,
  where,
  getDocs,
  limit
} from "/assets/js/firebase-init.js";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

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
        "Recovery email sent. Check your inbox and spam folder.",
        "ok"
      );
    } catch (error) {
      console.error(
        "[athlete-auth] recovery failed:",
        error
      );

      setStatus(
        "Unable to send recovery email.",
        "error"
      );
    }
  }
);

onAuthStateChanged(
  auth,
  async (user) => {
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