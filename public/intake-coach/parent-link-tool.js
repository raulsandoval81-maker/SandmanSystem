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

function buildLinks(uid) {
  const athleteUid =
    String(uid || "")
      .trim()
      .toUpperCase();

  return {
    profile:
      `https://sandmancombat.com/athletes/profile/?id=${encodeURIComponent(athleteUid)}`,

    onboarding:
      `https://sandmancombat.com/athlete-onboarding/?id=${encodeURIComponent(athleteUid)}`,
  };
}

function showResult(data) {
  resultBox.textContent =
    JSON.stringify(data, null, 2);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const athleteUid =
    athleteUidInput.value
      .trim()
      .toUpperCase();

  const parentEmail =
    parentEmailInput.value
      .trim()
      .toLowerCase();

  if (!athleteUid || !parentEmail) {
    showResult({
      ok: false,
      error:
        "Athlete UID and parent email required.",
    });

    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Linking...";

  try {
    await ensureSignedIn();

    const linkParentToAthlete =
      httpsCallable(
        functions,
        "linkParentToAthlete"
      );

    const res =
      await linkParentToAthlete({
        athleteUid,
        parentEmail,
      });

    const links =
      buildLinks(athleteUid);

    showResult({
      ...res.data,

      quickAccess: {
        athleteUid,

        profile:
          links.profile,

        onboarding:
          links.onboarding,
      },
    });
  } catch (err) {
    console.error(err);

    showResult({
      ok: false,
      error:
        err?.message ||
        String(err),
    });
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent =
      "Link Parent";
  }
});
const openProfileBtn =
  document.getElementById("openProfileBtn");

const openOnboardingBtn =
  document.getElementById("openOnboardingBtn");

const copyProfileBtn =
  document.getElementById("copyProfileBtn");

const copyOnboardingBtn =
  document.getElementById("copyOnboardingBtn");

function getUid() {
  return String(
    athleteUidInput.value || ""
  )
    .trim()
    .toUpperCase();
}

function profileUrl(uid) {
  return `https://sandmancombat.com/athletes/profile/?id=${encodeURIComponent(uid)}`;
}

function onboardingUrl(uid) {
  return `https://sandmancombat.com/athlete-onboarding/?id=${encodeURIComponent(uid)}`;
}

openProfileBtn?.addEventListener("click", () => {
  const uid = getUid();
  if (!uid) return;
  window.open(profileUrl(uid), "_blank");
});

openOnboardingBtn?.addEventListener("click", () => {
  const uid = getUid();
  if (!uid) return;
  window.open(onboardingUrl(uid), "_blank");
});

copyProfileBtn?.addEventListener("click", async () => {
  const uid = getUid();
  if (!uid) return;
  await navigator.clipboard.writeText(
    profileUrl(uid)
  );
});

copyOnboardingBtn?.addEventListener("click", async () => {
  const uid = getUid();
  if (!uid) return;
  await navigator.clipboard.writeText(
    onboardingUrl(uid)
  );
});