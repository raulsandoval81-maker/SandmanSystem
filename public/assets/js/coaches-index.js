import { db } from './firebase-init.js';

/* ---------- Division → Rank/Color mapping (LOCKED) ---------- */

const MAP = {
  youth: {
    colorByRank: {
      Shadow: "White",
      Recruit: "Gray",
      Combatant: "Yellow",
      Competitor: "Orange",
      Warrior: "Blue",
      Champion: "Purple",
      Commander: "Brown",
      Legend: "Black",
    },
    order: ["Shadow","Recruit","Combatant","Competitor","Warrior","Champion","Commander","Legend"],
    label: "Youth (0–8)",
  },
  adult: {
    colorByRank: {
      Apprentice: "White",
      Recruit: "Gray",
      Warrior: "Blue",
      Champion: "Purple",
      Commander: "Brown",
      Legend: "Black",
    },
    order: ["Apprentice","Recruit","Warrior","Champion","Commander","Legend"],
    label: "Older (0–4)",
  },
};

// expose for reuse on other pages if needed
window.RANK_COLOR_MAP = MAP;

/* ---------- DOM refs (ID names must match intake.html) ---------- */

const $ = (id) => document.getElementById(id);

// Athlete info
const firstName      = $("firstName");
const lastName       = $("lastName");
const dob            = $("dob");
const sex            = $("sex");

// Program / starting rank
const division       = $("division");          // 'youth' | 'adult'
const rankSelect     = $("rank");              // populated via MAP
const colorSelect    = $("color");             // auto-synced to rank
const startLevel     = $("startLevel");        // numeric 0–8 or 0–4
const classDays      = $("classDays");
const startDate      = $("startDate");

// Parent / home
const parentName     = $("parentName");
const parentEmail    = $("parentEmail");
const parentPhone    = $("parentPhone");
const homeAddress    = $("homeAddress");

// Emergency + medical + note
const emgName        = $("emgName");
const emgRelation    = $("emgRelation");
const emgPhone       = $("emgPhone");
const medical        = $("medical");
const coachNote      = $("coachNote");

// Buttons / status
const createBtn      = $("createAthleteBtn");
const clearBtn       = $("clearBtn");
const backBtn        = $("backBtn");          // optional
const statusEl       = $("status");

/* ---------- Helpers ---------- */

function fillRanksForDivision(div) {
  const cfg = MAP[div];
  rankSelect.innerHTML = "";
  colorSelect.innerHTML = "";

  cfg.order.forEach(rankName => {
    const opt = document.createElement("option");
    opt.value = rankName;
    opt.textContent = rankName;
    rankSelect.appendChild(opt);
  });

  // initial color sync
  syncColorToRank();
}

function syncColorToRank() {
  const div = division.value;
  const cfg = MAP[div];
  const rankName = rankSelect.value;
  const colorName = cfg.colorByRank[rankName];

  colorSelect.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = colorName;
  opt.textContent = colorName;
  colorSelect.appendChild(opt);
}

function required(el, label) {
  if (!el || !el.value || !String(el.value).trim()) {
    throw new Error(`Missing: ${label}`);
  }
  return String(el.value).trim();
}

function setStatus(msg, kind="ok") {
  statusEl.textContent = msg;
  statusEl.className = kind === "err" ? "text-red" : "text-ok";
}

/* ---------- Wire up dynamic selects ---------- */

division.addEventListener("change", () => {
  fillRanksForDivision(division.value);
});

rankSelect.addEventListener("change", syncColorToRank);

/* ---------- Clear form ---------- */

clearBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  document.querySelector("form")?.reset();
  fillRanksForDivision(division.value || "youth");
  setStatus("Cleared.", "ok");
});

/* ---------- Submit/create athlete ---------- */

createBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  setStatus("Saving…");

  try {
    const fName = required(firstName, "first name");
    const lName = required(lastName, "last name");
    const div   = required(division, "division");
    const rank  = required(rankSelect, "rank");
    const color = required(colorSelect, "color");

    // Optional fields – normalize
    const payloadAthlete = {
      firstName: fName,
      lastName : lName,
      fullName : `${fName} ${lName}`.trim(),
      division : div,                   // 'youth' | 'adult'
      rankName : rank,
      colorName: color,
      startLevel: Number(startLevel?.value ?? 0),
      dob      : dob?.value || "",
      sex      : sex?.value || "",
      classDays: classDays?.value || "",
      startDate: startDate?.value || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      xpTotal  : 0,
      logsCount: 0,
    };

    // Create athlete doc first to get ID
    const athletesRef = collection(db, "athletes");
    const newDocRef = await addDoc(athletesRef, payloadAthlete);
    const athleteId = newDocRef.id;

    // Profile / contacts in parallel
    const profileRef = doc(db, "profiles", athleteId);
    const profilePayload = {
      parentName : parentName?.value || "",
      email      : parentEmail?.value || "",
      phone      : parentPhone?.value || "",
      address    : homeAddress?.value || "",
      emgName    : emgName?.value || "",
      emgRelation: emgRelation?.value || "",
      emgPhone   : emgPhone?.value || "",
      medical    : medical?.value || "",
      coachNote  : coachNote?.value || "",
      athleteId,
      updatedAt  : serverTimestamp(),
    };
    await setDoc(profileRef, profilePayload);

    setStatus(`Created: ${payloadAthlete.fullName} (${div} · ${rank} / ${color})`);
    // Optional redirect to profile page:
    // window.location.href = `./athlete.html?id=${athleteId}`;
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error creating athlete.", "err");
  }
});

/* ---------- Init on load ---------- */

document.addEventListener("DOMContentLoaded", () => {
  fillRanksForDivision(division?.value || "youth");
  setStatus("Ready.");
  console.log("[Coach Intake] loaded");
});
