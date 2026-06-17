import {
  functions,
  httpsCallable,
  ensureSignedIn,
} from "/assets/js/firebase-init.js";

const form = document.getElementById("parentLinkForm");
const athleteUidInput = document.getElementById("athleteUid");
const parentEmailInput = document.getElementById("parentEmail");
const submitBtn = document.getElementById("submitBtn");
const resultBox = document.getElementById("resultBox");

function showResult(data) {
  resultBox.textContent = JSON.stringify(data, null, 2);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const athleteUid = athleteUidInput.value.trim();
  const parentEmail = parentEmailInput.value.trim().toLowerCase();

  if (!athleteUid || !parentEmail) {
    showResult({ ok: false, error: "Athlete UID and parent email required." });
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Linking...";

  try {
    await ensureSignedIn();

    const linkParentToAthlete = httpsCallable(
      functions,
      "linkParentToAthlete"
    );

    const res = await linkParentToAthlete({
      athleteUid,
      parentEmail,
    });

    showResult(res.data);
  } catch (err) {
    console.error(err);
    showResult({
      ok: false,
      error: err?.message || String(err),
    });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Link Parent";
  }
});