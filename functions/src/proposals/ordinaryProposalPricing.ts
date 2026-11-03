import { HttpsError } from "firebase-functions/v2/https";

const VERSION = "ACADEMY_2026_V4";
const EFFECTIVE_FROM = "2026-09-19";
const PREFIX = "sandman_academy-2026-v4_";
const SUPPORT_PERCENTAGES = new Set([0, 25, 50, 75, 100]);
const ACCESS_ORDER = ["core-2", "competition-3", "classes-4", "discipline-5", "dual-full"] as const;
const TERM_KEYS = ["annual", "sixMonth", "monthToMonth"] as const;

type Access = typeof ACCESS_ORDER[number];
type Term = typeof TERM_KEYS[number];
type Athlete = Record<string, unknown>;
type CatalogRate = { amount: number; lookupKey: string };

const ACCESS_LOOKUP: Record<Access, string> = {
  "core-2": "core2", "competition-3": "comp3", "classes-4": "class4",
  "discipline-5": "day5", "dual-full": "dual",
};

const COMBAT_PRICES: Record<string, Record<Access, [number, number, number]>> = {
  "1": { "core-2": [80, 90, 100], "competition-3": [100, 110, 120], "classes-4": [120, 130, 140], "discipline-5": [130, 140, 150], "dual-full": [160, 170, 180] },
  "2": { "core-2": [120, 130, 140], "competition-3": [140, 150, 160], "classes-4": [180, 190, 200], "discipline-5": [200, 210, 220], "dual-full": [240, 250, 260] },
  "3": { "core-2": [160, 170, 180], "competition-3": [180, 190, 200], "classes-4": [220, 230, 240], "discipline-5": [240, 250, 260], "dual-full": [280, 290, 300] },
  "4": { "core-2": [200, 210, 220], "competition-3": [220, 230, 240], "classes-4": [240, 250, 260], "discipline-5": [260, 270, 280], "dual-full": [340, 350, 360] },
};

const EXTRA_OPTIONS: Record<string, { label: string; amount: number; promotion: number }> = {
  none: { label: "No private training", amount: 0, promotion: 0 },
  "private-30": { label: "Private lesson — 30 minutes", amount: 30, promotion: 0 },
  "private-60": { label: "Private lesson — 60 minutes", amount: 50, promotion: 10 },
  "semi-private": { label: "Semi-private lesson — 90 minutes", amount: 70, promotion: 0 },
};

const PROMOTION_CODES: Record<string, number> = {
  TEST25: 25,
};

function invalid(message: string): never {
  throw new HttpsError("invalid-argument", message);
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) invalid(`${field} is invalid.`);
  return parsed;
}

function percent(value: unknown, field: string): number {
  const parsed = number(value ?? 0, field);
  if (!SUPPORT_PERCENTAGES.has(parsed)) invalid(`${field} is not an approved percentage.`);
  return parsed;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function dollars(value: number): number {
  return Math.round(value * 100) / 100;
}

function wholeNumber(value: unknown, field: string, maximum: number): number {
  const parsed = number(value ?? 0, field);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) invalid(`${field} is invalid.`);
  return parsed;
}

function assertSame(raw: Record<string, unknown>, field: string, expected: unknown): void {
  if (!(field in raw)) return;
  const actual = raw[field];
  if (typeof expected === "number") {
    if (cents(number(actual, field)) !== cents(expected)) {
      invalid(`Browser pricing field ${field} does not match server-authoritative pricing.`);
    }
    return;
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    invalid(`Browser pricing field ${field} does not match server-authoritative pricing.`);
  }
}

function access(value: unknown): Access {
  const normalized = clean(value) === "4-6" ? "classes-4" : clean(value);
  if (!ACCESS_ORDER.includes(normalized as Access)) invalid("Combat training access is invalid.");
  return normalized as Access;
}

function term(value: unknown): Term {
  const normalized = clean(value);
  if (normalized === "annual") return "annual";
  if (normalized === "six-month" || normalized === "sixMonth") return "sixMonth";
  if (normalized === "month-to-month" || normalized === "monthToMonth") return "monthToMonth";
  return invalid("Membership billing term is invalid.");
}

function rate(household: number, selectedAccess: Access, selectedTerm: Term): CatalogRate {
  const size = String(Math.min(4, Math.max(1, household)));
  const termIndex = TERM_KEYS.indexOf(selectedTerm);
  return {
    amount: COMBAT_PRICES[size][selectedAccess][termIndex],
    lookupKey: `${PREFIX}combat_h${size}_${ACCESS_LOOKUP[selectedAccess]}_${selectedTerm === "annual" ? "12mo" : selectedTerm === "sixMonth" ? "6mo" : "mtm"}`,
  };
}

function proration(startDate: unknown): number {
  const match = clean(startDate).match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!match) invalid("membershipStartDate must use YYYY-MM-DD.");
  const day = Number(match[1]);
  if (day < 1 || day > 31) invalid("membershipStartDate is invalid.");
  return day <= 7 ? 1 : day <= 14 ? 0.75 : day <= 21 ? 0.5 : 0.25;
}

function nextBillingDate(startDate: string): string {
  const [year, month] = startDate.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) invalid("membershipStartDate is invalid.");
  const next = new Date(Date.UTC(year, month, 5, 12));
  return next.toISOString().slice(0, 10);
}

export function canonicalOrdinaryProposalPricing(
  rawPricing: Record<string, unknown>,
  athletes: unknown[],
): Record<string, unknown> {
  if (!athletes.length || athletes.length > 12) invalid("Ordinary pricing requires 1–12 athletes.");
  const records = athletes.map((entry, index) => {
    if (!entry || typeof entry !== "object") invalid(`Athlete ${index + 1} is invalid.`);
    const athlete = entry as Athlete;
    const plan = clean(athlete.plan);
    if (plan !== "standard" && plan !== "fitness") invalid(`Athlete ${index + 1} has an unsupported membership plan.`);
    const credit = number(athlete.credit ?? 0, `Athlete ${index + 1} admissions credit`);
    if (credit !== 0 && credit !== 25) invalid(`Athlete ${index + 1} admissions credit is not approved.`);
    if (plan === "fitness") {
      const trainingAccess = clean(athlete.trainingAccess);
      if (trainingAccess !== "2" && trainingAccess !== "3") invalid(`Athlete ${index + 1} Fitness access is invalid.`);
      return { athlete, index: index + 1, plan, credit: 0, trainingAccess };
    }
    return { athlete, index: index + 1, plan, credit, trainingAccess: access(athlete.trainingAccess), billingTerm: term(athlete.billingTerm) };
  });

  const combat = records.filter(record => record.plan === "standard");
  const fitness = records.filter(record => record.plan === "fitness");
  const catalogItems: Array<Record<string, unknown>> = [];
  let standardCombatMonthly = 0;
  let individualCombatEquivalent = 0;

  for (const record of combat) individualCombatEquivalent += rate(1, record.trainingAccess as Access, record.billingTerm as Term).amount;
  if (combat.length) {
    const familyAccess = combat.reduce((highest, record) => Math.max(highest, ACCESS_ORDER.indexOf(record.trainingAccess as Access)), 0);
    const familyTerm = combat.reduce((leastCommitted, record) => Math.max(leastCommitted, TERM_KEYS.indexOf(record.billingTerm as Term)), 0);
    const selected = rate(combat.length, ACCESS_ORDER[familyAccess], TERM_KEYS[familyTerm]);
    standardCombatMonthly = selected.amount;
    catalogItems.push({
      kind: combat.length === 1 ? "combat-individual" : "combat-family", recurring: true,
      ...(combat.length === 1 ? { athleteIndex: combat[0].index } : { householdSize: String(Math.min(4, combat.length)) }),
      trainingAccess: ACCESS_ORDER[familyAccess], billingTerm: TERM_KEYS[familyTerm],
      lookupKey: selected.lookupKey, amount: selected.amount, quantity: 1,
    });
  }

  let fitnessMonthly = 0;
  for (const record of fitness) {
    const amount = record.trainingAccess === "3" ? 80 : 60;
    fitnessMonthly += amount;
    catalogItems.push({
      kind: "fitness", recurring: true, athleteIndex: record.index,
      lookupKey: record.trainingAccess === "3" ? "sandman_academy-2026-v3_fitness_3day" : "sandman_academy-2026-v3_fitness_2day",
      amount, quantity: 1,
    });
  }

  const monthlyBase = standardCombatMonthly + fitnessMonthly;
  if (monthlyBase <= 0) invalid("Ordinary pricing requires a current Combat or Fitness membership.");
  const supportPercent = percent(rawPricing.supportPercent, "supportPercent");
  const monthlySponsorPercent = percent(rawPricing.monthlySponsorPercent, "monthlySponsorPercent");
  const annualSponsorPercent = percent(rawPricing.annualSponsorPercent, "annualSponsorPercent");
  const enrollmentBase = combat.length * 30;
  const admissionsCredits = combat.reduce((sum, record) => sum + record.credit, 0);
  const support = dollars(enrollmentBase * supportPercent / 100);
  const monthlySponsor = dollars(monthlyBase * monthlySponsorPercent / 100);
  const monthlyBalance = dollars(monthlyBase - monthlySponsor);
  if (monthlyBalance < 0.5) invalid("Monthly sponsorship cannot eliminate the recurring membership charge.");

  const extraCode = clean(rawPricing.extraCode || "none");
  const extra = EXTRA_OPTIONS[extraCode];
  if (!extra) invalid("Private-training option is invalid.");
  const requestedPromotion = number(rawPricing.privatePromo ?? 0, "privatePromo");
  const privatePromo = requestedPromotion > 0 ? extra.promotion : 0;
  if (requestedPromotion !== privatePromo) invalid("Private-training promotion is not approved for this offer.");

  const promotionCode = clean(rawPricing.promotionCode).toUpperCase();
  const requestedPromotionAmount = number(rawPricing.promotionAmount ?? 0, "promotionAmount");
  const approvedPromotionAmount = promotionCode ? PROMOTION_CODES[promotionCode] : 0;
  if (approvedPromotionAmount === undefined || requestedPromotionAmount !== approvedPromotionAmount) {
    invalid("Promotion code or amount is not approved for this offer.");
  }

  const enrollmentPreviouslyPaidAmount = Math.min(enrollmentBase,
    number(rawPricing.enrollmentPreviouslyPaidAmount ?? 0, "enrollmentPreviouslyPaidAmount"));
  const enrollmentPreviouslyPaid = enrollmentPreviouslyPaidAmount >= enrollmentBase && enrollmentBase > 0;
  const enrollmentBeforePromotion = Math.max(0,
    enrollmentBase + extra.amount - enrollmentPreviouslyPaidAmount - admissionsCredits - privatePromo - support);
  const promotion = Math.min(enrollmentBeforePromotion, requestedPromotionAmount);
  const enrollmentDueNow = dollars(enrollmentBeforePromotion - promotion);
  const membershipStartDate = clean(rawPricing.membershipStartDate);
  const prorationRate = proration(membershipStartDate);
  const proratedFirstMonth = dollars(monthlyBalance * prorationRate);
  const normalDueNow = dollars(enrollmentDueNow + proratedFirstMonth);
  const allCombatAnnual = combat.length >= 2 && combat.every(record => record.billingTerm === "annual");
  const deferredFamilyEligible = allCombatAnnual && normalDueNow >= 200;
  const requestedStartMode = clean(rawPricing.paymentStartMode || "start_now");
  if (requestedStartMode !== "start_now" && requestedStartMode !== "deferred_family") invalid("Payment start mode is invalid.");
  const paymentStartMode = requestedStartMode === "deferred_family" && deferredFamilyEligible ? "deferred_family" : "start_now";
  if (requestedStartMode !== paymentStartMode) invalid("Deferred family billing is not available for this offer.");
  const firstMonthDueNow = paymentStartMode === "deferred_family" ? 0 : proratedFirstMonth;
  const additionalMembershipMonthsDue = wholeNumber(
    rawPricing.additionalMembershipMonthsDue, "additionalMembershipMonthsDue", 24);
  const additionalMembershipDueNow = dollars(monthlyBalance * additionalMembershipMonthsDue);
  const dueNow = dollars(enrollmentDueNow + firstMonthDueNow + additionalMembershipDueNow);
  const annualBase = enrollmentBase;
  const annualSponsor = dollars(annualBase * annualSponsorPercent / 100);
  const agreementSavingsAnnual = combat.reduce((sum, record) => {
    const monthToMonth = rate(1, record.trainingAccess as Access, "monthToMonth").amount;
    return sum + (monthToMonth - rate(1, record.trainingAccess as Access, record.billingTerm as Term).amount) * 12;
  }, 0);
  const familySavingsAnnual = Math.max(0, individualCombatEquivalent - standardCombatMonthly) * 12;

  const authoritative: Record<string, unknown> = {
    ...rawPricing,
    registrationCount: combat.length,
    enrollmentBase, enrollmentPreviouslyPaid, enrollmentPreviouslyPaidAmount,
    extraCode, extraLabel: extra.label, extraAmount: extra.amount,
    admissionsCredits, privatePromo, promotionCode: promotionCode || null,
    promotionAmount: requestedPromotionAmount, promotion, support, supportPercent,
    membershipStartDate, prorationPercent: Math.round(prorationRate * 100), proratedFirstMonth,
    enrollmentDueNow, firstMonthDueNow, normalDueNow: dueNow, dueNow,
    additionalMembershipMonthsDue, additionalMembershipDueNow,
    paymentStartMode, deferredFamilyEligible,
    recurringBillingDay: 5, firstRecurringChargeDate: nextBillingDate(membershipStartDate),
    monthlyBase, commitmentDiscount: 0,
    agreementSavingsAnnual, projectedSavingsAnnual: familySavingsAnnual + agreementSavingsAnnual,
    monthlySponsor, monthlySponsorPercent, monthlyBalance,
    annualBase, annualSponsor, annualSponsorPercent, annualRenewal: dollars(annualBase - annualSponsor),
    catalog: VERSION, catalogEffectiveFrom: EFFECTIVE_FROM, pricingModel: VERSION,
    stripeCatalogItems: catalogItems,
    enrollmentModel: "per_eligible_athlete", enrollmentPerAthlete: 30, enrollmentIncludesAAU: false,
  };

  for (const field of [
    "registrationCount", "enrollmentBase", "enrollmentPreviouslyPaid", "enrollmentPreviouslyPaidAmount",
    "extraAmount", "admissionsCredits", "privatePromo", "promotionAmount", "promotion", "support", "prorationPercent", "proratedFirstMonth",
    "enrollmentDueNow", "firstMonthDueNow", "normalDueNow", "dueNow",
    "additionalMembershipMonthsDue", "additionalMembershipDueNow",
    "monthlyBase", "commitmentDiscount", "monthlySponsor", "monthlyBalance",
    "annualBase", "annualSponsor", "annualRenewal", "catalog", "pricingModel", "stripeCatalogItems",
  ]) assertSame(rawPricing, field, authoritative[field]);

  return authoritative;
}
