// public/athletes/lanes/lane-gate.js

import { getAthleteProfile, resolveAthleteId, isFoundry8Id } from "/assets/js/athlete-profile.js";
import { resolveF8RemoteAccess } from "/assets/js/f8-strength-honor-access.js";

function tierNumber(athlete = {}) {
  const raw = athlete.tier ?? athlete.tierCode ?? athlete.currentTier ?? "T0";
  const match = String(raw).toUpperCase().match(/T(\d+)/);
  return match ? Number(match[1]) : Number(raw) || 0;
}

function unlockLane(el) {
  if (!el) return;
  el.classList.remove("lane-locked", "hidden");
  el.classList.add("lane-open");
}

function lockLane(el) {
  if (!el) return;
  el.classList.remove("lane-open", "hidden");
  el.classList.add("lane-locked");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const athleteId = resolveAthleteId();
    const athlete = await getAthleteProfile({ silent: true });
    if (!athlete) return;

    const stripe = Number(athlete.stripeCount || 0);
    const tier = tierNumber(athlete);

    const strengthLane = document.getElementById("lane-strength");
    const honorLane = document.getElementById("lane-honor");

    const isF8 = isFoundry8Id(athleteId);

    const f8RemoteAccess = isF8 ? resolveF8RemoteAccess(athlete) : null;
    const strengthOpen = isF8
      ? f8RemoteAccess.strength
      : athlete?.unlocks?.strength === true || stripe >= 1;
    const honorOpen = isF8
      ? f8RemoteAccess.honor
      : athlete?.unlocks?.honor === true || stripe >= 2;


    strengthOpen ? unlockLane(strengthLane) : lockLane(strengthLane);
    honorOpen ? unlockLane(honorLane) : lockLane(honorLane);

  } catch (err) {
    console.error("Lane gate error:", err);
  }
});
