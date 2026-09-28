import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

function dateFromValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "object" && Number.isFinite(value.seconds)) {
    return new Date(value.seconds * 1000);
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function ageFromDob(value) {
  const dob = dateFromValue(value);
  if (!dob) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();

  if (
    month < 0 ||
    (month === 0 && now.getDate() < dob.getDate())
  ) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

function accessOwnership(athlete = {}) {
  const role = String(
    athlete.registrantRole ||
    athlete.intakeAudience ||
    athlete.registrationRole ||
    ""
  ).trim().toLowerCase();

  const ageValue = Number(
    athlete.age ??
    athlete.athleteAge ??
    athlete.profile?.age
  );

  const age = Number.isFinite(ageValue) && ageValue >= 0
    ? ageValue
    : ageFromDob(
        athlete.dob ||
        athlete.dateOfBirth ||
        athlete.birthDate ||
        athlete.athlete?.dob ||
        athlete.athlete?.dateOfBirth ||
        athlete.profile?.dob ||
        athlete.profile?.dateOfBirth
      );

  if (
    role === "adult_athlete" ||
    role === "adult-athlete" ||
    (age !== null && age >= 18)
  ) {
    return { kind: "adult", age };
  }

  if (
    role === "parent_guardian" ||
    role === "parent-guardian" ||
    role === "guardian" ||
    (age !== null && age < 18)
  ) {
    return { kind: "minor", age };
  }

  return { kind: "unknown", age: null };
}

function statusNote(text, className = "recent-access-note") {
  const note = document.createElement("span");
  note.className = className;
  note.textContent = text;
  return note;
}

function ensureStyles() {
  if (document.getElementById("enrollmentAccessGuardStyles")) return;

  const style = document.createElement("style");
  style.id = "enrollmentAccessGuardStyles";
  style.textContent = `
    body.management-enrollment-page .recent-access-note{
      display:inline-flex;
      align-items:center;
      min-height:32px;
      padding:6px 9px;
      border-radius:999px;
      background:var(--management-neutral-soft,#eef1f4);
      color:var(--management-muted,#667085);
      font-size:.74rem;
      font-weight:750;
    }

    @media(max-width:760px){
      body.management-enrollment-page .recent-access-note{
        width:100%;
        border-radius:10px;
      }
    }
  `;

  document.head.appendChild(style);
}

async function reconcileCard(card) {
  const uid = String(card.dataset.recentAthlete || "").trim();
  const parentButton = card.querySelector("[data-recent-parent-uid]");

  if (!uid || !parentButton) return;

  try {
    const snapshot = await getDoc(doc(db, "athletes", uid));
    if (!snapshot.exists()) {
      parentButton.replaceWith(
        statusNote("Access ownership not confirmed")
      );
      return;
    }

    const ownership = accessOwnership(snapshot.data() || {});

    if (ownership.kind === "adult") {
      parentButton.replaceWith(
        statusNote(
          ownership.age !== null
            ? `Adult athlete · age ${ownership.age} · Parent access not applicable`
            : "Adult athlete · Parent access not applicable"
        )
      );
      return;
    }

    if (ownership.kind === "unknown") {
      parentButton.replaceWith(
        statusNote("Access ownership not confirmed")
      );
    }
  } catch (error) {
    console.warn(
      "[enrollment-access-guard] ownership check failed:",
      uid,
      error
    );

    parentButton.replaceWith(
      statusNote("Access ownership not confirmed")
    );
  }
}

async function run() {
  ensureStyles();

  const box = document.getElementById("approved-list");
  if (!box) return;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const cards = Array.from(
      box.querySelectorAll("[data-recent-athlete]")
    );

    if (cards.length) {
      await Promise.all(cards.map(reconcileCard));
      return;
    }

    await new Promise((resolve) =>
      window.setTimeout(resolve, 250)
    );
  }
}

run();
