import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * The verified enrollment intake owns new-member location identity.
 *
 * Older Management Review code can still send legacy browser placement
 * defaults. approveAndActivate already protects the athlete's top-level
 * location with intakeData.locationId; this hook closes the remaining seam by
 * normalizing the placement and initial discipline metadata to that same
 * authoritative intake location after activation.
 */
export const syncActivatedEnrollmentPlacement = onDocumentUpdated(
  "intakes/{intakeId}",
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};

    const beforeStatus = clean(before.status).toLowerCase();
    const afterStatus = clean(after.status).toLowerCase();
    const mode = clean(after.mode || "new_athlete").toLowerCase();
    const athleteUid = clean(after.approvedUid).toUpperCase();
    const locationId = clean(after.locationId);
    const proposalId = clean(after.proposalId);

    if (
      mode !== "new_athlete" ||
      afterStatus !== "approved" ||
      after.minted !== true ||
      !athleteUid ||
      !locationId ||
      (
        beforeStatus === "approved" &&
        clean(before.approvedUid).toUpperCase() === athleteUid
      )
    ) {
      return;
    }

    const athleteRef = db.doc(`athletes/${athleteUid}`);
    const athleteSnap = await athleteRef.get();

    if (!athleteSnap.exists) return;

    const athlete = athleteSnap.data() || {};
    const primaryDiscipline = clean(
      athlete.primaryDiscipline ||
      athlete.activeDiscipline ||
      athlete.discipline
    ).toLowerCase();

    const update: Record<string, unknown> = {
      locationId,
      enrollmentIntakeId: clean(event.params.intakeId),
      enrollmentProposalId: proposalId || null,
      "placement.locationId": locationId,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (primaryDiscipline) {
      update[`disciplines.${primaryDiscipline}.locationId`] =
        locationId;
      update[
        `disciplines.${primaryDiscipline}.placement.locationId`
      ] = locationId;
    }

    await athleteRef.update(update);
  }
);
