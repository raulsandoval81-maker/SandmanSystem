import {
  functions,
  httpsCallable,
  ensureSignedIn,
} from "/assets/js/firebase-init.js";

const form =
  document.getElementById("parentLinkForm");

const athleteUidInput =
  document.getElementById("athleteUid");

const parentEmailInput =
  document.getElementById("parentEmail");

const submitBtn =
  document.getElementById("submitBtn");

const resultBox =
  document.getElementById("resultBox");

const openMyAthleteBtn =
  document.getElementById("openMyAthleteBtn");

const copyMyAthleteBtn =
  document.getElementById("copyMyAthleteBtn");

function getAthleteUid() {
  return String(
    athleteUidInput?.value || ""
  )
    .trim()
    .toUpperCase();
}

function getParentEmail() {
  return String(
    parentEmailInput?.value || ""
  )
    .trim()
    .toLowerCase();
}

function myAthleteUrl(uid) {
  return (
    "https://sandmancombat.com/parent/index.html" +
    `?uid=${encodeURIComponent(uid)}`
  );
}

function showResult(data) {
  if (!resultBox) return;

  resultBox.textContent =
    JSON.stringify(data, null, 2);
}

function requireAthleteUid() {
  const uid = getAthleteUid();

  if (!uid) {
    showResult({
      ok: false,
      error: "Enter an athlete UID.",
    });

    return "";
  }

  return uid;
}

form?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();

    const athleteUid =
      getAthleteUid();

    const parentEmail =
      getParentEmail();

    if (!athleteUid || !parentEmail) {
      showResult({
        ok: false,
        error:
          "Athlete UID and parent email are required.",
      });

      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent =
        "Linking Parent...";
    }

    try {
      await ensureSignedIn();

      const linkParentToAthlete =
        httpsCallable(
          functions,
          "linkParentToAthlete"
        );

      const response =
        await linkParentToAthlete({
          athleteUid,
          parentEmail,
        });

      showResult({
        ...response.data,

        quickAccess: {
          athleteUid,
          parentEmail,
          myAthlete:
            myAthleteUrl(athleteUid),
        },
      });
    } catch (error) {
      console.error(
        "[parent-link-tool] failed:",
        error
      );

      showResult({
        ok: false,
        error:
          error?.message ||
          String(error),
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent =
          "Link Parent";
      }
    }
  }
);

openMyAthleteBtn?.addEventListener(
  "click",
  () => {
    const uid =
      requireAthleteUid();

    if (!uid) return;

    window.open(
      myAthleteUrl(uid),
      "_blank",
      "noopener"
    );
  }
);

copyMyAthleteBtn?.addEventListener(
  "click",
  async () => {
    const uid =
      requireAthleteUid();

    if (!uid) return;

    try {
      await navigator.clipboard.writeText(
        myAthleteUrl(uid)
      );

      showResult({
        ok: true,
        message:
          "My Athlete link copied.",
        athleteUid: uid,
        myAthlete:
          myAthleteUrl(uid),
      });
    } catch (error) {
      console.error(
        "[parent-link-tool] copy failed:",
        error
      );

      showResult({
        ok: false,
        error:
          "Unable to copy the My Athlete link.",
      });
    }
  }
);
