// Management Enrollment — discipline-scoped journey selector
// The paid proposal decides which disciplines are eligible.
// DOB decides the correct journey/framework within those disciplines.

import {
  db,
  doc,
  getDoc,
} from "../assets/js/firebase-init.js";

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(location.search);
const tokenId = String(params.get("token") || "").trim();

const F8_VIRTUES = [
  "FOCUS",
  "EFFORT",
  "ATTITUDE",
  "RESPECT",
  "SPEED",
  "POWER",
  "AGILITY",
  "COMBAT",
];

const JOURNEY_BUTTON_IDS = [
  "btn-mint-z2h",
  "btn-mint-p2l",
  "btn-mint-boxing",
  "btn-mint-z2h-muay-thai",
  "btn-mint-p2l-muay-thai",
];

// Fail closed while the paid proposal is being checked.
JOURNEY_BUTTON_IDS.forEach((id) => {
  const button = $(id);
  if (!button) return;
  button.hidden = true;
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
});

function normalize(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function normalizeName(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function disciplineLabel(value = "") {
  const labels = {
    wrestling: "Wrestling",
    boxing: "Boxing",
    "muay-thai": "Muay Thai",
  };

  return labels[normalize(value)] || value;
}

function getAge(dob = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (birth > today) return null;

  let age = today.getFullYear() - year;
  if (
    today.getMonth() < month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() < day)
  ) {
    age -= 1;
  }

  return age;
}

function athleteFullName(athlete = {}) {
  return String(
    athlete.name ||
    athlete.fullName ||
    athlete.athleteName ||
    [athlete.first, athlete.last].filter(Boolean).join(" ") ||
    ""
  ).trim();
}

function proposalAthletes(proposal = {}) {
  if (Array.isArray(proposal.lockedSnapshot?.athletes)) {
    return proposal.lockedSnapshot.athletes;
  }

  return Array.isArray(proposal.athletes)
    ? proposal.athletes
    : [];
}

function findProposalAthlete(proposal = {}, intake = {}) {
  const athletes = proposalAthletes(proposal);
  if (!athletes.length) return null;

  const intakeName = normalizeName(
    [
      intake.athlete?.first || intake.first,
      intake.athlete?.last || intake.last,
    ].filter(Boolean).join(" ")
  );

  if (intakeName) {
    const exact = athletes.find(
      (athlete) => normalizeName(athleteFullName(athlete)) === intakeName
    );
    if (exact) return exact;
  }

  return athletes.length === 1 ? athletes[0] : null;
}

function disciplinesForAthlete(athlete = {}, proposal = {}) {
  const values = [];

  if (Array.isArray(athlete.disciplines)) {
    values.push(...athlete.disciplines);
  }

  if (athlete.discipline) values.push(athlete.discipline);
  if (athlete.primaryDiscipline) values.push(athlete.primaryDiscipline);

  // Legacy proposal fallback: infer a discipline only from a concrete
  // program-interest code. Never infer from age alone.
  const programInterest = normalize(
    proposal.prospect?.programInterest ||
    proposal.lockedSnapshot?.prospect?.programInterest ||
    ""
  );

  if (programInterest.endsWith("-wrestling")) values.push("wrestling");
  if (programInterest.endsWith("-boxing")) values.push("boxing");
  if (programInterest.endsWith("-muay-thai")) values.push("muay-thai");

  return [...new Set(
    values
      .map(normalize)
      .filter((value) => ["wrestling", "boxing", "muay-thai"].includes(value))
  )];
}

function setButtonVisible(id, visible) {
  const button = $(id);
  if (!button) return;
  button.hidden = !visible;
  button.disabled = !visible;
  button.setAttribute("aria-disabled", visible ? "false" : "true");

  if (id === "btn-mint-z2h-muay-thai" && visible) {
    button.removeAttribute("title");
    const sub = button.querySelector(".mint-track-sub");
    if (sub) sub.textContent = "Foundry 8";
  }
}

function clearJourneySelection() {
  ["c-track", "c-tier", "c-rank", "c-program-track", "c-uid"].forEach((id) => {
    if ($(id)) $(id).value = "";
  });

  ["m-track", "m-rank", "m-padlock"].forEach((id) => {
    if ($(id)) $(id).textContent = "—";
  });

  if ($("mint-tag-output")) $("mint-tag-output").value = "";
  if ($("btn-approve")) $("btn-approve").disabled = true;

  document
    .querySelectorAll(".mint-track-btn")
    .forEach((button) => button.classList.remove("is-selected"));
}

function ensurePolicyNote() {
  let note = $("journeyEligibilityNote");
  if (note) return note;

  const grid = $("journeyPickerCard")?.querySelector(".mint-grid");
  if (!grid) return null;

  note = document.createElement("p");
  note.id = "journeyEligibilityNote";
  note.className = "muted small";
  grid.insertAdjacentElement("beforebegin", note);
  return note;
}

function setPolicyNote(message, isWarning = false) {
  const note = ensurePolicyNote();
  if (!note) return;
  note.textContent = message;
  note.style.color = isWarning ? "#a16207" : "";
}

function selectYouthMuayThai() {
  if ($("c-track")) $("c-track").value = "F8";
  if ($("c-tier")) $("c-tier").value = "T0";
  if ($("c-rank")) $("c-rank").value = "Shadow";
  if ($("c-program-track")) $("c-program-track").value = "zero2hero-kickboxing";
  if ($("c-uid")) $("c-uid").value = "";

  const virtueSelect = $("mint-virtue");
  if (virtueSelect) {
    const current = virtueSelect.value;
    virtueSelect.innerHTML = "";
    F8_VIRTUES.forEach((virtue) => {
      const option = document.createElement("option");
      option.value = virtue;
      option.textContent = virtue;
      virtueSelect.appendChild(option);
    });
    virtueSelect.value = F8_VIRTUES.includes(current) ? current : F8_VIRTUES[0];
  }

  const virtue = String($("mint-virtue")?.value || F8_VIRTUES[0]).trim().toUpperCase();
  if ($("mint-tag-output")) $("mint-tag-output").value = `F8_CB0000_${virtue}`;
  if ($("m-track")) $("m-track").textContent = "Road2Champion Muay Thai";
  if ($("m-rank")) $("m-rank").textContent = "T0_Shadow";
  if ($("m-padlock")) $("m-padlock").textContent = "—";

  document
    .querySelectorAll(".mint-track-btn")
    .forEach((button) => button.classList.remove("is-selected"));

  $("btn-mint-z2h-muay-thai")?.classList.add("is-selected");

  if ($("btn-approve")) $("btn-approve").disabled = false;
  if ($("approve-status")) {
    $("approve-status").textContent =
      "Journey selection ready. Verify details, then Approve.";
  }
}

function applyDisciplinePolicy(disciplines = []) {
  const dob = String($("c-dob")?.value || "").trim();
  const age = getAge(dob);

  const youth = age !== null && age < 14;
  const teenAdult = age !== null && age >= 14;

  const wrestling = disciplines.includes("wrestling");
  const boxing = disciplines.includes("boxing");
  const muayThai = disciplines.includes("muay-thai");

  setButtonVisible("btn-mint-z2h", youth && wrestling);
  setButtonVisible("btn-mint-p2l", teenAdult && wrestling);
  setButtonVisible("btn-mint-boxing", teenAdult && boxing);
  setButtonVisible("btn-mint-z2h-muay-thai", youth && muayThai);

  // Teen/adult Muay Thai is not a current Santa Ynez enrollment lane.
  setButtonVisible("btn-mint-p2l-muay-thai", false);

  clearJourneySelection();

  const active = [];
  if (youth && wrestling) active.push("Wrestling");
  if (teenAdult && wrestling) active.push("Wrestling");
  if (teenAdult && boxing) active.push("Boxing");
  if (youth && muayThai) active.push("Muay Thai");

  if (age === null) {
    setPolicyNote("Enter a valid Date of Birth to determine the eligible journey.", true);
    return;
  }

  if (!disciplines.length) {
    setPolicyNote(
      "No enrolled discipline could be confirmed from the paid proposal. Do not activate until the enrollment record is verified.",
      true
    );
    return;
  }

  if (!active.length) {
    setPolicyNote(
      `Paid enrollment: ${disciplines.map(disciplineLabel).join(" · ")}. No active journey is available for this age/enrollment combination.`,
      true
    );
    return;
  }

  setPolicyNote(`Paid enrollment: ${active.join(" · ")}. Only enrolled disciplines are shown below.`);
}

async function loadPolicy() {
  if (!tokenId) return;

  try {
    const intakeSnap = await getDoc(doc(db, "intakes", tokenId));
    if (!intakeSnap.exists()) return;

    const intake = intakeSnap.data() || {};
    const proposalId = String(intake.proposalId || "").trim();

    if (!proposalId) {
      applyDisciplinePolicy([]);
      return;
    }

    const proposalSnap = await getDoc(doc(db, "proposals", proposalId));
    if (!proposalSnap.exists()) {
      applyDisciplinePolicy([]);
      return;
    }

    const proposal = proposalSnap.data() || {};
    const athlete = findProposalAthlete(proposal, intake);
    const disciplines = athlete
      ? disciplinesForAthlete(athlete, proposal)
      : [];

    const apply = () => applyDisciplinePolicy(disciplines);

    apply();
    setTimeout(apply, 150);
    setTimeout(apply, 600);

    $("c-dob")?.addEventListener("change", () => {
      setTimeout(apply, 0);
    });
  } catch (error) {
    console.error("[journey-eligibility] unable to verify enrollment discipline:", error);
    applyDisciplinePolicy([]);
  }
}

$("btn-mint-z2h-muay-thai")?.addEventListener("click", selectYouthMuayThai);
$("mint-virtue")?.addEventListener("change", () => {
  if (!$("btn-mint-z2h-muay-thai")?.classList.contains("is-selected")) return;
  const virtue = String($("mint-virtue")?.value || "").trim().toUpperCase();
  if ($("mint-tag-output")) $("mint-tag-output").value = virtue
    ? `F8_CB0000_${virtue}`
    : "";
});

loadPolicy();
