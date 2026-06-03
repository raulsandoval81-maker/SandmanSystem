import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  db
} from "/assets/js/firebase-init.js";

export async function runProgressionAudit() {

  const snapshot = await getDocs(
    collection(db, "athletes")
  );

  const cooldownIssues = [];
  const xpIssues = [];
  const stripeIssues = [];
  const tierIssues = [];

  snapshot.forEach(docSnap => {

    const a = docSnap.data();

    const name =
      a.fullName ||
      a.name ||
      "Unknown Athlete";

    /*
    --------------------------------
    COOLDOWN
    --------------------------------
    */

    if (
      a.tierStatus === "cooldown" &&
      !a?.testing?.cooldownUntil
    ) {

      cooldownIssues.push({
        name,
        message: "Cooldown missing cooldownUntil date."
      });

    }

    /*
    --------------------------------
    XP
    --------------------------------
    */

    const xp = Number(a.xp || 0);
    const xpCap = Number(a.xpCap || 0);

    if (xp > xpCap) {

      xpIssues.push({
        name,
        message: `XP exceeds cap (${xp}/${xpCap}).`
      });

    }

    /*
    --------------------------------
    STRIPES
    --------------------------------
    */

    const stripeCount = Number(a.stripeCount || 0);

    if (stripeCount > 4 || stripeCount < 0) {

      stripeIssues.push({
        name,
        message: `Invalid stripe count (${stripeCount}).`
      });

    }

    /*
    --------------------------------
    TIER
    --------------------------------
    */

    if (!a.rankName || !a.rankColor) {

      tierIssues.push({
        name,
        message: "Missing rank metadata."
      });

    }

  });

  return {
    cooldownIssues,
    xpIssues,
    stripeIssues,
    tierIssues
  };

}