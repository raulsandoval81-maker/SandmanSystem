import { auth, functions, httpsCallable } from "/assets/js/firebase-init.js";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  readAthleteActivationContext,
  assertCompleteAthleteActivationContext,
  athleteActivationReturnUrl,
  athleteHomeUrl
} from "./activation-context.js";

const context = readAthleteActivationContext();
const athleteIdEl = document.getElementById("athleteId");
const invitedEmailEl = document.getElementById("invitedEmail");
const passwordField = document.getElementById("passwordField");
const passwordInput = document.getElementById("activationPassword");
const activateButton = document.getElementById("activateButton");
const statusEl = document.getElementById("activationStatus");

let authReady = false;
let signedInUser = null;

function setStatus(message, kind = "") {
  statusEl.textContent = message || "";
  statusEl.className = `activation-status${kind ? ` is-${kind}` : ""}`;
}

function invitedEmailMatches(user) {
  return String(user?.email || "").trim().toLowerCase() === context.email;
}

function hasSignedInCollision(user) {
  return Boolean(user && !user.isAnonymous && !invitedEmailMatches(user));
}

function showCollision() {
  activateButton.disabled = true;
  setStatus(
    "A different account is signed in. Open this invitation in the Athlete's browser or a private window, then try again.",
    "error"
  );
}

async function sendActivationEmail() {
  assertCompleteAthleteActivationContext(context);
  if (hasSignedInCollision(signedInUser)) return showCollision();
  activateButton.disabled = true;
  setStatus("Sending the secure Athlete sign-in email...");
  try {
    await sendSignInLinkToEmail(auth, context.email, {
      url: athleteActivationReturnUrl(context),
      handleCodeInApp: true
    });
    setStatus(`Secure sign-in sent to ${context.email}. Open that email to continue.`, "ok");
  } catch (error) {
    console.error("[athlete-access-activate] email failed", error);
    activateButton.disabled = false;
    setStatus(error?.message || "Unable to send the secure sign-in email.", "error");
  }
}

async function completeActivation() {
  assertCompleteAthleteActivationContext(context);
  if (hasSignedInCollision(signedInUser)) return showCollision();
  const password = passwordInput.value;
  if (password.length < 8) {
    setStatus("Create a password with at least 8 characters.", "error");
    return;
  }

  activateButton.disabled = true;
  try {
    setStatus("Verifying the secure Athlete sign-in...");
    const credential = await signInWithEmailLink(auth, context.email, window.location.href);
    const user = credential.user;
    if (!invitedEmailMatches(user)) throw new Error("The authenticated email does not match this invitation.");

    setStatus("Creating the Athlete password...");
    await updatePassword(user, password);

    setStatus("Connecting the login to the existing Athlete profile...");
    const consume = httpsCallable(functions, "consumeAccessInvitation");
    const response = await consume({ tokenId: context.tokenId });
    const result = response?.data || {};
    if (result.role !== "athlete" || String(result.athleteUid || "").trim().toUpperCase() !== context.athleteId) {
      throw new Error("The activation response did not match this Athlete profile.");
    }

    setStatus("Athlete access activated. Opening Athlete Home...", "ok");
    window.location.replace(athleteHomeUrl(context.athleteId));
  } catch (error) {
    console.error("[athlete-access-activate] activation failed", error);
    activateButton.disabled = false;
    setStatus(error?.message || "Athlete access could not be activated.", "error");
  }
}

activateButton.addEventListener("click", async () => {
  if (!authReady) return;
  if (isSignInWithEmailLink(auth, window.location.href)) {
    await completeActivation();
  } else {
    await sendActivationEmail();
  }
});

onAuthStateChanged(auth, (user) => {
  authReady = true;
  signedInUser = user;
  athleteIdEl.textContent = context.athleteId || "Missing";
  invitedEmailEl.textContent = context.email || "Missing";
  try {
    assertCompleteAthleteActivationContext(context);
    if (hasSignedInCollision(user)) return showCollision();
    if (isSignInWithEmailLink(auth, window.location.href)) {
      passwordField.hidden = false;
      activateButton.textContent = "Finish Athlete Activation";
      setStatus("Create your password, then finish activation.");
    } else {
      activateButton.disabled = false;
      setStatus("Ready to send your secure Athlete sign-in email.");
    }
  } catch (error) {
    activateButton.disabled = true;
    setStatus(error.message, "error");
  }
});
