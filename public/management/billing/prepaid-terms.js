// Browser-only display defaults. The server independently validates the
// accepted locked agreement, exact membership allocation, and coverage dates.
export function lockedPrepaidMonths(proposal = {}) {
  const members = (Array.isArray(proposal.lockedSnapshot?.athletes)
    ? proposal.lockedSnapshot.athletes : [])
    .filter((athlete) =>
      String(athlete?.plan || "standard").trim().toLowerCase() !== "fitness"
    );
  if (!members.length) return null;
  const terms = members.map((athlete) => {
    const value = String(athlete?.billingTerm || "").trim().toLowerCase();
    if (["annual", "12_month", "twelve_month"].includes(value)) return 12;
    if (["six-month", "sixmonth", "six_month", "6_month"].includes(value)) return 6;
    return null;
  });
  return terms[0] && terms.every((term) => term === terms[0])
    ? terms[0] : null;
}

export function prepaidCoverageDates(startDate, months) {
  if (months !== 6 && months !== 12) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")) return null;
  const start = new Date(`${startDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) ||
      start.toISOString().slice(0, 10) !== startDate) return null;
  const renewal = new Date(start);
  if (months === 12) {
    renewal.setUTCFullYear(renewal.getUTCFullYear() + 1);
  } else {
    const day = renewal.getUTCDate();
    const lastDay = new Date(Date.UTC(
      renewal.getUTCFullYear(), renewal.getUTCMonth() + months + 1, 0
    )).getUTCDate();
    renewal.setUTCDate(1);
    renewal.setUTCMonth(renewal.getUTCMonth() + months);
    renewal.setUTCDate(Math.min(day, lastDay));
  }
  const paidThrough = new Date(renewal);
  paidThrough.setUTCDate(paidThrough.getUTCDate() - 1);
  return {
    paidThroughDate: paidThrough.toISOString().slice(0, 10),
    nextBillingDate: renewal.toISOString().slice(0, 10)
  };
}
