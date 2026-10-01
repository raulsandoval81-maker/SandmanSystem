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

  // No completed legacy Coach assessment means no legacy recognition.
  // Normal enrollment must continue; current Coach assessment happens
  // after athlete activation in the assessment pipeline.
  if (assessmentStatus !== "completed") {
    return 0;
  }

  const verifiedYearsRaw =
    appointmentData.verifiedExperienceYears;

  // Legacy appointment records can contain a completed status without a
  // valid prior-experience value. Fail closed on recognition, not on
  // athlete activation. A malformed legacy value earns 0 recognition and
  // can be handled by the current post-activation Coach assessment flow.
  if (
    typeof verifiedYearsRaw !== "number" ||
    !Number.isInteger(verifiedYearsRaw) ||
    ![0, 1, 2, 3].includes(verifiedYearsRaw)
  ) {
    console.warn(
      "[experienceAuthority] Ignoring invalid legacy prior-experience value during activation."
    );
    return 0;
  }

  // Zero means Coach explicitly verified no prior-experience recognition.
  // Do not make a zero-recognition record depend on legacy Coach UID fields.
  if (verifiedYearsRaw === 0) {
    return 0;
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
