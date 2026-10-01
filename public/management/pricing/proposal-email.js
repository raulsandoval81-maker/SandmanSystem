import {
  SANDMAN_PRICING_CATALOG
} from "/assets/js/pricing/sandman-pricing-catalog.js";

import {
  calculateManagementEstimate
} from "./pricing-estimate-model.js";

import {
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

const sendButton = document.getElementById("sendEstimateBtn");
const pricingSourceStatus = document.getElementById("pricingSourceStatus");
const athleteList = document.getElementById("athleteList");
const enrollmentStartDate = document.getElementById("enrollmentStartDate");
const enrollmentSupport = document.getElementById("enrollmentSupport");
const monthlySponsor = document.getElementById("monthlySponsor");
const appointmentId = new URLSearchParams(window.location.search).get("appointmentId") || "";

const BILLING_OPTIONS = [
  {
    value: "month-to-month",
    label: "Month-to-Month",
    code: "1"
  },
  {
    value: "six-month",
    label: "6-Month Agreement + Autopay",
    code: "2"
  },
  {
    value: "annual",
    label: "12-Month Agreement + Autopay",
    code: "3"
  }
];

const ACCESS_CODES = Object.freeze({
  "core-2": "A",
  "competition-3": "B",
  "classes-4": "C",
  "discipline-5": "D",
  "dual-full": "E"
});

const JOURNEY_LABELS = Object.freeze({
  zero2hero: "Road2Champion",
  path2legend: "Path2Legend",
  quest2mastery: "Quest2Mastery"
});

const DISCIPLINE_LABELS = Object.freeze({
  wrestling: "Wrestling",
  boxing: "Boxing",
  "muay-thai": "Muay Thai"
});

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Math.max(0, Number(value || 0)));
}

function readAthletes() {
  return [
    ...athleteList.querySelectorAll(".pricing-athlete")
  ].map((card, index) => {
    const primaryDiscipline =
      card.querySelector(".discipline-primary")?.value || "";

    const secondaryDiscipline =
      card.querySelector(".discipline-secondary")?.value || "";

    const disciplines = [
      primaryDiscipline,
      secondaryDiscipline
    ].filter(
      (value, itemIndex, values) =>
        value && values.indexOf(value) === itemIndex
    );

    const plan =
      card.querySelector(".athlete-plan")?.value || "standard";

    return {
      index: index + 1,
      name:
        card.querySelector(".athlete-name")?.value.trim() ||
        `Member ${index + 1}`,
      memberType:
        card.querySelector(".member-type")?.value || "youth",
      journey:
        card.querySelector(".journey")?.value || "zero2hero",
      plan,
      billingTerm:
        card.querySelector(".billing-term")?.value || "month-to-month",
      trainingAccess:
        card.querySelector(".training-access")?.value || "core-2",
      credit: Number(
        card.querySelector(".admissions-credit")?.value || 0
      ),
      disciplines: plan === "fitness" ? [] : disciplines
    };
  });
}

function accessLabel(athlete) {
  if (athlete.plan === "fitness") {
    return `${athlete.trainingAccess} days/week`;
  }

  return (
    SANDMAN_PRICING_CATALOG.combat.accessLevels[
      athlete.trainingAccess
    ]?.label ||
    athlete.trainingAccess ||
    "Combat"
  );
}

function memberDescription(athlete) {
  if (athlete.plan === "fitness") {
    return `Fitness Only · ${accessLabel(athlete)}`;
  }

  const journey =
    JOURNEY_LABELS[athlete.journey] || athlete.journey || "Combat";

  const disciplines = athlete.disciplines
    .map(
      (discipline) =>
        DISCIPLINE_LABELS[discipline] || discipline
    )
    .join(" + ");

  return [
    journey,
    disciplines,
    accessLabel(athlete)
  ]
    .filter(Boolean)
    .join(" · ");
}

function estimateForBillingTerm(athletes, billingTerm) {
  const scenarioAthletes = athletes.map((athlete) => ({
    ...athlete,
    billingTerm:
      athlete.plan === "standard"
        ? billingTerm
        : athlete.billingTerm
  }));

  return calculateManagementEstimate(
    scenarioAthletes,
    {
      startDate: enrollmentStartDate?.value,
      enrollmentSupportPercent: enrollmentSupport?.value,
      monthlySponsorPercent: monthlySponsor?.value,
      promotionAmount: 0
    }
  );
}

function responseAccessFor(athletes) {
  const combatAthletes = athletes.filter(
    (athlete) => athlete.plan === "standard"
  );

  if (!combatAthletes.length) return "";

  const firstAccess = combatAthletes[0].trainingAccess;
  const sameAccess = combatAthletes.every(
    (athlete) => athlete.trainingAccess === firstAccess
  );

  return sameAccess ? firstAccess : "";
}

function buildProposalEmail(athletes) {
  const comparisons = BILLING_OPTIONS.map((option) => ({
    ...option,
    estimate: estimateForBillingTerm(athletes, option.value)
  }));

  const monthToMonth = comparisons.find(
    (item) => item.value === "month-to-month"
  );
  const sixMonth = comparisons.find(
    (item) => item.value === "six-month"
  );
  const annual = comparisons.find(
    (item) => item.value === "annual"
  );

  const annualEnrollment =
    comparisons[0]?.estimate?.annualEnrollment || 0;

  const sixMonthSavings = Math.max(
    0,
    Number(monthToMonth?.estimate?.monthlyMembership || 0) -
      Number(sixMonth?.estimate?.monthlyMembership || 0)
  );

  const annualMonthlySavings = Math.max(
    0,
    Number(monthToMonth?.estimate?.monthlyMembership || 0) -
      Number(annual?.estimate?.monthlyMembership || 0)
  );

  const annualSavings = annualMonthlySavings * 12;

  const commonAccess = responseAccessFor(athletes);
  const currentTierCode = ACCESS_CODES[commonAccess] || "";

  const pricingLines = comparisons.map((item) => {
    const responseCode = currentTierCode
      ? `${currentTierCode}${item.code} — `
      : "";

    return `${responseCode}${item.label}: ${money(
      item.estimate.monthlyMembership
    )}/month`;
  });

  let recommendationLines = [];
  let recommendedResponse = null;
  let competitionNote = "";

  const combatAthletes = athletes.filter(
    (athlete) => athlete.plan === "standard"
  );

  if (combatAthletes.length === 1) {
    const athlete = combatAthletes[0];
    const accessOrder = SANDMAN_PRICING_CATALOG.combat.accessOrder;
    const currentIndex = accessOrder.indexOf(athlete.trainingAccess);
    const nextAccess =
      currentIndex >= 0 ? accessOrder[currentIndex + 1] : "";

    if (nextAccess) {
      const nextLevel =
        SANDMAN_PRICING_CATALOG.combat.accessLevels[nextAccess];

      const recommendationAthletes = athletes.map((item) => ({
        ...item,
        trainingAccess:
          item === athlete ? nextAccess : item.trainingAccess,
        billingTerm:
          item.plan === "standard" ? "annual" : item.billingTerm
      }));

      const recommendationEstimate = calculateManagementEstimate(
        recommendationAthletes,
        {
          startDate: enrollmentStartDate?.value,
          enrollmentSupportPercent: enrollmentSupport?.value,
          monthlySponsorPercent: monthlySponsor?.value,
          promotionAmount: 0
        }
      );

      const recommendedMonthly = Number(
        recommendationEstimate.monthlyMembership || 0
      );

      const currentMtm = Number(
        monthToMonth?.estimate?.monthlyMembership || 0
      );

      const nextTierCode = ACCESS_CODES[nextAccess] || "";
      const responseCode = nextTierCode ? `${nextTierCode}3` : "";

      recommendedResponse = {
        code: responseCode,
        label: nextLevel.label
      };

      recommendationLines = [
        "",
        "Recommended Next Step",
        `${responseCode ? `${responseCode} — ` : ""}${nextLevel.label}`,
        `12-Month Agreement + Autopay — ${money(
          recommendedMonthly
        )}/month`,
        nextLevel.description,
        recommendedMonthly === currentMtm
          ? `Same monthly price as ${accessLabel(
              athlete
            )} month-to-month, with additional training access.`
          : ""
      ].filter(Boolean);

      if (nextAccess === "competition-3") {
        competitionNote =
          "Competition Note: Hard sparring, sanctioned competition, or certain competition-development activities may require additional governing-body membership, insurance, or other eligibility requirements. Any additional requirements will be confirmed before participation.";
      }
    }
  }

  const confirmationOptions = [];

  if (currentTierCode) {
    BILLING_OPTIONS.forEach((option) => {
      confirmationOptions.push(
        `${currentTierCode}${option.code} — ${option.label}`
      );
    });
  }

  if (recommendedResponse?.code) {
    confirmationOptions.push(
      `${recommendedResponse.code} — ${recommendedResponse.label} · 12-Month Agreement + Autopay`
    );
  }

  const memberText = athletes
    .map(
      (athlete) =>
        `${athlete.name}\n${memberDescription(athlete)}`
    )
    .join("\n\n");

  const firstName = String(athletes[0]?.name || "there")
    .trim()
    .split(/\s+/)[0];

  const confirmationLines = confirmationOptions.length
    ? [
        "------------------------------------------------------------",
        "",
        "PROPOSAL CONFIRMATION",
        "",
        "Please choose one:",
        "",
        ...confirmationOptions,
        "",
        "COPY + PASTE YOUR REPLY",
        "",
        "Selected Option: ______",
        "",
        recommendedResponse?.code
          ? `Example: Selected Option: ${recommendedResponse.code}`
          : "Example: Selected Option: A3",
        "",
        "Once I receive your selection, I’ll handle the next step."
      ]
    : [
        "------------------------------------------------------------",
        "",
        "PROPOSAL CONFIRMATION",
        "",
        "Please reply with the membership option you would like to move forward with.",
        "",
        "COPY + PASTE YOUR REPLY",
        "",
        "Selected Option: ______",
        "",
        "Once I receive your selection, I’ll handle the next step."
      ];

  const membershipNotes = [
    "This Membership Plan Proposal is not a final enrollment agreement. Your reply confirms your preferred membership option only. Final enrollment is completed in the next step.",
    "AAU or other governing-body membership is purchased separately where required.",
    competitionNote,
    "Sandman Academy membership fees are separate from any outside facility, program, or participation fees that may apply."
  ].filter(Boolean);

  return [
    `Hey ${firstName},`,
    "",
    "Below is your Sandman Academy Membership Plan Proposal with the available options for your membership and the next training option available to you.",
    "",
    "Please review everything and reply with the option you would like to move forward with.",
    "",
    "Recurring membership payments are processed on the 5th of each month.",
    "",
    "Once you send your selection back, I’ll handle the next step from there.",
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
    ...pricingLines,
    `Annual Enrollment: ${money(annualEnrollment)}`,
    "",
    "Savings",
    `6-Month: Save ${money(
      sixMonthSavings
    )}/month compared with month-to-month.`,
    `12-Month: Save ${money(
      annualMonthlySavings
    )}/month compared with month-to-month.`,
    `12-Month Annual Savings: ${money(annualSavings)}`,
    ...recommendationLines,
    "",
    ...confirmationLines,
    "",
    "------------------------------------------------------------",
    "",
    "Membership Notes",
    "",
    ...membershipNotes
  ].join("\n");
}

async function collectedEmail() {
  if (!appointmentId) return "";

  const snapshot = await getDoc(
    doc(db, "admissions_appointments", appointmentId)
  );

  if (!snapshot.exists()) return "";

  const appointment = snapshot.data();

  return String(
    appointment.email || appointment.parentEmail || ""
  ).trim();
}

sendButton?.addEventListener(
  "click",
  async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const recipient = await collectedEmail();

    if (!recipient) {
      if (pricingSourceStatus) {
        pricingSourceStatus.textContent =
          "No email was collected for this admissions record.";
      }
      return;
    }

    const athletes = readAthletes();
    const body = buildProposalEmail(athletes);
    const subject = "Sandman Academy Membership Plan Proposal";

    window.location.href =
      `mailto:${recipient}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
  },
  { capture: true }
);
