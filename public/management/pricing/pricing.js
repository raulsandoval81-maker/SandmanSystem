import {
  calculateSandmanMembershipPricing
} from "/assets/js/pricing/sandman-pricing-engine.js";

import {
  SANDMAN_PRICING_CATALOG
} from "/assets/js/pricing/sandman-pricing-catalog.js";

import {
  calculateManagementEstimate
} from "./pricing-estimate-model.js?v=20261008-2";

import {
  db,
  functions,
  httpsCallable,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";
import { requireManagement } from "/management/shared/guards/management-guard.js";

const appointmentId = new URLSearchParams(window.location.search).get("appointmentId") || "";
const continueProposalBtn = document.getElementById("continueProposalBtn");
const pricingSourceStatus = document.getElementById("pricingSourceStatus");
let sourceAppointment = null;

function recommendationFromAppointment(appointment) {
  const program = String(appointment.programInterest || "");
  const discipline = ["wrestling", "boxing", "muay-thai"].find((value) =>
    program.endsWith(`-${value}`)
  ) || "wrestling";
  const journey = ["zero2hero", "path2legend"].find((value) =>
    program.startsWith(`${value}-`)
  ) || "zero2hero";
  return {
    name: appointment.participantName || appointment.athleteName || "",
    memberType: appointment.registrantRole === "adult-athlete" ? "adult" : "youth",
    journey: appointment.recommendedJourney || journey,
    plan: program === "fitness" ? "fitness" : "standard",
    disciplines: program === "fitness" ? [] : [appointment.recommendedDiscipline || discipline],
  };
}

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

const sendEstimateBtn =
  document.getElementById("sendEstimateBtn");

const customerEstimate =
  document.getElementById("customerEstimate");

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

const startAnnualThisMonthBtn =
  document.getElementById(
    "startAnnualThisMonthBtn"
  );

const priorPaymentAmount =
  document.getElementById("priorPaymentAmount");
const priorPaymentMethod =
  document.getElementById("priorPaymentMethod");
const priorPaymentFirstMonth =
  document.getElementById("priorPaymentFirstMonth");
const priorPaymentLastMonth =
  document.getElementById("priorPaymentLastMonth");
const priorPaymentEnrollmentIncluded =
  document.getElementById("priorPaymentEnrollmentIncluded");
const priorPaymentNote =
  document.getElementById("priorPaymentNote");

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

const priorEnrollmentPaidRow =
  document.getElementById("priorEnrollmentPaidRow");

const priorEnrollmentPaidAmount =
  document.getElementById("priorEnrollmentPaidAmount");

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
    enrollmentPreviouslyPaid:
      priorPaymentEnrollmentIncluded?.checked === true,
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

  if (priorEnrollmentPaidRow) {
    priorEnrollmentPaidRow.hidden =
      estimate.enrollmentPreviouslyPaid === 0;
  }
  if (priorEnrollmentPaidAmount) {
    priorEnrollmentPaidAmount.textContent =
      `-${money(estimate.enrollmentPreviouslyPaid)}`;
  }

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

  if (memberType) memberType.value = defaults.memberType || "youth";

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



const BILLING_ESTIMATE_OPTIONS = [
  {
    value: "month-to-month",
    label: "Month-to-month"
  },
  {
    value: "six-month",
    label: "6-month agreement + autopay"
  },
  {
    value: "annual",
    label: "12-month agreement + autopay"
  }
];

const JOURNEY_LABELS = {
  zero2hero: "Road2Champion",
  path2legend: "Path2Legend",
  quest2mastery: "Quest2Mastery"
};

const DISCIPLINE_LABELS = {
  wrestling: "Wrestling",
  boxing: "Boxing",
  "muay-thai": "Muay Thai"
};

function estimateEscape(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function estimateAccessLabel(athlete) {
  if (athlete.plan === "fitness") {
    return `${athlete.trainingAccess} days/week`;
  }

  return (
    SANDMAN_PRICING_CATALOG
      .combat
      .accessLevels[
        athlete.trainingAccess
      ]?.label ||
    athlete.trainingAccess ||
    "Combat"
  );
}

function estimateMemberDescription(athlete) {
  if (athlete.plan === "fitness") {
    return `Fitness Only · ${estimateAccessLabel(athlete)}`;
  }

  const journey =
    JOURNEY_LABELS[athlete.journey] ||
    athlete.journey ||
    "Combat";

  const disciplines =
    athlete.disciplines
      .map(
        (discipline) =>
          DISCIPLINE_LABELS[discipline] ||
          discipline
      )
      .join(" + ");

  return [
    journey,
    disciplines,
    estimateAccessLabel(athlete)
  ]
    .filter(Boolean)
    .join(" · ");
}

function calculateEstimateForBillingTerm(
  athletes,
  billingTerm
) {
  const scenarioAthletes =
    athletes.map(
      (athlete) => ({
        ...athlete,
        billingTerm:
          athlete.plan === "standard"
            ? billingTerm
            : athlete.billingTerm
      })
    );

  return calculateManagementEstimate(
    scenarioAthletes,
    {
      startDate:
        enrollmentStartDate?.value,

      enrollmentSupportPercent:
        enrollmentSupport?.value,

      monthlySponsorPercent:
        monthlySponsor?.value,

      promotionAmount:
        appliedPromotion?.amount || 0
    }
  );
}

function buildCustomerEstimate() {
  const athletes = readAthletes();

  const comparisons =
    BILLING_ESTIMATE_OPTIONS.map(
      (option) => ({
        ...option,
        estimate:
          calculateEstimateForBillingTerm(
            athletes,
            option.value
          )
      })
    );

  const monthToMonth =
    comparisons.find(
      (item) =>
        item.value === "month-to-month"
    );

  const sixMonth =
    comparisons.find(
      (item) =>
        item.value === "six-month"
    );

  const annual =
    comparisons.find(
      (item) =>
        item.value === "annual"
    );

  const annualEnrollment =
    comparisons[0]?.estimate
      ?.annualEnrollment || 0;

  const sixMonthSavings =
    Math.max(
      0,
      Number(
        monthToMonth?.estimate
          ?.monthlyMembership || 0
      ) -
      Number(
        sixMonth?.estimate
          ?.monthlyMembership || 0
      )
    );

  const annualMonthlySavings =
    Math.max(
      0,
      Number(
        monthToMonth?.estimate
          ?.monthlyMembership || 0
      ) -
      Number(
        annual?.estimate
          ?.monthlyMembership || 0
      )
    );

  const annualSavings =
    annualMonthlySavings * 12;

  const memberHtml =
    athletes
      .map(
        (athlete) => `
          <div class="customer-estimate-member">
            <strong>
              ${estimateEscape(athlete.name)}
            </strong>

            <span>
              ${estimateEscape(
                estimateMemberDescription(
                  athlete
                )
              )}
            </span>
          </div>
        `
      )
      .join("");

  const rowsHtml =
    comparisons
      .map(
        ({ label, estimate }) => `
          <tr>
            <th scope="row">
              ${estimateEscape(label)}
            </th>

            <td>
              ${money(
                estimate.monthlyMembership
              )}/month
            </td>
          </tr>
        `
      )
      .join("");


  const html = `
    <div class="customer-estimate-brand">
      Sandman Academy of Combat &amp; Fitness™
    </div>

    <h1>
      Membership Plan Proposal
    </h1>

    <div class="customer-estimate-members">
      ${memberHtml}
    </div>

    <section class="customer-estimate-pricing">
      <h2>
        Selected Plan Pricing
      </h2>

      <table class="customer-estimate-table">
        <thead>
          <tr>
            <th>
              Billing option
            </th>

            <th>
              Monthly
            </th>
          </tr>
        </thead>

        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="customer-estimate-enrollment">
        <span>
          Annual Enrollment
        </span>

        <strong>
          ${money(annualEnrollment)}
        </strong>
      </div>
    </section>

    <section class="customer-estimate-savings">
      <h2>
        Savings
      </h2>

      <p>
        <strong>6-month:</strong>
        Save ${money(sixMonthSavings)}/month
        compared with month-to-month.
      </p>

      <p>
        <strong>12-month:</strong>
        Save ${money(annualMonthlySavings)}/month
        compared with month-to-month.
      </p>

      <p>
        <strong>12-month annual savings:</strong>
        ${money(annualSavings)}
      </p>
    </section>


    <div class="customer-estimate-footer">
      <p>
        Membership plan proposal —
        not an enrollment agreement.
      </p>

      <p>
        AAU or other governing-body membership
        is purchased separately where required.
      </p>

      <p>
        <strong>Youth Empowered Note:</strong>
        Sandman Academy membership fees are separate
        from any Youth Empowered program, facility,
        or participation fees.
      </p>

      <p>
        <strong>Want more training later?</strong>
        When you’re ready for additional training time,
        talk with Coach or Management and we’ll review
        the next available option.
      </p>

      <div class="customer-estimate-confirmation">
        <h2>
          Proposal Confirmation
        </h2>

        <p>
          Please copy and return the section below
          with your preferred option.
        </p>

        <p>
          <strong>Preferred Plan:</strong>
          ______________________________________
        </p>

        <p>
          <strong>Initials:</strong>
          __________
          &nbsp;&nbsp;
          <strong>Date:</strong>
          __________
        </p>

        <p>
          Initials confirm your preferred membership
          plan only. This proposal is not a final
          enrollment agreement. Final enrollment is
          completed through the next Management step.
        </p>
      </div>
    </div>
  `;

  const memberText =
    athletes
      .map(
        (athlete) =>
          `${athlete.name}\n` +
          `${estimateMemberDescription(athlete)}`
      )
      .join("\n\n");

  const pricingText =
    comparisons
      .map(
        ({ label, estimate }) =>
          `${label}: ${money(
            estimate.monthlyMembership
          )}/month`
      )
      .join("\n");

  const firstName =
    String(athletes[0]?.name || "there")
      .trim()
      .split(/\s+/)[0];

  const text = [
    `Hey ${firstName},`,
    "",
    "We’re switching over to digital payments here at Sandman Academy, and with that we’ve updated the membership payment structure.",
    "",
    "Below is your Membership Plan Proposal with the available payment options for the plan you selected.",
    "",
    "Please review everything and send back the Proposal Confirmation section at the bottom with the option you’d like to move forward with.",
    "",
    "One additional note: your account is currently one month behind. As we move over to digital billing, we’ll also need to bring that balance current. Going forward, recurring membership payments will be processed on the 5th of each month.",
    "",
    "Once you send that back, I’ll handle the next step from there.",
    "",
    "Thanks,",
    "Coach Sandoval",
    "Sandman Academy of Combat & Fitness™",
    "",
    "------------------------------------------------------------",
    "",
    "Sandman Academy of Combat & Fitness™",
    "Membership Plan Proposal",
    "",
    memberText,
    "",
    "Selected Plan Pricing",
    pricingText,
    `Annual Enrollment: ${money(
      annualEnrollment
    )}`,
    "",
    "Savings",
    `6-month: Save ${money(
      sixMonthSavings
    )}/month compared with month-to-month.`,
    `12-month: Save ${money(
      annualMonthlySavings
    )}/month compared with month-to-month.`,
    `12-month annual savings: ${money(
      annualSavings
    )}`,
    "",
    "Membership plan proposal — not an enrollment agreement.",
    "AAU or other governing-body membership is purchased separately where required.",
    "Youth Empowered Note: Sandman Academy membership fees are separate from any Youth Empowered program, facility, or participation fees.",
    "Want more training later? When you’re ready for additional training time, talk with Coach or Management and we’ll review the next available option.",
    "",
    "Proposal Confirmation",
    "Please copy and return the section below with your preferred option.",
    "",
    "Preferred Plan: ______________________________________",
    "Initials: __________    Date: __________",
    "",
    "Initials confirm your preferred membership plan only. This proposal is not a final enrollment agreement. Final enrollment is completed through the next Management step."
  ]
    .filter(
      (line) => line !== null
    )
    .join("\n");

  if (customerEstimate) {
    customerEstimate.innerHTML = html;
  }

  return {
    html,
    text
  };
}

function collectedEstimateEmail() {
  return String(
    sourceAppointment?.email ||
    sourceAppointment?.parentEmail ||
    ""
  ).trim();
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


function monthPeriods(first, last) {
  if (!/^\d{4}-\d{2}$/.test(first) || !/^\d{4}-\d{2}$/.test(last)) {
    return [];
  }
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const start = new Date(fy, fm - 1, 1);
  const end = new Date(ly, lm - 1, 1);
  if (start > end) return [];
  const periods = [];
  const cursor = new Date(start);
  while (cursor <= end && periods.length < 12) {
    periods.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}

function priorPaymentHandoff() {
  const amount = Number(priorPaymentAmount?.value || 0);
  const method = String(priorPaymentMethod?.value || "");
  const first = String(priorPaymentFirstMonth?.value || "");
  const last = String(priorPaymentLastMonth?.value || first);
  const periods = monthPeriods(first, last);

  if (!amount || !method || !periods.length) {
    return null;
  }

  return {
    amountCents: Math.round(amount * 100),
    paymentMethod: method,
    periods,
    enrollmentFeeIncluded:
      priorPaymentEnrollmentIncluded?.checked === true,
    note:
      String(priorPaymentNote?.value || "").trim() ||
      "Historical payment recorded during membership transition."
  };
}

function startAnnualThisMonth() {
  const today =
    new Date();

  const year =
    today.getFullYear();

  const month =
    String(
      today.getMonth() + 1
    ).padStart(2, "0");

  if (enrollmentStartDate) {
    enrollmentStartDate.value =
      `${year}-${month}-01`;
  }

  athleteList
    .querySelectorAll(
      ".pricing-athlete"
    )
    .forEach((card) => {
      const plan =
        card.querySelector(
          ".athlete-plan"
        )?.value;

      if (plan !== "standard") {
        return;
      }

      const billingTerm =
        card.querySelector(
          ".billing-term"
        );

      if (billingTerm) {
        billingTerm.value =
          "annual";
      }
    });

  renderPricing();

  if (pricingSourceStatus) {
    pricingSourceStatus.textContent =
      "12-month transition applied. Prior paid months remain in Billing; this checkout starts with the current month.";
  }
}

startAnnualThisMonthBtn
  ?.addEventListener(
    "click",
    startAnnualThisMonth
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
priorPaymentEnrollmentIncluded?.addEventListener(
  "change",
  renderPricing
);

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

sendEstimateBtn?.addEventListener(
  "click",
  () => {
    const recipient =
      collectedEstimateEmail();

    if (!recipient) {
      if (pricingSourceStatus) {
        pricingSourceStatus.textContent =
          "No email was collected for this admissions record.";
      }
      return;
    }

    const estimate =
      buildCustomerEstimate();

    const subject =
      "Sandman Academy Membership Plan Proposal";

    const mailto =
      `mailto:${recipient}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(estimate.text)}`;

    window.location.href = mailto;
  }
);

printBtn?.addEventListener(
  "click",
  () => {
    buildCustomerEstimate();

    window.print();
  }
);


addAthlete({
  disciplines: [
    "wrestling"
  ]
});

async function loadPricingSource() {
  await requireManagement();
  if (!appointmentId) {
    pricingSourceStatus.textContent = "Standalone estimate. Open a lead or appointment to continue into a proposal.";
    return;
  }
  const snapshot = await getDoc(doc(db, "admissions_appointments", appointmentId));
  if (!snapshot.exists()) throw new Error("The admissions appointment was not found or is not accessible.");
  const appointment = snapshot.data();
  if (!appointment.locationId) throw new Error("The appointment has no canonical locationId; proposal handoff is blocked.");
  sourceAppointment = appointment;
  athleteList.innerHTML = "";
  addAthlete(recommendationFromAppointment(appointment));
  pricingSourceStatus.textContent = `Admissions context loaded for ${appointment.participantName || appointment.athleteName || "this prospect"}.`;
  continueProposalBtn.hidden = false;
}

async function findDraftProposalForAppointment() {
  const snapshot = await getDocs(
    query(
      collection(db, "proposals"),
      where("prospect.appointmentId", "==", appointmentId)
    )
  );

  const drafts = snapshot.docs
    .map((entry) => ({
      id: entry.id,
      ...(entry.data() || {})
    }))
    .filter(
      (proposal) =>
        String(proposal.status || "")
          .trim()
          .toUpperCase() === "DRAFT"
    )
    .sort(
      (a, b) =>
        Number(
          b.updatedAt?.toMillis?.() ||
          b.createdAt?.toMillis?.() ||
          0
        ) -
        Number(
          a.updatedAt?.toMillis?.() ||
          a.createdAt?.toMillis?.() ||
          0
        )
    );

  return drafts[0] || null;
}

function proposalPricingSnapshot() {
  const athletes = readAthletes();
  const estimate = calculateManagementEstimate(
    athletes,
    {
      startDate: enrollmentStartDate?.value,
      enrollmentSupportPercent:
        enrollmentSupport?.value,
      monthlySponsorPercent:
        monthlySponsor?.value,
      promotionAmount:
        appliedPromotion?.amount || 0,
      enrollmentPreviouslyPaid:
        priorPaymentEnrollmentIncluded
          ?.checked === true
    }
  );

  return {
    athletes,
    estimate,
    pricing: {
      registrationCount:
        estimate.eligibleCount,
      enrollmentBase:
        estimate.annualEnrollment,
      enrollmentPreviouslyPaid:
        estimate.enrollmentPreviouslyPaid > 0,
      enrollmentPreviouslyPaidAmount:
        estimate.enrollmentPreviouslyPaid,
      admissionsCredits:
        estimate.admissionsCredits,
      support:
        estimate.enrollmentSupport,
      supportPercent:
        Number(enrollmentSupport?.value || 0),
      monthlySponsor:
        estimate.monthlySponsor,
      monthlySponsorPercent:
        Number(monthlySponsor?.value || 0),
      membershipStartDate:
        enrollmentStartDate?.value || "",
      prorationPercent:
        Math.round(
          estimate.prorationRate * 100
        ),
      proratedFirstMonth:
        estimate.proratedFirstMonth,
      enrollmentDueNow:
        Math.max(
          0,
          estimate.dueAtEnrollment -
          estimate.proratedFirstMonth
        ),
      firstMonthDueNow:
        estimate.proratedFirstMonth,
      additionalMembershipMonthsDue: 0,
      additionalMembershipDueNow: 0,
      overdueMembershipMonths: 0,
      overdueMembershipDueNow: 0,
      paymentStartMode: "start_now",
      normalDueNow:
        estimate.dueAtEnrollment,
      dueNow:
        estimate.dueAtEnrollment,
      monthlyBase:
        estimate.monthlyBase,
      monthlyBalance:
        estimate.monthlyMembership,
      projectedSavingsAnnual:
        Number(
          estimate.pricing
            ?.projectedSavingsAnnual || 0
        )
    }
  };
}

continueProposalBtn?.addEventListener(
  "click",
  async () => {
    if (!sourceAppointment || !appointmentId) {
      return;
    }

    const originalText =
      continueProposalBtn.textContent;

    continueProposalBtn.disabled = true;
    continueProposalBtn.textContent =
      "Creating Proposal…";

    try {
      const handoff = {
        appointmentId,
        createdAt: Date.now(),
        athletes: readAthletes(),
        membershipStartDate:
          enrollmentStartDate?.value || "",
        priorPayment:
          priorPaymentHandoff(),
      };

      sessionStorage.setItem(
        "sandmanPricingProposalHandoff",
        JSON.stringify(handoff)
      );

      let proposal =
        await findDraftProposalForAppointment();

      let proposalId =
        String(proposal?.proposalId || proposal?.id || "");

      const snapshot =
        proposalPricingSnapshot();

      const proposalPayload = {
        appointmentId,
        admissionsRequestId:
          sourceAppointment.admissionsRequestId ||
          sourceAppointment.requestId ||
          null,
        prospect: {
          appointmentId,
          familyName:
            sourceAppointment.parentName ||
            sourceAppointment.guardianName ||
            sourceAppointment.participantName ||
            sourceAppointment.athleteName ||
            null
        },
        coach: {
          name: "Coach Sandoval"
        },
        athletes:
          snapshot.athletes,
        pricing:
          snapshot.pricing,
        agreement: {
          membershipStartDate:
            enrollmentStartDate?.value || "",
          recurringBillingDay: 5
        },
        internalNotes: null
      };

      if (!proposalId) {
        const createProposalDraft =
          httpsCallable(
            functions,
            "createProposalDraft"
          );

        const response =
          await createProposalDraft(
            proposalPayload
          );

        proposalId =
          String(
            response.data?.proposalId || ""
          );

        if (!proposalId) {
          throw new Error(
            "Proposal ID was not returned."
          );
        }
      } else {
        const updateProposalDraft =
          httpsCallable(
            functions,
            "updateProposalDraft"
          );

        await updateProposalDraft({
          ...proposalPayload,
          proposalId
        });
      }

      const priorPayment =
        priorPaymentHandoff();

      if (priorPayment) {
        const recordPriorPayment =
          httpsCallable(
            functions,
            "recordProposalPriorPayment"
          );

        try {
          await recordPriorPayment({
            proposalId,
            ...priorPayment
          });
        } catch (error) {
          if (
            error?.code !==
            "functions/already-exists"
          ) {
            throw error;
          }
        }
      }

      sessionStorage.setItem(
        "sandmanPricingProposalHandoff",
        JSON.stringify({
          ...handoff,
          priorPayment: null
        })
      );

      window.location.href =
        "/connect/admissions/calculator/" +
        `?appointmentId=${encodeURIComponent(appointmentId)}` +
        `&proposalId=${encodeURIComponent(proposalId)}`;
    } catch (error) {
      console.error(
        "Pricing → Proposal handoff failed:",
        error
      );

      if (pricingSourceStatus) {
        pricingSourceStatus.textContent =
          error?.message ||
          "Could not create the proposal.";
      }

      continueProposalBtn.disabled =
        false;
      continueProposalBtn.textContent =
        originalText;
    }
  }
);

loadPricingSource().catch((error) => {
  pricingSourceStatus.textContent = error?.message || "Admissions context could not be loaded.";
  continueProposalBtn.hidden = true;
});
