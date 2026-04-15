console.log("Honor lane loaded");

import { db, doc, getDoc } from "/assets/js/firebase-init-para.js";

const params = new URLSearchParams(window.location.search);
const athleteId = (params.get("id") || "").trim().toUpperCase();

const selfBtn = document.getElementById("honor-self");
const teammatesBtn = document.getElementById("honor-teammates");
const teamBtn = document.getElementById("honor-team");

const isTeen = athleteId.startsWith("F4");
const isYouth = athleteId.startsWith("F8");

function lock(el) {
  if (!el) return;
  el.removeAttribute("href");
  el.classList.add("locked");
  el.setAttribute("aria-disabled", "true");
}

function unlock(el, url) {
  if (!el) return;
  el.classList.remove("locked");
  el.removeAttribute("aria-disabled");
  el.href = url;
}

async function loadHonor() {
  if (!athleteId) {
    console.warn("Missing athlete id");
    lock(selfBtn);
    lock(teammatesBtn);
    lock(teamBtn);
    return;
  }

  try {
    const ref = doc(db, "athletes", athleteId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn("Athlete not found");
      lock(selfBtn);
      lock(teammatesBtn);
      lock(teamBtn);
      return;
    }

    const data = snap.data() || {};

    // Youth = one shared XP bar
    // Teens = separate Honor XP bar
    const xp = Number(
      isTeen
        ? (data.honorXp ?? data.honor?.xp ?? 0)
        : (data.xp ?? 0)
    );

    console.log("Honor XP check:", xp, "| teen:", isTeen, "| youth:", isYouth);

    // Self always open if athlete reached Honor lane
    unlock(
      selfBtn,
      `/athletes/arsenal/honor/self.html?id=${encodeURIComponent(athleteId)}`
    );

    // 400 XP unlock
    if (xp >= 400) {
      unlock(
        teammatesBtn,
        `/athletes/arsenal/honor/teammates.html?id=${encodeURIComponent(athleteId)}`
      );
    } else {
      lock(teammatesBtn);
    }

    // 800 XP unlock
    if (xp >= 800) {
      unlock(
        teamBtn,
        `/athletes/arsenal/honor/team.html?id=${encodeURIComponent(athleteId)}`
      );
    } else {
      lock(teamBtn);
    }

  } catch (err) {
    console.error("Honor load error:", err);

    // keep Self usable even if Firestore read fails
    unlock(
      selfBtn,
      `/athletes/arsenal/honor/self.html?id=${encodeURIComponent(athleteId)}`
    );
    lock(teammatesBtn);
    lock(teamBtn);
  }
}

loadHonor();