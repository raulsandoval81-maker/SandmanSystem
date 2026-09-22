import {
  calculateSandmanMembershipPricing
} from "/assets/js/pricing/sandman-pricing-engine.js";

import {
  SANDMAN_PRICING_CATALOG
} from "/assets/js/pricing/sandman-pricing-catalog.js";

import {
  calculateManagementEstimate
} from "./pricing-estimate-model.js";

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

const monthlySponsorRow =
  document.getElementById("monthlySponsorRow");

const monthlySponsorAmount =
  document.getElementById("monthlySponsorAmount");

const annualMembershipTotal =
  document.getElementById(
    "annualMembershipTotal"
  );

const monthlySavings =
  document.getElementById("monthlySavings");

const annualSavings =
  document.getElementById("annualSavings");

const enrollmentStartDate =
  document.getElementById(
    "enrollmentStartDate"
  );

const enrollmentSupport =
  document.getElementById("enrollmentSupport");

const monthlySponsor =
  document.getElementById("monthlySponsor");

const admissionsCreditsRow =
  document.getElementById("admissionsCreditsRow");

const admissionsCreditsAmount =
  document.getElementById("admissionsCreditsAmount");

const enrollmentSupportRow =
  document.getElementById("enrollmentSupportRow");

const enrollmentSupportAmount =
  document.getElementById("enrollmentSupportAmount");

const promotionCode =
  document.getElementById(
    "promotionCode"
  );

const applyPromotionBtn =
  document.getElementById(
    "applyPromotionBtn"
  );

const promotionStatus =
  document.getElementById(
    "promotionStatus"
  );

const prorationLabel =
  document.getElementById(
    "prorationLabel"
  );

const proratedMembership =
  document.getElementById(
    "proratedMembership"
  );

const promotionDiscountRow =
  document.getElementById(
    "promotionDiscountRow"
  );

const promotionDiscountLabel =
  document.getElementById(
    "promotionDiscountLabel"
  );

const promotionDiscount =
  document.getElementById(
    "promotionDiscount"
  );

const dueAtEnrollment =
  document.getElementById(
    "dueAtEnrollment"
  );

const nextMonthlyPayment =
  document.getElementById(
    "nextMonthlyPayment"
  );

/*
 * Approved one-time promotion codes.
 *
 * Add live promotions here only when Management
 * has intentionally approved them.
 *
 * Example:
 *
 * WELCOME25: {
 *   amount: 25,
 *   label: "Welcome Promotion"
 * }
 */
const PROMOTION_CODES =
  Object.freeze({
    TEST25: {
      amount: 25,
      label: "Test Promotion"
    }
  });

let appliedPromotion = null;


function money(value) {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
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

      const plan = card.querySelector(".athlete-plan").value;

      return {
        index: index + 1,

        name:
          card.querySelector(
            ".athlete-name"
          )?.value.trim() ||
          `Member ${index + 1}`,

        memberType:
          card.querySelector(
            ".member-type"
          )?.value ||
          "youth",

        journey:
          card.querySelector(
            ".journey"
          )?.value ||
          "zero2hero",

        plan,

        billingTerm:
          card.querySelector(
            ".billing-term"
          ).value,

        trainingAccess:
          card.querySelector(
            ".training-access"
          )?.value ||
          "core-2",

        credit: Number(
          card.querySelector(".admissions-credit")?.value || 0
        ),

        disciplines: plan === "fitness" ? [] : disciplines
      };
    }
  );
}


function renderPricing() {
  const athletes =
    readAthletes();

  const estimate = calculateManagementEstimate(athletes, {
    startDate: enrollmentStartDate?.value,
    enrollmentSupportPercent: enrollmentSupport?.value,
    monthlySponsorPercent: monthlySponsor?.value,
    promotionAmount: appliedPromotion?.amount || 0,
  });
  const pricing = estimate.pricing;

  const combatAthletes =
    athletes.filter(
      (athlete) =>
        athlete.plan === "standard"
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
    money(estimate.monthlyMembership);

  monthlySponsorRow.hidden = estimate.monthlySponsor === 0;
  monthlySponsorAmount.textContent = `-${money(estimate.monthlySponsor)}`;

  annualMembershipTotal.textContent =
    money(estimate.annualEnrollment);

  admissionsCreditsRow.hidden = estimate.admissionsCredits === 0;
  admissionsCreditsAmount.textContent = `-${money(estimate.admissionsCredits)}`;
  enrollmentSupportRow.hidden = estimate.enrollmentSupport === 0;
  enrollmentSupportAmount.textContent = `-${money(estimate.enrollmentSupport)}`;

  prorationLabel.textContent =
    `First month — ${Math.round(estimate.prorationRate * 100)}%`;

  proratedMembership.textContent =
    money(estimate.proratedFirstMonth);

  nextMonthlyPayment.textContent =
    money(estimate.nextMonthlyPayment);

  dueAtEnrollment.textContent =
    money(estimate.dueAtEnrollment);

  if (
    appliedPromotion &&
    estimate.promotion > 0
  ) {
    promotionDiscountRow.hidden =
      false;

    promotionDiscountLabel.textContent =
      `Promotion: ${appliedPromotion.code}`;

    promotionDiscount.textContent =
      `-${money(estimate.promotion)}`;
  } else {
    promotionDiscountRow.hidden =
      true;

    promotionDiscount.textContent =
      "-$0";
  }

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

  const memberType =
    newCard.querySelector(
      ".member-type"
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

  const creditField =
    newCard.querySelector(".admissions-credit");

  function syncDisciplineControls() {
    const secondary = newCard.querySelector(".discipline-secondary");
    const secondField = secondary?.closest(".pricing-field");
    const supportsTwo = ["classes-4", "dual-full"].includes(trainingAccess.value);
    if (secondField) secondField.hidden = plan.value === "fitness" || !supportsTwo;
    if (!supportsTwo && secondary) secondary.value = "";
  }

  function syncPlanControls() {
    const currentPlan =
      plan.value;

    const journeyField =
      newCard.querySelector(
        ".journey-field"
      );

    const combatFields =
      newCard.querySelector(
        ".combat-fields"
      );

    const isFitnessOnly =
      currentPlan === "fitness";

    if (journeyField) {
      journeyField.hidden =
        isFitnessOnly;
    }

    if (combatFields) {
      combatFields.hidden =
        isFitnessOnly;
    }

    billingTerm.closest(".pricing-field").hidden = isFitnessOnly;
    if (isFitnessOnly) billingTerm.value = "month-to-month";
    creditField.closest(".pricing-field-grid").hidden = isFitnessOnly;
    if (isFitnessOnly) creditField.value = "0";

    if (isFitnessOnly) {
      trainingAccess.innerHTML = `
        <option value="2">2 days/week — ${money(SANDMAN_PRICING_CATALOG.fitness.twoDays.monthly)}</option>
        <option value="3">3 days/week — ${money(SANDMAN_PRICING_CATALOG.fitness.threeDays.monthly)}</option>
      `;
      trainingAccess.value = defaults.trainingAccess === "3" ? "3" : "2";
      syncDisciplineControls();
      return;
    }

    trainingAccess.innerHTML = SANDMAN_PRICING_CATALOG.combat.accessOrder
      .map((key) => `<option value="${key}">${SANDMAN_PRICING_CATALOG.combat.accessLevels[key].label}</option>`)
      .join("");
    trainingAccess.value = SANDMAN_PRICING_CATALOG.combat.accessOrder.includes(defaults.trainingAccess)
      ? defaults.trainingAccess : "core-2";
    syncDisciplineControls();
  }

  memberType?.addEventListener(
    "change",
    () => {
      syncPlanControls();
      renderPricing();
    }
  );

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
  syncDisciplineControls();

  if (creditField) creditField.value = Number(defaults.credit) === 25 ? "25" : "0";

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

          if (control.classList.contains("training-access")) {
            syncDisciplineControls();
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
    plan: "standard",
    trainingAccess: "core-2",
    billingTerm: "month-to-month",
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

enrollmentStartDate?.addEventListener(
  "input",
  renderPricing
);

enrollmentStartDate?.addEventListener(
  "change",
  renderPricing
);

enrollmentSupport?.addEventListener("change", renderPricing);
monthlySponsor?.addEventListener("change", renderPricing);

applyPromotionBtn?.addEventListener(
  "click",
  () => {
    const code =
      String(
        promotionCode?.value ||
        ""
      )
        .trim()
        .toUpperCase();

    if (!code) {
      appliedPromotion = null;

      promotionStatus.textContent =
        "No promotion applied.";

      renderPricing();
      return;
    }

    const promotion =
      PROMOTION_CODES[code];

    if (!promotion) {
      appliedPromotion = null;

      promotionStatus.textContent =
        "Code not recognized or not active.";

      renderPricing();
      return;
    }

    appliedPromotion = {
      ...promotion,
      code
    };

    promotionStatus.textContent =
      `${code} applied once.`;

    renderPricing();
  }
);

resetBtn?.addEventListener(
  "click",
  () => {
    appliedPromotion = null;

    if (promotionCode) {
      promotionCode.value = "";
    }

    if (promotionStatus) {
      promotionStatus.textContent =
        "No promotion applied.";
    }

    if (enrollmentStartDate) {
      enrollmentStartDate.value = "";
    }
    if (enrollmentSupport) enrollmentSupport.value = "0";
    if (monthlySponsor) monthlySponsor.value = "0";

    resetEstimate();
  }
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
