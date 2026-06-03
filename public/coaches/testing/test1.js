import {
  db,
  ensureSignedIn, // 🔥 ADD THIS
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "/assets/js/firebase-init.js";
// ------------------
// URL PARAMS
// ------------------
const params = new URLSearchParams(window.location.search);
const athleteId = params.get("uid") || params.get("athleteId") || "";
const coachIdFromUrl = params.get("coachId") || "";
const sessionId = params.get("sessionId") || "";
const panelSlot = params.get("panel") || "";

function normalizeCoach(raw = "") {
  const n = raw.toLowerCase().trim();

  if (n.includes("collins") || n.includes("james")) return "collins";
  if (n.includes("campos") || n.includes("david")) return "campos";
  if (n.includes("castellanos") || n.includes("chantalle")) return "castellanos";
  if (n.includes("alleman") || n.includes("zeke")) return "alleman";
  if (n.includes("sandoval") || n.includes("raul")) return "sandoval";

  return n.replace(/\s+/g, "_");
}
// ------------------
// DOM / STATE
// ------------------
const sectionsWrap = document.getElementById("sections");
const scoreState = {};

// ------------------
// DATA
// ------------------
const sections = [
  {
    title: "1. Neutral Offense — 20 pts",
    max: 20,
    items: [
      {
        title: "Stance, Motion & Actions",
        note: {
          cue: "Square stance / Staggered stance",
          shows: "Move, react, fake, shoot, sprawl, downblock",
          watch: "Comfort, hand placement, readiness, clean stance under activity"
        }
      },
      {
        title: "Tie & Shot Entry",
        note: {
          cue: "Favorite tie / Favorite shot",
          shows: "Enter cleanly into position or shot",
          watch: "Easy in, no finish / Easy in, easy finish"
        }
      },
      {
        title: "Pressure to Score",
        note: {
          cue: "Pressure work",
          shows: "Forward pressure, scoring intent, make partner carry you",
          watch: "Pressure → easy finishes / Hard in, easy finish"
        }
      },
      {
        title: "Finish",
        note: {
          cue: "Finish",
          shows: "Complete the action clean through the end",
          watch: "Finish clean A, B, C / Don’t stop wrestling"
        }
      }
    ]
  },

  {
    title: "2. Neutral Defense — 20 pts",
    max: 20,
    items: [
      {
        title: "Head & Hands",
        note: {
          cue: "Head & hands defense",
          shows: "Position early, defend before getting caught",
          watch: "Don’t get caught / See it early"
        }
      },
      {
        title: "Chest & Hips",
        note: {
          cue: "Chest & hips defense",
          shows: "Hips back, chest in position, control body line",
          watch: "Stay in position / Don’t fold"
        }
      },
      {
        title: "Low and High-Level Defense",
        note: {
          cue: "Low-level,high level defense",
          shows: "Block shots, defend underneath, recover position",
          watch: "Stop the shot / Stay underneath control"
        }
      },
      {
        title: "Reaction & Counter",
        note: {
          cue: "Go behind / Reshot ",
          shows: "Answer defense with action",
          watch: "Quick reaction, clear counter, continued wrestling"
        }
      }
    ]
  },

  {
    title: "3. Top — Control — 15 pts",
    max: 15,
    items: [
      {
        title: "Start Control",
        note: {
          cue: "Top pressure belly",
          shows: "Settle heavy, control first",
          watch: "Weight on hands / Stay heavy / No loose start"
        }
      },
      {
        title: "Breakdown — Referee's Position",
        note: {
          cue: "Break them down",
          shows: "Effective breakdown left or right",
          watch: "Position breakdowns / Make it work"
        }
      },
      {
        title: "Control & Chain",
        note: {
          cue: "Keep working",
          shows: "Chain from one control to the next",
          watch: "Don’t stop / If this → then that"
        }
      }
    ]
  },

  {
    title: "4. Bottom — Escape — 15 pts",
    max: 15,
    items: [
      {
        title: "Whistle → Build & Base",
        note: {
          cue: "Whistle",
          shows: "Immediate first move into strong build and base",
          watch: "No hesitation / Doesn’t stay flat / Builds to position fast"
        }
      },
      {
        title: "Hand Control → Seal Out",
        note: {
          cue: "Clear hands",
          shows: "Hand fight, clear elbow, seal out, and win position",
          watch: "Clear the elbow / Win hands / Seal the hip"
        }
      },
      {
        title: "Escape the Lock",
        note: {
          cue: "Top locks: chop, ankle, tight waist",
          shows: "Maintains base, clears control, and works back to escape or position",
          watch: "Doesn’t get flattened / Builds back up / Clears hands or hips / No panic"
        }
      }
    ]
  },

  {
    title: "5. Ride — Deep Waist Control — 15 pts",
    max: 15,
    items: [
      {
        title: "Establish Ride",
        note: {
          cue: "Deep waist ride",
          shows: "Get to it, lock it, settle in",
          watch: "Control first / Lock and settle"
        }
      },
      {
        title: "Return to Mat",
        note: {
          cue: "Back to mat",
          shows: "Return partner and keep them underneath",
          watch: "Don’t give escapes / Finish returns"
        }
      },
      {
        title: "Stay on Top, Follow the Hips",
        note: {
          cue: "They move, you adjust",
          shows: "Adjust through reactions without losing control",
          watch: "Stay on top / Follow hips / No separation"
        }
      }
    ]
  },

  {
    title: "6. Effort — Finish When It’s Hard — 15 pts",
    max: 15,
    items: [
      {
        title: "Easy In → Hard Finish",
        note: {
          cue: "Partner lets you in",
          shows: "Earn the finish once inside",
          watch: "Stay in it / Finish when it gets hard"
        }
      },
      {
        title: "Hard In → Hard Finish",
        note: {
          cue: "Partner fights setup",
          shows: "Work in anyway and finish through resistance",
          watch: "Finish anyway / Don’t stop"
        }
      },
      {
        title: "Work Rate",
        note: {
          cue: "Go",
          shows: "Push pace and stay engaged",
          watch: "Don’t stop / Push pace / Stay in the fight"
        }
      }
    ]
  }
];

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

function getIncompleteRows() {
  const missing = [];

  sections.forEach((section, sectionIndex) => {
    section.items.forEach((item, itemIndex) => {
      const key = `${sectionIndex}-${itemIndex}`;
      if (scoreState[key] === null) {
        missing.push({
          sectionTitle: section.title,
          itemLabel: item.title,
          key
        });
      }
    });
  });

  return missing;
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
      <div class="rule">Score what you see: Position → Action → Outcome. 5 = clean · 3 = sloppy/incomplete · 0 = missed</div>
    `;

    const itemsWrap = card.querySelector(".items");

    section.items.forEach((item, itemIndex) => {
      const key = `${sectionIndex}-${itemIndex}`;
      scoreState[key] = null;

      const row = document.createElement("div");
      row.className = "item";

      row.innerHTML = `
        <div class="name">${item.title}</div>
        <div class="score-row">
          <button class="score-btn" data-key="${key}" data-score="5" type="button">5</button>
          <button class="score-btn" data-key="${key}" data-score="3" type="button">3</button>
          <button class="score-btn" data-key="${key}" data-score="0" type="button">0</button>
        </div>
      `;

      if (item.note && item.note.length) {
        const noteEl = document.createElement("div");
        noteEl.className = "coach-note";
        noteEl.innerHTML = item.note.map(n => `• ${n}`).join("<br>");
        row.appendChild(noteEl);
      }

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

  const key = btn.dataset.key;
  const score = btn.dataset.score;

  scoreState[key] = Number(score);

  document
    .querySelectorAll(`.score-btn[data-key="${key}"]`)
    .forEach((node) => {
      node.classList.remove("selected-5", "selected-3", "selected-0");
    });

  btn.classList.add(`selected-${score}`);

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
    .forEach((btn) => {
      btn.classList.remove("selected-5", "selected-3", "selected-0");
    });

  const notesEl = document.getElementById("notes");
  if (notesEl) notesEl.value = "";

  updateTotals();
});

// ------------------
// SAVE (LIVE)
// ------------------
document.getElementById("saveBtn")?.addEventListener("click", async () => {
  try {
    await ensureSignedIn();  // 🔥 ADD THIS LINE
    const total = updateTotals();

    const incompleteRows = getIncompleteRows();
    if (incompleteRows.length) {
      const firstMissing = incompleteRows[0];
      alert(
        `Incomplete test. Missing ${incompleteRows.length} row(s).\n\n` +
        `First missing:\n${firstMissing.sectionTitle}\n${firstMissing.itemLabel}`
      );
      return;
    }

    const athlete = document.getElementById("athlete")?.value.trim() || "";
    const coachInput = document.getElementById("coach")?.value.trim() || "";
    const date = document.getElementById("testDate")?.value || "";
    const notes = document.getElementById("notes")?.value.trim() || "";

    if (!athleteId) {
      alert("Missing uid in URL");
      return;
    }

    if (!sessionId) {
      alert("Missing sessionId. Generate links from Command Center.");
      return;
    }

    if (!coachIdFromUrl && !coachInput) {
      alert("Missing coachId in URL or coach name in form");
      return;
    }

    const rawCoach = coachIdFromUrl || coachInput;

const finalCoachId = normalizeCoach(rawCoach); // 🔥 REQUIRED
const finalCoachName = rawCoach;

    const testType = params.get("testType") || "BASE_CHECK_V1";
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

      sessionId,
      panel: panelSlot,

      decision: total >= 85 ? "APPROVE" : "DENY",

      scores: { ...scoreState },
      total,
      result,
      notes,

      status: "final",

      createdAt: serverTimestamp(),
      date
    };

    const submissionId = `${sessionId}__${finalCoachId}`;
    const logRef = doc(db, "athletes", athleteId, "testingLogs", submissionId);

    const existing = await getDoc(logRef);
    if (existing.exists()) {
      alert("Panel already submitted — locked.");
      return;
    }

    await setDoc(logRef, payload);


    // 🔒 LOCK UI AFTER SUCCESS
    document.body.classList.add("locked");

    const saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
      saveBtn.textContent = "Submitted";
      saveBtn.disabled = true;
    }

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

async function checkIfAlreadySubmitted() {
  try {
    if (!athleteId || !sessionId) return;

const coachInputEl = document.getElementById("coach");
const coachInput = coachInputEl?.value.trim() || "";

const rawCoach = coachIdFromUrl || coachInput;
const finalCoachId = normalizeCoach(rawCoach); // 🔥 FIXED
const finalCoachName = rawCoach;               // display only

    if (!finalCoachId) return;

    const submissionId = `${sessionId}__${finalCoachId}`;
    const logRef = doc(db, "athletes", athleteId, "testingLogs", submissionId);

    const snap = await getDoc(logRef);

    if (snap.exists()) {
      document.body.classList.add("locked");

      const saveBtn = document.getElementById("saveBtn");
      if (saveBtn) {
        saveBtn.textContent = "Submitted";
        saveBtn.disabled = true;
      }

      console.log("Already submitted — UI locked");
    }
  } catch (err) {
    console.warn("Lock check failed:", err);
  }
}

// ------------------
// INIT
// ------------------
renderSections();
updateTotals();
hydrateFormFromAthlete();
checkIfAlreadySubmitted();