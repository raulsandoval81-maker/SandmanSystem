/* ============================================================
   SANDMAN QUIZ ENGINE (destiny.html + reflection.html)
   ============================================================ */

import {
  db, doc, setDoc, serverTimestamp
} from "../assets/js/firebase-init.js";

/* ------------------------------------------------------------
   QUIZ CONFIG
   Each page (destiny.html / reflection.html) sets:
   window.QUIZ_MODE = "F8" or "F4"
   window.ATHLETE_ID = "uid"
   window.MINI_PROFILE = { name, team, lane, tier, mint }
------------------------------------------------------------- */

const mode = window.QUIZ_MODE || "F8";   // F8 youth or F4 older
const athleteId = window.ATHLETE_ID;
const mini = window.MINI_PROFILE || {};

const isYouth = mode === "F8";

/* ------------------------------------------------------------
   QUIZ STRUCTURE
   5 Sections → flash card each step
------------------------------------------------------------- */

const screens = [];

/* ============================================================
   SECTION 0 — MINI PROFILE CONFIRMATION
============================================================ */
screens.push({
  type: "profile",
  title: "Is this you?",
  render() {
    return `
      <div class="flash-card">
        <h2 style="margin-bottom:16px;font-size:1.7rem;">
          ${mini.name || "Athlete"}
        </h2>
        <p>${mini.team || ""}</p>
        <p>${mini.cityState || ""}</p>
        <p>Track: <strong>${mini.lane || ""}</strong></p>
        <p>Rank: <strong>${mini.tier || ""}</strong></p>
        <p style="margin:8px 0 18px">Tag: <strong>${mini.mint || ""}</strong></p>

        <button class="quiz-cta" data-next="1">Yes — Continue</button>
      </div>
    `;
  }
});

/* ============================================================
   SECTION 1 — WHERE YOU ARE (self-perception, sliders)
   3 QUESTIONS
============================================================ */

const section1 = [
  "How strong do you feel right now?",
  "How fast do you feel right now?",
  "How disciplined are you today?"
];

section1.forEach((q, idx) => {
  screens.push({
    type: "slider",
    key: `s1_q${idx+1}`,
    title: q
  });
});

/* ============================================================
   SECTION 2 — WHERE YOU ARE (perspective)
============================================================ */

const section2 = [
  "How confident are you with combat basics?",
  "How well do you understand strength & conditioning?",
  "How well do you manage your attitude under pressure?"
];

section2.forEach((q, idx) => {
  screens.push({
    type: "slider",
    key: `s2_q${idx+1}`,
    title: q
  });
});

/* ============================================================
   SECTION 3 — WHERE YOU'RE GOING (A/B/C/D choices)
============================================================ */

const section3 = [
  {
    title: "What do you want most right now?",
    choices: ["Be stronger", "Get smarter", "Win more", "Build character"]
  },
  {
    title: "How hard do you want to work?",
    choices: ["Enough", "A lot", "As hard as I can", "More than anyone"]
  },
  {
    title: "What do you want people to say about you in a year?",
    choices: ["Focused", "Disciplined", "Dangerous", "Respected"]
  }
];

section3.forEach((obj, idx) => {
  screens.push({
    type: "mc",
    key: `s3_q${idx+1}`,
    title: obj.title,
    choices: obj.choices
  });
});

/* ============================================================
   SECTION 4 — HOW YOU'LL GET THERE (2 questions)
============================================================ */

const section4 = [
  {
    title: "What will you commit to each week?",
    choices: ["3 practices", "4 practices", "5+ practices"]
  },
  {
    title: "What is the hardest thing you will improve?",
    choices: ["Strength", "Discipline", "Technique", "Confidence"]
  }
];

section4.forEach((obj, idx) => {
  screens.push({
    type: "mc",
    key: `s4_q${idx+1}`,
    title: obj.title,
    choices: obj.choices
  });
});

/* ============================================================
   SECTION 5 — HEROES OR LEGENDS
============================================================ */

screens.push({
  type: "heroes",
  key: "heroes",
  title: isYouth
    ? "Name 2 heroes you look up to."
    : "Name 2 legends you want to become like."
});

/* ============================================================
   FINAL — FIRST STEP (small profile)
============================================================ */

screens.push({
  type: "final",
  title: "Your Path Begins Now"
});

/* ============================================================
   RENDER ENGINE
============================================================ */

let idx = 0;
const answers = {};

function renderScreen() {
  const wrap = document.querySelector(".quiz-wrap");
  const s = screens[idx];

  if (!s) return;

  /* ----------------------- PROFILE ------------------------ */
  if (s.type === "profile") {
    wrap.innerHTML = s.render();
    return;
  }

  /* ----------------------- SLIDER ------------------------ */
  if (s.type === "slider") {
    wrap.innerHTML = `
      <div class="flash-card visible">
        <p class="quiz-question">${s.title}</p>

        <div class="slider-wrap">
          <div class="slider-label">Move the slider</div>
          <input type="range" min="1" max="10" value="5" id="slider-${s.key}">
          <div class="slider-value" id="val-${s.key}">5</div>
        </div>

        <div class="answer-group small-buttons">
          <button class="quiz-btn small" data-extra="YES">Yes</button>
          <button class="quiz-btn small" data-extra="NO">No</button>
          <button class="quiz-btn small" data-extra="MAYBE">Maybe</button>
        </div>

        <button class="quiz-cta" data-next="1">Next →</button>
      </div>
    `;

    const slider = document.getElementById(`slider-${s.key}`);
    const label = document.getElementById(`val-${s.key}`);

    slider.oninput = () => {
      label.textContent = slider.value;
      answers[s.key] = { value: slider.value }; // update live
    };

    document.querySelectorAll(".quiz-btn.small").forEach(btn => {
      btn.onclick = () => {
        answers[s.key] = answers[s.key] || {};
        answers[s.key].feeling = btn.dataset.extra;
        document.querySelectorAll(".quiz-btn.small").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
    });

    return;
  }

  /* ----------------------- MULTIPLE CHOICE ------------------------ */
  if (s.type === "mc") {
    wrap.innerHTML = `
      <div class="flash-card visible">
        <p class="quiz-question">${s.title}</p>

        <div class="answer-group">
          ${s.choices.map((ch, i) =>
            `<button class="quiz-btn" data-val="${ch}">${ch}</button>`
          ).join("")}
        </div>

        <button class="quiz-cta" data-next="1">Next →</button>
      </div>
    `;

    document.querySelectorAll(".quiz-btn[data-val]").forEach(btn => {
      btn.onclick = () => {
        answers[s.key] = btn.dataset.val;
        document.querySelectorAll(".quiz-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
    });

    return;
  }

  /* ----------------------- HEROES/LEGENDS ------------------------ */
  if (s.type === "heroes") {
    wrap.innerHTML = `
      <div class="flash-card visible">
        <p class="quiz-question">${s.title}</p>
        <input class="quiz-input" id="hero1" placeholder="Name 1">
        <input class="quiz-input" id="hero2" placeholder="Name 2">

        <button class="quiz-cta" data-next="1">Finish →</button>
      </div>
    `;
    return;
  }

  /* ----------------------- FINAL ------------------------ */
  if (s.type === "final") {
    wrap.innerHTML = `
      <div class="flash-card visible">
        <h2 style="color:#FFD700;font-size:1.9rem">Your Path Begins Now</h2>
        <p style="max-width:420px;margin:10px auto 20px;color:#ccc">
          Welcome to Sandman Combat. Your answers are saved — your journey is underway.
        </p>
        <button class="quiz-cta" id="go-tools">Enter Athlete Tools →</button>
      </div>
    `;

    document.getElementById("go-tools").onclick = () => {
      location.href = "./index.html";
    };

    return;
  }
}

/* ------------------------------------------------------------
   NEXT HANDLER
------------------------------------------------------------ */

document.addEventListener("click", async (ev) => {
  if (!ev.target.dataset.next) return;

  // HEROES section capture
  if (screens[idx].type === "heroes") {
    answers["heroes"] = {
      hero1: document.getElementById("hero1").value.trim(),
      hero2: document.getElementById("hero2").value.trim()
    };
  }

  idx++;

  // if final and we just passed heroes → save
  if (idx === screens.length - 1) {
    await saveQuizResults();
  }

  renderScreen();
});

/* ------------------------------------------------------------
   SAVE RESULTS TO FIRESTORE
------------------------------------------------------------ */

async function saveQuizResults() {
  if (!athleteId) return;

  const ref = doc(db, "quizResults", athleteId);
  await setDoc(ref, {
    athleteId,
    mode,
    answers,
    miniProfile: mini,
    ts: serverTimestamp()
  }, { merge:true });
}

/* ------------------------------------------------------------
   INITIAL MOUNT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  renderScreen();
});
