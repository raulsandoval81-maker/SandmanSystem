import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init-para.js";

function normalizeDiscipline(value = "") {
  const discipline = String(value)
    .trim()
    .toLowerCase();

  if (
    discipline === "box" ||
    discipline === "boxing"
  ) {
    return "boxing";
  }

  if (
    discipline === "wrestle" ||
    discipline === "wrestling"
  ) {
    return "wrestling";
  }

  if (
    discipline === "kickbox" ||
    discipline === "kickboxing" ||
    discipline === "muay thai" ||
    discipline === "muay-thai" ||
    discipline === "muaythai"
  ) {
    return "kickboxing";
  }

  if (
    discipline === "mixed martial arts" ||
    discipline === "mma"
  ) {
    return "mma";
  }

  return discipline || "wrestling";
}

function normalizeTier(value = "") {
  const tier = String(value)
    .trim()
    .toUpperCase();

  if (/^T[0-7]$/.test(tier)) {
    return tier;
  }

  const rankMap = {
    apprentice: "T0",
    shadow: "T0",
    recruit: "T1",
    warrior: "T1",
    combatant: "T2",
    champion: "T2",
    competitor: "T3",
    veteran: "T3",
    commander: "T4",
    legend: "T4",
    hero: "T7",
    master: "T3"
  };

  return rankMap[tier.toLowerCase()] || "";
}

function getDisciplineProgress(
  athlete,
  discipline
) {
  return (
    athlete.disciplines?.[discipline] ||
    athlete.combat?.[discipline] ||
    athlete.progression?.[discipline] ||
    athlete.disciplineProgress?.[discipline] ||
    null
  );
}

function getTierFromProgress(progress = {}) {
  return normalizeTier(
    progress.tier ||
    progress.currentTier ||
    progress.tierCode ||
    progress.rank ||
    progress.currentRank ||
    ""
  );
}

export async function lockTierView(
  athleteId,
  requestedDiscipline = ""
) {
  if (!athleteId) {
    throw new Error("Missing athlete id");
  }

  try {
    const ref = doc(
      db,
      "athletes",
      athleteId
    );

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.error(
        "Athlete not found:",
        athleteId
      );

      return;
    }

    const athlete = snap.data() || {};

    const urlDiscipline =
      new URLSearchParams(
        window.location.search
      ).get("discipline") || "";

    const explicitDiscipline =
      requestedDiscipline ||
      urlDiscipline;

    const discipline =
      normalizeDiscipline(
        explicitDiscipline ||
        athlete.activeDiscipline ||
        athlete.primaryDiscipline ||
        athlete.discipline ||
        athlete.art ||
        athlete.sport ||
        "wrestling"
      );

    const disciplineProgress =
      getDisciplineProgress(
        athlete,
        discipline
      );

    /*
      Critical safeguard:

      When a discipline was explicitly requested,
      do not inherit another discipline's root tier.

      Example:
      Wrestling T1 must not make Boxing T1.
      A missing Boxing progression begins at T0.
    */
    let currentTier = disciplineProgress
      ? getTierFromProgress(
          disciplineProgress
        )
      : "";

    if (!currentTier) {
      currentTier = explicitDiscipline
        ? "T0"
        : normalizeTier(
            athlete.curriculumTier ||
            athlete.tier ||
            athlete.currentTier ||
            athlete.rank ||
            ""
          );
    }

    if (!currentTier) {
      currentTier = "T0";
    }

    const isYouth =
      athleteId.startsWith("F8_");

    const tierOrder = isYouth
      ? [
          "T0",
          "T1",
          "T2",
          "T3",
          "T4",
          "T5",
          "T6",
          "T7"
        ]
      : [
          "T0",
          "T1",
          "T2",
          "T3",
          "T4"
        ];

    const currentIndex =
      tierOrder.indexOf(currentTier);

    if (currentIndex === -1) {
      console.error(
        "Unknown resolved tier:",
        {
          athleteId,
          discipline,
          currentTier
        }
      );

      return;
    }

    const cards =
      document.querySelectorAll(
        ".tier-card"
      );

    cards.forEach((card) => {
      const cardTier =
        normalizeTier(
          card.dataset.tier
        );

      if (!cardTier) {
        return;
      }

      const cardIndex =
        tierOrder.indexOf(cardTier);

      const links =
        card.querySelectorAll(
          "a[href]"
        );

      card.classList.remove(
        "locked",
        "current"
      );

      card.removeAttribute(
        "aria-disabled"
      );

      /*
        Current doctrine:
        only the athlete's current tier is active.
      */
      if (cardIndex === currentIndex) {
        card.classList.add(
          "current"
        );

        links.forEach((link) => {
          const href =
            link.getAttribute("href");

          if (!href) {
            return;
          }

          const url = new URL(
            href,
            window.location.origin
          );

          url.searchParams.set(
            "id",
            athleteId
          );

          url.searchParams.set(
            "discipline",
            discipline
          );

          link.setAttribute(
            "href",
            url.pathname +
              url.search +
              url.hash
          );
        });

        return;
      }

      card.classList.add(
        "locked"
      );

      card.setAttribute(
        "aria-disabled",
        "true"
      );
    });
console.log(
  "Combat tier lock resolved:",
  JSON.stringify(
    {
      athleteId,
      discipline,
      currentTier,
      disciplineProgress,
      curriculumTier: athlete.curriculumTier || null,
      progressionTier: athlete.progressionTier || null,
      rootTier: athlete.tier || null
    },
    null,
    2
  )
);

  } catch (err) {
    console.error(
      "Tier lock error:",
      err
    );
  }
}
