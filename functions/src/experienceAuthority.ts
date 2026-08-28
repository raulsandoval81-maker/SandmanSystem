import { HttpsError } from "firebase-functions/v2/https";

export function resolveVerifiedExperienceYears(
  appointmentData: Record<string, any>
): number {
  const assessmentStatus =
    String(
      appointmentData.assessmentStatus || ""
    )
      .trim()
      .toLowerCase();

  // No completed Coach assessment means no legacy recognition.
  // It does not prevent normal enrollment.
  if (assessmentStatus !== "completed") {
    return 0;
  }

  const verifiedYearsRaw =
    appointmentData.verifiedExperienceYears;

  // A completed assessment must contain an explicit
  // numeric Coach decision. Do not allow null, missing,
  // empty strings, or coercible values to become zero.
  if (
    typeof verifiedYearsRaw !== "number" ||
    !Number.isInteger(verifiedYearsRaw) ||
    ![0, 1, 2, 3].includes(verifiedYearsRaw)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Coach verification contains an invalid prior-experience value."
    );
  }

  const assignedCoachUid =
    String(
      appointmentData.appointmentCoachUid || ""
    ).trim();

  const assessedByCoachUid =
    String(
      appointmentData.assessedByCoachUid || ""
    ).trim();

  if (
    !assignedCoachUid ||
    !assessedByCoachUid ||
    assessedByCoachUid !== assignedCoachUid
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Coach verification does not match the assigned Coach."
    );
  }

  return verifiedYearsRaw;
}
