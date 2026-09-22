import { calculateSandmanMembershipPricing } from "../../assets/js/pricing/sandman-pricing-engine.js";
import { SANDMAN_PRICING_CATALOG } from "../../assets/js/pricing/sandman-pricing-catalog.js";

const allowedSupport = new Set([0, 25, 50, 75, 100]);

function percent(value) {
  const number = Number(value);
  return allowedSupport.has(number) ? number : 0;
}

function percentAmount(amount, value) {
  return Math.round(amount * percent(value)) / 100;
}

export function prorationRateForStartDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!match) return 1;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return 1;
  if (day <= 7) return 1;
  if (day <= 14) return 0.75;
  if (day <= 21) return 0.5;
  return 0.25;
}

export function calculateManagementEstimate(athletes, options = {}) {
  if (athletes.some((athlete) => !["standard", "fitness"].includes(athlete.plan))) {
    throw new Error("Only current Combat and Fitness memberships can be estimated.");
  }

  const pricing = calculateSandmanMembershipPricing(athletes);
  const eligibleAthletes = athletes.filter((athlete) => athlete.plan === "standard");
  const annualEnrollment = eligibleAthletes.length *
    SANDMAN_PRICING_CATALOG.enrollment.perAthlete.amount;
  const admissionsCredits = eligibleAthletes.reduce((total, athlete) =>
    total + (Number(athlete.credit) === 25 ? 25 : 0), 0);
  const enrollmentSupport = percentAmount(annualEnrollment, options.enrollmentSupportPercent);
  const monthlyBase = pricing.monthlyMembership;
  const monthlySponsor = percentAmount(monthlyBase, options.monthlySponsorPercent);
  const monthlyMembership = monthlyBase - monthlySponsor;
  const prorationRate = prorationRateForStartDate(options.startDate);
  const proratedFirstMonth = Math.round(monthlyMembership * prorationRate * 100) / 100;
  const enrollmentAfterSupport = Math.max(0,
    annualEnrollment - admissionsCredits - enrollmentSupport);
  const promotion = Math.min(
    enrollmentAfterSupport,
    Math.max(0, Number(options.promotionAmount) || 0)
  );
  const dueAtEnrollment = Math.max(0, enrollmentAfterSupport - promotion) + proratedFirstMonth;

  return {
    pricing,
    eligibleCount: eligibleAthletes.length,
    annualEnrollment,
    admissionsCredits,
    enrollmentSupport,
    monthlyBase,
    monthlySponsor,
    monthlyMembership,
    prorationRate,
    proratedFirstMonth,
    promotion,
    dueAtEnrollment,
    nextMonthlyPayment: monthlyMembership,
  };
}
