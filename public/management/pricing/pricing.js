import {
  calculateSandmanMembershipPricing
} from "/assets/js/pricing/sandman-pricing-engine.js";

const athleteList =
  document.getElementById("athleteList");

const athleteTemplate =
  document.getElementById("athleteTemplate");

const addAthleteBtn =
  document.getElementById("addAthleteBtn");

const resetBtn =
  document.getElementById("resetBtn");

const printBtn =
  document.getElementById("printBtn");

const combatMembershipRow =
  document.getElementById(
    "combatMembershipRow"
  );

const individualValue =
  document.getElementById("individualValue");

const siblingMembershipRows =
  document.getElementById(
    "siblingMembershipRows"
  );

const fitnessMembershipRow =
  document.getElementById(
    "fitnessMembershipRow"
  );

const fitnessMembership =
  document.getElementById(
    "fitnessMembership"
  );

const monthlyMembership =
  document.getElementById("monthlyMembership");

const annualMembershipTotal =
  document.getElementById(
    "annualMembershipTotal"
  );

const monthlySavings =
  document.getElementById("monthlySavings");

const annualSavings =
  document.getElementById("annualSavings");


function money(value) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }
  ).format(
    Math.max(
      0,
      Number(value || 0)
    )
  );
}


function readAthletes() {
  return [
    ...athleteList.querySelectorAll(
      ".pricing-athlete"
    )
  ].map(
    (card, index) => {
      const primaryDiscipline =
        card.querySelector(
          ".discipline-primary"
        )?.value || "";

      const secondaryDiscipline =
        card.querySelector(
          ".discipline-secondary"
        )?.value || "";

      const disciplines = [
        primaryDiscipline,
        secondaryDiscipline
      ].filter(
        (value, index, values) =>
          value &&
          values.indexOf(value) === index
      );

      return {
        index: index + 1,

        name:
          card.querySelector(
            ".athlete-name"
          )?.value.trim() ||
          `Member ${index + 1}`,

        journey:
          card.querySelector(
            ".journey"
          )?.value ||
          "zero2hero",

        plan:
          card.querySelector(
            ".athlete-plan"
          ).value,

        billingTerm:
          card.querySelector(
            ".billing-term"
          ).value,

        trainingAccess:
          card.querySelector(
            ".training-access"
          )?.value ||
          "2-3",

        annualMembership:
          card.querySelector(
            ".annual-membership"
          )?.value ||
          "sandman",

        parentChildPromo:
          card.querySelector(
            ".parent-child-promo"
          )?.value === "yes",

        disciplines
      };
    }
  );
}


function renderPricing() {
  const athletes =
    readAthletes();

  const pricing =
    calculateSandmanMembershipPricing(
      athletes
    );

  const combatAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "standard" ||
        athlete.plan === "mma" ||
        athlete.plan === "combo"
    );

  const projectedSavingsAnnual =
    Number(
      pricing.projectedSavingsAnnual ||
      0
    );

  /*
   * Build the Combat presentation incrementally.
   *
   * Athlete 1 shows the base Combat membership.
   * Additional Combat athletes show only what they
   * add to the household price according to the
   * shared pricing engine.
   */
  let combatMembershipAmount = 0;
  let previousCombatTotal = 0;

  siblingMembershipRows.innerHTML = "";

  combatAthletes.forEach(
    (athlete, index) => {
      const prefix =
        combatAthletes.slice(
          0,
          index + 1
        );

      const prefixPricing =
        calculateSandmanMembershipPricing(
          prefix
        );

      const prefixTotal =
        Number(
          prefixPricing.monthlyMembership ||
          0
        );

      if (index === 0) {
        combatMembershipAmount =
          prefixTotal;

        previousCombatTotal =
          prefixTotal;

        return;
      }

      const siblingAmount =
        Math.max(
          0,
          prefixTotal -
            previousCombatTotal
        );

      const row =
        document.createElement("div");

      row.className =
        "pricing-summary-row";

      row.innerHTML = `
        <dt>
          Sibling Athlete ${index + 1}
        </dt>

        <dd>
          +${money(siblingAmount)}
        </dd>
      `;

      siblingMembershipRows.appendChild(
        row
      );

      previousCombatTotal =
        prefixTotal;
    }
  );

  /*
   * Fitness is the actual additional monthly
   * household amount after Combat pricing.
   * This keeps household caps/promotions inside
   * the shared pricing engine instead of
   * re-creating that math here.
   */
  const combatOnlyPricing =
    calculateSandmanMembershipPricing(
      combatAthletes
    );

  const combatHouseholdTotal =
    Number(
      combatOnlyPricing.monthlyMembership ||
      0
    );

  const fitnessMonthlyAmount =
    Math.max(
      0,
      Number(
        pricing.monthlyMembership ||
        0
      ) - combatHouseholdTotal
    );

  let annualMembershipAmount = 0;

  athletes.forEach(
    (athlete) => {
      annualMembershipAmount +=
        athlete.annualMembership ===
        "current-aau"
          ? 5
          : 35;
    }
  );

  const projectedSavingsMonthly =
    projectedSavingsAnnual / 12;

  if (combatAthletes.length) {
    combatMembershipRow.hidden = false;

    individualValue.textContent =
      money(combatMembershipAmount);
  } else {
    combatMembershipRow.hidden = true;

    individualValue.textContent =
      money(0);
  }

  if (fitnessMonthlyAmount > 0) {
    fitnessMembership.textContent =
      money(fitnessMonthlyAmount);

    fitnessMembershipRow.hidden =
      false;
  } else {
    fitnessMembership.textContent =
      money(0);

    fitnessMembershipRow.hidden =
      true;
  }

  monthlyMembership.textContent =
    money(
      pricing.monthlyMembership
    );

  annualMembershipTotal.textContent =
    money(
      annualMembershipAmount
    );

  monthlySavings.textContent =
    `${money(
      projectedSavingsMonthly
    )}/month`;

  annualSavings.textContent =
    `${money(
      projectedSavingsAnnual
    )}/year`;
}


function refreshAthleteTitles() {
  const cards = [
    ...athleteList.querySelectorAll(
      ".pricing-athlete"
    )
  ];

  cards.forEach(
    (card, index) => {
      const title =
        card.querySelector(
          ".athlete-title"
        );

      if (title) {
        title.textContent =
          `Member ${index + 1}`;
      }

      const removeButton =
        card.querySelector(
          ".remove-athlete"
        );

      if (removeButton) {
        removeButton.hidden =
          cards.length === 1;
      }
    }
  );
}


function addAthlete(defaults = {}) {
  const fragment =
    athleteTemplate.content.cloneNode(
      true
    );

  const card =
    fragment.querySelector(
      ".pricing-athlete"
    );

  athleteList.appendChild(fragment);

  const cards = [
    ...athleteList.querySelectorAll(
      ".pricing-athlete"
    )
  ];

  const newCard =
    cards[cards.length - 1];

  const name =
    newCard.querySelector(
      ".athlete-name"
    );

  const journey =
    newCard.querySelector(
      ".journey"
    );

  const plan =
    newCard.querySelector(
      ".athlete-plan"
    );

  const billingTerm =
    newCard.querySelector(
      ".billing-term"
    );

  if (name) {
    name.value =
      defaults.name || "";
  }

  if (journey) {
    journey.value =
      defaults.journey ||
      "zero2hero";
  }

  plan.value =
    defaults.plan ||
    "standard";

  billingTerm.value =
    defaults.billingTerm ||
    "month-to-month";

  const trainingAccess =
    newCard.querySelector(
      ".training-access"
    );

  const annualMembership =
    newCard.querySelector(
      ".annual-membership"
    );

  const parentChildPromo =
    newCard.querySelector(
      ".parent-child-promo"
    );

  function syncPlanControls() {
    const currentPlan =
      plan.value;

    if (currentPlan === "fitness") {
      trainingAccess.innerHTML = `
        <option value="2">2 days/week — $60</option>
        <option value="3">3 days/week — $80</option>
      `;

      annualMembership.disabled = true;
      parentChildPromo.disabled = false;
      return;
    }

    if (currentPlan === "mma") {
      trainingAccess.innerHTML = `
        <option value="mma">MMA access — $140</option>
      `;

      annualMembership.disabled = false;
      parentChildPromo.value = "no";
      parentChildPromo.disabled = true;
      return;
    }

    trainingAccess.innerHTML = `
      <option value="2-3">2–3 days/week</option>
      <option value="4-6">4–6 days/week</option>
    `;

    annualMembership.disabled = false;
    parentChildPromo.value = "no";
    parentChildPromo.disabled = true;
  }

  syncPlanControls();

  const disciplines =
    Array.isArray(
      defaults.disciplines
    )
      ? defaults.disciplines.slice(
          0,
          2
        )
      : ["wrestling"];

  const primaryDiscipline =
    newCard.querySelector(
      ".discipline-primary"
    );

  const secondaryDiscipline =
    newCard.querySelector(
      ".discipline-secondary"
    );

  primaryDiscipline.value =
    disciplines[0] ||
    "wrestling";

  secondaryDiscipline.value =
    disciplines[1] ||
    "";

  newCard.querySelector(
    ".remove-athlete"
  )?.addEventListener(
    "click",
    () => {
      if (
        athleteList.querySelectorAll(
          ".pricing-athlete"
        ).length === 1
      ) {
        return;
      }

      newCard.remove();

      refreshAthleteTitles();
      renderPricing();
    }
  );

  newCard.querySelectorAll(
    "input, select"
  ).forEach(
    (control) => {
      control.addEventListener(
        "input",
        renderPricing
      );

      control.addEventListener(
        "change",
        () => {
          const primary =
            newCard.querySelector(
              ".discipline-primary"
            );

          const secondary =
            newCard.querySelector(
              ".discipline-secondary"
            );

          if (
            primary &&
            secondary &&
            secondary.value &&
            primary.value ===
              secondary.value
          ) {
            secondary.value = "";
          }

          if (
            control.classList.contains(
              "athlete-plan"
            )
          ) {
            syncPlanControls();
          }

          renderPricing();
        }
      );
    }
  );

  refreshAthleteTitles();
  renderPricing();
}


function resetEstimate() {
  athleteList.innerHTML = "";

  addAthlete({
    disciplines: [
      "wrestling"
    ]
  });
}


addAthleteBtn?.addEventListener(
  "click",
  () => {
    addAthlete({
      disciplines: [
        "wrestling"
      ]
    });
  }
);

resetBtn?.addEventListener(
  "click",
  resetEstimate
);

printBtn?.addEventListener(
  "click",
  () => {
    window.print();
  }
);


addAthlete({
  disciplines: [
    "wrestling"
  ]
});
