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
    await db.runTransaction(async (tx) => {
      const currentSnap = await tx.get(athleteRef);
      if (!currentSnap.exists) return;
      const current = currentSnap.data() || {};
      const oldLocation = clean(current.locationId);
      const primaryDiscipline = clean(
        current.primaryDiscipline || current.activeDiscipline || current.discipline
      ).toLowerCase();
      const update: Record<string, unknown> = {
        locationId,
        enrollmentIntakeId: clean(event.params.intakeId),
        enrollmentProposalId: proposalId || null,
        "placement.locationId": locationId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (primaryDiscipline) {
        update[`disciplines.${primaryDiscipline}.locationId`] = locationId;
        update[`disciplines.${primaryDiscipline}.placement.locationId`] = locationId;
      }
      tx.update(athleteRef, update);
      // The top-level location participates in historical source discovery for
      // every discipline. Invalidate all recorded discipline scopes, not just
      // the primary, when that location changes. Do not relocate secondary
      // discipline-specific assignments here.
      if (oldLocation !== locationId) {
        const nested = current.disciplines && typeof current.disciplines === "object"
          ? Object.keys(current.disciplines) : [];
        const ids = Array.isArray(current.disciplineIds) ? current.disciplineIds : [];
        const disciplines = new Set([
          ...nested, ...ids, primaryDiscipline,
          current.activeDiscipline, current.discipline,
        ].map((value) => clean(value).toLowerCase()).filter(Boolean));
        for (const discipline of disciplines) {
          // Avoid an invalid Firestore document path from malformed legacy data.
          if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(discipline)) {
            throw new Error("Invalid athlete discipline identity during location normalization.");
          }
          tx.set(athleteRef.collection("historyRevisions").doc(discipline), {
            revision: FieldValue.increment(1),
            lastMutationKind: "enrollment-location-change",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    });
  }
);
