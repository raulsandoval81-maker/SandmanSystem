// public/athletes/lanes/lane-gate.js

import { getAthleteProfile, resolveAthleteId, isFoundry8Id } from "/assets/js/athlete-profile.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const athleteId = resolveAthleteId();
    const athlete = await getAthleteProfile({ silent: true });
    if (!athlete) return;

    const stripe = Number(athlete.stripeCount || 0);

    const strengthLane = document.getElementById("lane-strength");
    const honorLane = document.getElementById("lane-honor");

    // Foundry 8: NO Strength/Honor lanes at all (youth uses feeders into Combat XP)
    if (isFoundry8Id(athleteId)) {
      strengthLane?.classList.add("hidden");
      honorLane?.classList.add("hidden");
      return;
    }

    // Strength unlocks at Stripe 2
    if (stripe >= 2) {
      strengthLane?.classList.remove("lane-locked");
      strengthLane?.classList.add("lane-open");
    } else {
      strengthLane?.classList.add("lane-locked");
      strengthLane?.classList.remove("lane-open");
    }

    // Honor unlocks at Stripe 3
    if (stripe >= 3) {
      honorLane?.classList.remove("lane-locked");
      honorLane?.classList.add("lane-open");
    } else {
      honorLane?.classList.add("lane-locked");
      honorLane?.classList.remove("lane-open");
    }

  } catch (err) {
    console.error("Lane gate error:", err);
  }
});