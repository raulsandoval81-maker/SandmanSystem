import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";

console.log("DB:", db);

// ------------------
// URL PARAMS
// ------------------
const params = new URLSearchParams(window.location.search);
const athleteId = params.get("uid") || params.get("athleteId") || "";
const coachIdFromUrl = params.get("coachId") || "";

// ------------------
// DATA
// ------------------
const sections = [
  { title: "1. Neutral — 20 pts", max: 20, items: ["Stance & motion", "Favorite tie", "Shot", "Finish (2 clean reps)"] },
  { title: "2. Top — 20 pts", max: 20, items: ["Control on start", "Half OR cross face", "Breakdown execution", "Maintain pressure"] },
  { title: "3. Bottom — 20 pts", max: 20, items: ["Stand up", "Switch", "Turn in / quad pod", "Clean escape (no panic)"] },
  { title: "4. Counters — 15 pts", max: 15, items: ["Correct reaction", "Timing", "Control after counter"] },
  { title: "5. Ride — 15 pts", max: 15, items: ["Ride control", "Pressure", "Mat return"] },
  { title: "6. Strength + Mind — 10 pts", max: 10, items: ["Pyramid or Glacier work", "Answers (awareness)"] }
];

const sectionsWrap = document.getElementById("sections");
const scoreState = {};

// ------------------
// HELPERS
// ------------------
function getResultLabel(total) {
  if (total >= 95) return "ELITE BASE";
  if (total >= 90) return "STRONG";
  if (total >= 85) return "PASS";
  return "NOT READY";
}

function getTestingState(total) {
  return total >= 85 ? "COOLDOWN" : "FREEZE";
}

function getTrackFromAthleteId(id = "") {
  return String(id).toUpperCase().startsWith("F4_") ? "F4" : "F8";
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function hydrateFormFromAthlete() {
  const athleteInput = document.getElementById("athlete");
  const coachInput = document.getElementById("coach");
  const dateInput = document.getElementById("testDate");

  if (athleteId && athleteInput && !athleteInput.value) {
    athleteInput.value = athleteId;
  }

  if (coachIdFromUrl && coachInput && !coachInput.value) {
    coachInput.value = coachIdFromUrl;
  }

  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  if (!athleteId) return;

  try {
    const athleteRef = doc(db, "athletes", athleteId);
    const athleteSnap = await getDoc(athleteRef);

    if (!athleteSnap.exists()) return;

    const athleteData = athleteSnap.data() || {};
    if (athleteInput && !athleteInput.dataset.hydratedName) {
      athleteInput.value =
        athleteData.publicName ||
        athleteData.fullName ||
        athleteId;
      athleteInput.dataset.hydratedName = "true";
    }
  } catch (err) {
    console.warn("Athlete hydrate skipped:", err);
  }
}

// ------------------
// RENDER
// ------------------
function renderSections() {
  sectionsWrap.innerHTML = "";

  sections.forEach((section, sectionIndex) => {
    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <div class="section-head">
        <h2>${section.title}</h2>
        <div class="section-subtotal" id="subtotal-${sectionIndex}">0 / ${section.max}</div>
      </div>
      <div class="items"></div>
      <div class="rule">Tap one: 5 = clean · 3 = sloppy · 0 = missed</div>
    `;

    const itemsWrap = card.querySelector(".items");

    section.items.forEach((item, itemIndex) => {
      const key = `${sectionIndex}-${itemIndex}`;
      scoreState[key] = null;

      const row = document.createElement("div");
      row.className = "item";

      row.innerHTML = `
        <div class="name">${item}</div>
        <div class="score-row">
          <button class="score-btn" data-key="${key}" data-score="5" type="button">5</button>
          <button class="score-btn" data-key="${key}" data-score="3" type="button">3</button>
          <button class="score-btn" data-key="${key}" data-score="0" type="button">0</button>
        </div>
      `;

      itemsWrap.appendChild(row);
    });

    sectionsWrap.appendChild(card);
  });
}

// ------------------
// TOTALS
// ------------------
function updateTotals() {
  let total = 0;

  sections.forEach((section, sectionIndex) => {
    let subtotal = 0;

    section.items.forEach((_, itemIndex) => {
      const value = scoreState[`${sectionIndex}-${itemIndex}`];
      subtotal += value === null ? 0 : Number(value);
    });

    total += subtotal;
    const subtotalEl = document.getElementById(`subtotal-${sectionIndex}`);
    if (subtotalEl) subtotalEl.textContent = `${subtotal} / ${section.max}`;
  });

  const totalEl = document.getElementById("totalScore");
  if (totalEl) totalEl.textContent = `${total} / 100`;

  const status = document.getElementById("statusText");
  if (status) {
    status.classList.remove("pass", "fail");
    const result = getResultLabel(total);
    status.textContent = result;
    status.classList.add(total >= 85 ? "pass" : "fail");
  }

  return total;
}

// ------------------
// CLICK HANDLER
// ------------------
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".score-btn");
  if (!btn) return;

  const { key, score } = btn.dataset;
  scoreState[key] = Number(score);

  document
    .querySelectorAll(`.score-btn[data-key="${key}"]`)
    .forEach((node) => node.classList.remove("active"));

  btn.classList.add("active");
  updateTotals();
});

// ------------------
// RESET
// ------------------
document.getElementById("resetBtn")?.addEventListener("click", () => {
  Object.keys(scoreState).forEach((k) => {
    scoreState[k] = null;
  });

  document
    .querySelectorAll(".score-btn")
    .forEach((btn) => btn.classList.remove("active"));

  const notesEl = document.getElementById("notes");
  if (notesEl) notesEl.value = "";

  updateTotals();
});

// ------------------
// SAVE (LIVE)
// ------------------
document.getElementById("saveBtn")?.addEventListener("click", async () => {
  try {
    const total = updateTotals();

    const athlete = document.getElementById("athlete")?.value.trim() || "";
    const coachInput = document.getElementById("coach")?.value.trim() || "";
    const date = document.getElementById("testDate")?.value || "";
    const notes = document.getElementById("notes")?.value.trim() || "";

    if (!athleteId) {
      alert("Missing uid in URL");
      return;
    }

    if (!coachIdFromUrl && !coachInput) {
      alert("Missing coachId in URL or coach name in form");
      return;
    }

    const finalCoachId = coachIdFromUrl || coachInput;
    const finalCoachName = coachInput || coachIdFromUrl;
    const testType = "BASE_CHECK_V1";
    const result = getResultLabel(total);
    const nextTestingState = getTestingState(total);

    const athleteRef = doc(db, "athletes", athleteId);
    const athleteSnap = await getDoc(athleteRef);
    const athleteData = athleteSnap.exists() ? athleteSnap.data() || {} : {};

    const payload = {
      athleteId,
      athleteName: athlete || athleteData.publicName || athleteId,

      coachId: finalCoachId,
      coachName: finalCoachName,

      track: athleteData.trackBase || athleteData.track || getTrackFromAthleteId(athleteId),
      tier: athleteData.tier || "T0",
      testType,
      testId: "test1",
      version: 1,

      decision: total >= 85 ? "APPROVE" : "DENY",

      scores: { ...scoreState },
      total,
      result,
      notes,

      status: "final",

      createdAt: serverTimestamp(),
      date
    };

    const submissionId = `${testType}__${finalCoachId}`;
    const logRef = doc(db, "athletes", athleteId, "testingLogs", submissionId);

    const existing = await getDoc(logRef);
    if (existing.exists()) {
      alert(`Submission locked. ${finalCoachName} already submitted this test.`);
      return;
    }

    await setDoc(logRef, payload);

    // tie test into athlete state without overwriting whole testing map
    await updateDoc(athleteRef, {
      "testing.state": nextTestingState,
      "testing.lastTest": new Date().toISOString(),
      "testing.lastTestResult": total >= 85 ? "pass" : "fail",
      "testing.lastScore": total,
      "testing.coachReady": false,
      "testing.coachReadyAt": null,
      "testing.testingStartedAt": null,
      "testing.cooldownUntil": total >= 85 ? addDays(5) : null,
      "testing.freezeUntil": total >= 85 ? null : addDays(7),
      tierStatus: total >= 85 ? "cooldown" : "freeze",
      updatedAt: serverTimestamp()
    });

    alert(`Saved — ${result}`);
    console.log("testingLogs write success:", submissionId, payload);
    console.log("athlete testing state updated:", athleteId, nextTestingState);
  } catch (err) {
    console.error("testingLogs write failed:", err);
    alert(`Save failed: ${err.message || err}`);
  }
});

// ------------------
// COPY
// ------------------
document.getElementById("copyBtn")?.addEventListener("click", async () => {
  let total = 0;
  const lines = [];

  sections.forEach((section, sectionIndex) => {
    let subtotal = 0;

    section.items.forEach((_, itemIndex) => {
      const value = scoreState[`${sectionIndex}-${itemIndex}`];
      subtotal += value === null ? 0 : Number(value);
    });

    total += subtotal;
    lines.push(`${section.title}: ${subtotal} / ${section.max}`);
  });

  const athlete = document.getElementById("athlete")?.value || "Athlete";
  const testDate = document.getElementById("testDate")?.value || "No date";
  const coach = document.getElementById("coach")?.value || "Coach";
  const notes = document.getElementById("notes")?.value.trim() || "";

  const result = getResultLabel(total);

  const summary = [
    "Test 1 — Base Check",
    `Athlete: ${athlete}`,
    `Date: ${testDate}`,
    `Coach: ${coach}`,
    "",
    ...lines,
    "",
    `TOTAL: ${total} / 100`,
    `RESULT: ${result}`,
    notes ? `NOTES: ${notes}` : ""
  ].filter(Boolean).join("\n");

  try {
    await navigator.clipboard.writeText(summary);
  } catch {
    alert(summary);
  }
});

// ------------------
// THEME
// ------------------
const themeToggle = document.getElementById("themeToggle");

const savedTheme = localStorage.getItem("coachTestTheme");
if (savedTheme) {
  document.body.setAttribute("data-theme", savedTheme);
}

themeToggle?.addEventListener("click", () => {
  const next =
    document.body.getAttribute("data-theme") === "night"
      ? "day"
      : "night";

  document.body.setAttribute("data-theme", next);
  localStorage.setItem("coachTestTheme", next);
});

// ------------------
// INIT
// ------------------
renderSections();
updateTotals();
hydrateFormFromAthlete();