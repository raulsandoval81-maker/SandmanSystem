import {
  db,
  doc,
  getDoc,
  ensureSignedIn
} from "/assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

function ageFromDob(value = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  const dayDiff = now.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age;
}

function athleteIdFromUrl() {
  const params = new URLSearchParams(location.search);
  return String(
    params.get("id") ||
    params.get("uid") ||
    ""
  ).trim().toUpperCase();
}

function athleteHubUrl(uid) {
  return `/athletes/hub/?id=${encodeURIComponent(uid)}`;
}

function applyYouthCopy(name = "Athlete") {
  $("accessLabel").textContent = "YOUTH ATHLETE ACCESS";
  $("welcomeKicker").textContent = "Welcome to Your Journey";
  $("welcomeTitle").textContent = `You're in, ${name}.`;
  $("welcomeIntro").textContent =
    "This is your Sandman home base. It keeps your training, progress, and goals together so you can see the work you are putting in.";

  $("item1Title").textContent = "Your Home Base";
  $("item1Text").textContent =
    "Your hub is where you can see what is happening in your Sandman journey.";

  $("item2Title").textContent = "Earn Your Progress";
  $("item2Text").textContent =
    "XP, ranks, stripes, practice, and milestones are earned through the work you do.";

  $("item3Title").textContent = "Know What's Next";
  $("item3Text").textContent =
    "Use your account to stay connected to training, schedules, and what your coach is helping you build.";

  $("item4Title").textContent = "Build Character";
  $("item4Text").textContent =
    "Combat, Strength, and Honor all matter. Show up, work hard, respect the room, and keep growing.";
}

function applyOlderAthleteCopy(name = "Athlete", adult = false) {
  $("accessLabel").textContent =
    adult ? "ADULT ATHLETE ACCESS" : "ATHLETE ACCESS";

  $("welcomeKicker").textContent =
    adult ? "Welcome to Sandman" : "Welcome to Your Home Base";

  $("welcomeTitle").textContent =
    adult
      ? `Your system is ready, ${name}.`
      : `You're connected, ${name}.`;

  $("welcomeIntro").textContent =
    adult
      ? "Your Sandman Athlete account is your operating home for training, progression, schedule, and development. The system records the work; you keep doing it."
      : "Your Sandman Athlete account brings your training, progression, schedule, and development into one place. This is where your work starts to become a record.";

  $("item1Title").textContent = "Home Base";
  $("item1Text").textContent =
    "Your Athlete Hub connects your training information, profile, and active journey.";

  $("item2Title").textContent = "Progression";
  $("item2Text").textContent =
    "Track XP, rank, practice activity, milestones, and the progression you earn over time.";

  $("item3Title").textContent = "Training & Schedule";
  $("item3Text").textContent =
    "Stay connected to your training structure, schedule, development work, and academy updates.";

  $("item4Title").textContent = "Combat = Character";
  $("item4Text").textContent =
    "Combat, Strength, and Honor are part of the same standard. Train with purpose and let the work speak.";
}

async function load() {
  await ensureSignedIn();

  const uid = athleteIdFromUrl();

  if (!uid) {
    $("welcomeStatus").textContent =
      "Missing Athlete ID. Return through your Sandman access link.";
    $("enterHub").hidden = true;
    return;
  }

  const snap = await getDoc(
    doc(db, "athletes", uid)
  );

  if (!snap.exists()) {
    $("welcomeStatus").textContent =
      "Athlete record not found.";
    $("enterHub").hidden = true;
    return;
  }

  const athlete = snap.data() || {};
  const name =
    String(
      athlete.firstName ||
      athlete.first ||
      athlete.publicName ||
      athlete.fullName ||
      "Athlete"
    )
      .trim()
      .split(/\s+/)[0] ||
    "Athlete";

  const dob =
    athlete.dob ||
    athlete.profile?.dob ||
    athlete.athlete?.dob ||
    "";

  const age =
    ageFromDob(dob);

  if (age !== null && age < 14) {
    applyYouthCopy(name);
  } else {
    applyOlderAthleteCopy(
      name,
      age !== null && age >= 18
    );
  }

  $("enterHub").href =
    athleteHubUrl(uid);

  $("welcomeStatus").textContent =
    "Your account is active and ready.";
}

load().catch((error) => {
  console.error("[athlete-welcome] failed:", error);
  $("welcomeStatus").textContent =
    "Unable to load your Sandman welcome page.";
});
