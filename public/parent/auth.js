import {
  auth,
  functions,
  httpsCallable,
} from "/assets/js/firebase-init-para.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
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



const $ = (id) => document.getElementById(id);

const tabLogin = $("tabLogin");
const tabCreate = $("tabCreate");
const panelLogin = $("panelLogin");
const panelCreate = $("panelCreate");

const loginForm = $("loginForm");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const forgotPasswordBtn = $("forgotPasswordBtn");
const loginBtn = $("loginBtn");
const loginStatus = $("loginStatus");

const createForm = $("createForm");
const createName = $("createName");
const createEmail = $("createEmail");
const createPassword = $("createPassword");
const createPassword2 = $("createPassword2");
const createBtn = $("createBtn");
const createStatus = $("createStatus");

const goHomeBtn = $("goHomeBtn");
const goHomeBtn2 = $("goHomeBtn2");

let authResolved = false;
let redirecting = false;

const activationParams = new URLSearchParams(window.location.search);
const activationToken = String(activationParams.get("token") || "").trim();
const activationEmail = String(activationParams.get("email") || "").trim().toLowerCase();

async function consumeParentInvitation(user) {
  if (!activationToken) return false;
  const consume = httpsCallable(functions, "consumeAccessInvitation");
  await consume({ tokenId: activationToken });
  return true;
}

function invitationErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("not found") || message.includes("token required")) {
    return "A valid private invitation is required.";
  }
  if (message.includes("expired")) return "This invitation has expired. Ask Sandman Management for a new one.";
  if (message.includes("used")) return "This invitation has already been used.";
  if (message.includes("email")) return "This invitation belongs to a different Parent email.";
  if (message.includes("another parent") || message.includes("conflict")) {
    return "This athlete relationship is already connected to another Parent account.";
  }
  return "Unable to activate Parent access with this invitation.";
}

function setStatus(el, message = "", kind = "") {
  if (!el) return;
  el.textContent = message;
  el.className = `status${kind ? " " + kind : ""}`;
}

function getNextUrl() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next) return "/parent/my-athlete";
  return next.startsWith("/") ? next : "/parent/my-athlete";
}

function showLoginTab() {
  if (!tabLogin || !tabCreate || !panelLogin || !panelCreate) return;

  tabLogin.classList.add("is-active");
  tabCreate.classList.remove("is-active");
  tabLogin.setAttribute("aria-selected", "true");
  tabCreate.setAttribute("aria-selected", "false");
  panelLogin.classList.add("is-active");
  panelCreate.classList.remove("is-active");
}

function showCreateTab() {
  if (!tabLogin || !tabCreate || !panelLogin || !panelCreate) return;

  tabCreate.classList.add("is-active");
  tabLogin.classList.remove("is-active");
  tabCreate.setAttribute("aria-selected", "true");
  tabLogin.setAttribute("aria-selected", "false");
  panelCreate.classList.add("is-active");
  panelLogin.classList.remove("is-active");
}

function revealAuthPage() {
  document.body.classList.remove("auth-pending");
  document.body.classList.add("auth-ready");
}

function goToNext() {
  if (redirecting) return;
  redirecting = true;
  window.location.href = getNextUrl();
}

document.addEventListener("DOMContentLoaded", () => {
  if (tabLogin) tabLogin.addEventListener("click", showLoginTab);
  if (tabCreate) tabCreate.addEventListener("click", showCreateTab);

  if (goHomeBtn) {
    goHomeBtn.addEventListener("click", () => {
      window.location.href = "/";
    });
  }

  if (goHomeBtn2) {
    goHomeBtn2.addEventListener("click", () => {
      window.location.href = "/";
    });
  }

  if (activationToken) {
    showCreateTab();
    if (createEmail) createEmail.value = activationEmail;
    if (loginEmail) loginEmail.value = activationEmail;
  }

  onAuthStateChanged(auth, async (user) => {
    if (authResolved) return;
    authResolved = true;

    if (user && user.uid) {
      try {
        if (activationToken) {
          await consumeParentInvitation(user);
        }
        goToNext();
      } catch (error) {
        console.error("[parent-auth activation] failed:", error);
        setStatus(createStatus, invitationErrorMessage(error), "error");
        revealAuthPage();
      }
      return;
    }

    revealAuthPage();
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email =
        (loginEmail?.value || "").trim().toLowerCase();

      const password =
        loginPassword?.value || "";

      if (!email || !password) {
        setStatus(loginStatus, "Enter both email and password.", "error");
        return;
      }

      loginBtn.disabled = true;
      setStatus(loginStatus, "Signing in...");

      try {
        await applyAuthPersistence();

        const cred =
          await signInWithEmailAndPassword(auth, email, password);

        if (activationToken) {
          await consumeParentInvitation(cred.user);
        }

        setStatus(loginStatus, "Signed in.", "ok");
        goToNext();
      } catch (err) {
        console.error("[parent-auth login] failed:", err);

        let message = "Login failed.";

        if (err?.code === "auth/invalid-credential") {
          message = "Wrong email or password.";
        } else if (err?.code === "auth/too-many-requests") {
          message = "Too many attempts. Try again later.";
        } else if (err?.code === "auth/network-request-failed") {
          message = "Network issue. Try again.";
        }

        setStatus(loginStatus, message, "error");
      } finally {
        loginBtn.disabled = false;
      }
    });
  }

  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
      const email =
        (loginEmail?.value || "").trim().toLowerCase();

      if (!email) {
        setStatus(loginStatus, "Enter your email first.", "error");
        return;
      }

      try {
        await sendPasswordResetEmail(auth, email);

        setStatus(
          loginStatus,
          "Password reset email sent.",
          "ok"
        );
      } catch (err) {
        console.error(err);

        setStatus(
          loginStatus,
          "Unable to send reset email.",
          "error"
        );
      }
    });
  }

  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name =
        (createName?.value || "").trim();

      const email =
        (createEmail?.value || "").trim().toLowerCase();

      const password =
        createPassword?.value || "";

      const confirm =
        createPassword2?.value || "";

      if (!name || !email || !password || !confirm) {
        setStatus(createStatus, "Complete all fields.", "error");
        return;
      }

      if (password !== confirm) {
        setStatus(createStatus, "Passwords do not match.", "error");
        return;
      }

      if (password.length < 6) {
        setStatus(
          createStatus,
          "Password must be at least 6 characters.",
          "error"
        );
        return;
      }

      createBtn.disabled = true;
      setStatus(createStatus, "Creating account...");

      try {
        await applyAuthPersistence();

        const cred =
          await createUserWithEmailAndPassword(auth, email, password);

        const user = cred.user;

        const activated = activationToken
          ? Number(await consumeParentInvitation(user))
          : 0;

        if (activated > 0) {
          setStatus(
            createStatus,
            "Account created and athlete access linked.",
            "ok"
          );
        } else {
          setStatus(
            createStatus,
            "Account created, but no athlete access was linked. Ask Sandman Management for a private invitation.",
            "ok"
          );
        }

        goToNext();
      } catch (err) {
        console.error("[parent-auth create] failed:", err);

        let message = "Account creation failed.";

        if (err?.code === "auth/email-already-in-use") {
          message = "That email already has an account. Use Login instead.";
        } else if (err?.code === "auth/invalid-email") {
          message = "Invalid email.";
        } else if (err?.code === "auth/weak-password") {
          message = "Password is too weak.";
        } else if (err?.code === "auth/network-request-failed") {
          message = "Network issue. Try again.";
        }

        setStatus(createStatus, message, "error");
      } finally {
        createBtn.disabled = false;
      }
    });
  }
});
