import { runtimeEnvironment, runtimeFirebaseConfig } from "/assets/js/runtime-environment.js";
import { generalMessagePayload } from "../general-message-payload.mjs";

const form = document.getElementById("casa-inquiry");
const button = form.querySelector("button");
const status = document.getElementById("status");

if (runtimeEnvironment !== "staging" || runtimeFirebaseConfig?.projectId !== "sandman-combat-staging") {
  status.textContent = "Casa inquiry submission is available only on staging.";
} else {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const values = new FormData(form);
    button.disabled = true;
    status.textContent = "Sending inquiry…";
    try {
      const { db, collection, addDoc, serverTimestamp, ensureSignedIn } = await import("/assets/js/firebase-init.js");
      await ensureSignedIn();
      await addDoc(collection(db, "general_messages"), generalMessagePayload({
        contactName: values.get("contactName"),
        email: values.get("email"),
        topic: values.get("topic"),
        message: values.get("message"),
        contactConsent: values.has("consent"),
        language: "en",
        pagePath: window.location.pathname
      }, serverTimestamp, "casa-national-site"));
      form.reset();
      status.textContent = "Inquiry received for Admin Review.";
    } catch {
      status.textContent = "The inquiry could not be sent.";
    } finally {
      button.disabled = false;
    }
  });
  button.disabled = false;
}
