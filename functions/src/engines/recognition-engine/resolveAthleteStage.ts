export type AthleteStage =
  | "STRIPE_PROGRESS"
  | "TEMPLE"
  | "TEST_ELIGIBLE"
  | "TEST_SCHEDULED"
  | "TESTING"
  | "PROMOTION"
  | "COOLDOWN"
  | "CEREMONY"
  | "DONE";

function num(v: any): number {
  return Number(v ?? 0);
}

function normalize(v: any): string {
  return String(v ?? "").trim().toLowerCase();
}

function hasPassedTest(a: any): boolean {
  return normalize(a?.testing?.lastTestResult) === "pass";
}

function isTestingActive(a: any): boolean {
  return normalize(a?.testing?.state) === "active";
}

function inCooldown(a: any): boolean {
  return Boolean(
    a?.cooldownUntil &&
    new Date(a.cooldownUntil).getTime() > Date.now()
  );
}

function isTemple(a: any): boolean {
  const xp = num(a.xp);
  const cap = num(a.xpCap);
  const ratio = cap > 0 ? xp / cap : 0;

  return ratio >= 0.9 && !a?.testing?.testScheduledAt;
}

function isTestEligible(a: any): boolean {
  return Boolean(
    a?.testing?.testEligibleAt &&
    !a?.testing?.testScheduledAt
  );
}

function isTestScheduled(a: any): boolean {
  return Boolean(a?.testing?.testScheduledAt);
}

function isCeremony(a: any): boolean {
  return Boolean(
    a?.promotionCompletedAt &&
    !a?.ceremonyCompletedAt
  );
}

export function resolveAthleteStage(a: any): AthleteStage {
  const stripe = num(a.stripeCount ?? a.stripe ?? 0);

  // 💤 1. COOLDOWN (highest priority safe state)
  if (inCooldown(a)) {
    return "COOLDOWN";
  }

  // 🏆 2. CEREMONY (post-promotion recognition)
  if (isCeremony(a)) {
    return "CEREMONY";
  }

  // ⬆ 3. PROMOTION (passed test, awaiting transition)
  if (hasPassedTest(a)) {
    return "PROMOTION";
  }

  // 🧪 4. TESTING (active evaluation)
  if (isTestingActive(a)) {
    return "TESTING";
  }

  // 🔵 5. TEST SCHEDULED (locked in)
  if (isTestScheduled(a)) {
    return "TEST_SCHEDULED";
  }

  // 🟡 6. TEST ELIGIBLE (coach can act)
  if (isTestEligible(a)) {
    return "TEST_ELIGIBLE";
  }

  // 🟠 7. TEMPLE (readiness pressure zone)
  if (isTemple(a)) {
    return "TEMPLE";
  }

  // 🟢 8. STRIPE PROGRESSION (default active loop)
  if (stripe > 0) {
    return "STRIPE_PROGRESS";
  }

  return "DONE";
}