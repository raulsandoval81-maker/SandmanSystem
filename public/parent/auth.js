import {
  auth,
  db,
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
} from "/assets/js/firebase-init-para.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

const $ = (id) => document.getElementById(id);

const tabLogin = $("tabLogin");
const tabCreate = $("tabCreate");
const panelLogin = $("panelLogin");
const panelCreate = $("panelCreate");

const loginForm = $("loginForm");
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
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

async function activatePendingLinksForEmail(email, parentUid) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !parentUid) return 0;

  const linksQuery = query(
    collection(db, "parentAthleteLinks"),
    where("parentEmail", "==", normalizedEmail)
  );

  const snap = await getDocs(linksQuery);
  if (snap.empty) return 0;

  let activatedCount = 0;

  for (const linkDoc of snap.docs) {
    const data = linkDoc.data() || {};
    const status = String(data.status || "").trim().toLowerCase();
    const existingParentUid = String(data.parentUid || "").trim();

    if (status === "active" && existingParentUid === parentUid) {
      continue;
    }

    await updateDoc(doc(db, "parentAthleteLinks", linkDoc.id), {
      parentUid,
      status: "active",
      activatedAt: serverTimestamp(),
    });

    activatedCount += 1;
  }

  return activatedCount;
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

  onAuthStateChanged(auth, (user) => {
    if (authResolved) return;
    authResolved = true;

    if (user && user.uid) {
      goToNext();
      return;
    }

    revealAuthPage();
  });

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = (loginEmail?.value || "").trim().toLowerCase();
      const password = loginPassword?.value || "";

      if (!email || !password) {
        setStatus(loginStatus, "Enter both email and password.", "error");
        return;
      }

      loginBtn.disabled = true;
      setStatus(loginStatus, "Signing in...");

      try {
        await signInWithEmailAndPassword(auth, email, password);
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

  if (createForm) {
    createForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = (createName?.value || "").trim();
      const email = (createEmail?.value || "").trim().toLowerCase();
      const password = createPassword?.value || "";
      const confirm = createPassword2?.value || "";

      if (!name || !email || !password || !confirm) {
        setStatus(createStatus, "Complete all fields.", "error");
        return;
      }

      if (password !== confirm) {
        setStatus(createStatus, "Passwords do not match.", "error");
        return;
      }

      if (password.length < 6) {
        setStatus(createStatus, "Password must be at least 6 characters.", "error");
        return;
      }

      createBtn.disabled = true;
      setStatus(createStatus, "Creating account...");

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const user = cred.user;

        const activated = await activatePendingLinksForEmail(email, user.uid);

        if (activated > 0) {
          setStatus(createStatus, "Account created and athlete access linked.", "ok");
        } else {
          setStatus(
            createStatus,
            "Account created. Athlete access is not linked yet. Contact coach.",
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