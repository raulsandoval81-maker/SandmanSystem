export type OnboardingIntakeAudience =
  | "parent_guardian"
  | "adult_athlete";

export function onboardingRelationshipFields(
  value: unknown
): { intakeAudience?: OnboardingIntakeAudience } {
  const intakeAudience =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    intakeAudience !== "parent_guardian" &&
    intakeAudience !== "adult_athlete"
  ) {
    return {};
  }

  return {
    intakeAudience,
  };
}
