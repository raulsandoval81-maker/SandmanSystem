// Pure family-facing monthly-period disclosure. Never guess specific months
// unless start/recurring dates and the additional-month count agree.
export function monthlyPeriodDisclosure(pricing = {}) {
  const extraMonths = Number(pricing.additionalMembershipMonthsDue || 0);
  const startMatch = /^(\d{4})-(\d{2})-01$/.exec(String(pricing.membershipStartDate || ""));
  const recurringMatch = /^(\d{4})-(\d{2})-05$/.exec(String(pricing.firstRecurringChargeDate || ""));
  const startMonthIndex = startMatch ? Number(startMatch[1]) * 12 + Number(startMatch[2]) - 1 : null;
  const recurringMonthIndex = recurringMatch ? Number(recurringMatch[1]) * 12 + Number(recurringMatch[2]) - 1 : null;
  const validDates = startMatch && recurringMatch &&
    Number(startMatch[2]) >= 1 && Number(startMatch[2]) <= 12 &&
    Number(recurringMatch[2]) >= 1 && Number(recurringMatch[2]) <= 12;
  const consecutiveMonths = Boolean(validDates) &&
    Number.isInteger(extraMonths) && extraMonths > 0 && extraMonths <= 24 &&
    recurringMonthIndex - startMonthIndex === extraMonths + 1;
  const monthName = (monthIndex) => new Date(Date.UTC(
    Math.floor(monthIndex / 12), monthIndex % 12, 1
  )).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const firstMonthLabel = consecutiveMonths
    ? `First-month membership — ${monthName(startMonthIndex)}`
    : "First-month membership";
  const additionalMonthsLabel = consecutiveMonths
    ? Array.from({ length: extraMonths }, (_, i) => monthName(startMonthIndex + i + 1)).join(", ")
    : `${extraMonths} additional unpaid month${extraMonths === 1 ? "" : "s"}`;
  const additionalMonthsCharge = Number(pricing.monthlyBalance || 0) * extraMonths;
  return { extraMonths, firstMonthLabel, additionalMonthsLabel, additionalMonthsCharge, consecutiveMonths };
}
