import { db, doc, getDoc } from "/assets/js/firebase-init-para.js";

export async function lockTierView(athleteId) {
  if (!athleteId) {
    throw new Error("Missing athlete id");
  }

  try {
    const ref = doc(db, "athletes", athleteId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.error("Athlete not found:", athleteId);
      return;
    }

    const athlete = snap.data();
    const currentTier = athlete.tier;

    const isTeen = athleteId.startsWith("F4_");
    const isYouth = athleteId.startsWith("F8_");

    let tierOrder = [];

    if (isTeen) {
      tierOrder = ["T0", "T1", "T2", "T3", "T4"];
    } else if (isYouth) {
      tierOrder = ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"];
    }

    if (!tierOrder.length) {
      console.error("Unknown athlete branch:", athleteId);
      return;
    }

    const currentIndex = tierOrder.indexOf(currentTier);

    if (currentIndex === -1) {
      console.error("Unknown tier for athlete:", currentTier, athleteId);
      return;
    }

    const cards = document.querySelectorAll(".tier-card");

    cards.forEach(card => {
      const cardTier = card.dataset.tier;
      if (!cardTier) return;

      const cardIndex = tierOrder.indexOf(cardTier);
      const links = card.querySelectorAll("a[href]");

      // reset first
      card.classList.remove("locked", "current");
      card.removeAttribute("aria-disabled");

      // only current tier is active
      if (cardIndex === currentIndex) {
        card.classList.add("current");

        links.forEach(link => {
          const href = link.getAttribute("href");
          if (!href) return;

          const url = new URL(href, window.location.origin);
          url.searchParams.set("id", athleteId);
          link.setAttribute("href", url.pathname + url.search);
        });

        return;
      }

      // everything else stays visible but locked
      card.classList.add("locked");
      card.setAttribute("aria-disabled", "true");
    });
  } catch (err) {
    console.error("Tier lock error:", err);
  }
}