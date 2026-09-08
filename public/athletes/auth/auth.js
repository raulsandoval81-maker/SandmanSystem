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
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
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
