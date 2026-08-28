import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function nullableString(
  value: unknown
): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

export const updateProposalDraft =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to update a proposal."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const data = req.data || {};

    const proposalId =
      cleanString(data.proposalId);

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    const athletes: unknown[] =
      Array.isArray(data.athletes)
        ? data.athletes
        : [];

    const pricing =
      data.pricing &&
      typeof data.pricing === "object"
        ? data.pricing
        : {};

    const agreement =
      data.agreement &&
      typeof data.agreement === "object"
        ? data.agreement
        : {};

    const coachName =
      nullableString(
        data.coach?.name ||
        staffAccess.fullName
      );

    const callerUid =
      req.auth.uid;

    const db =
      getFirestore();

    const proposalRef =
      db
        .collection("proposals")
        .doc(proposalId);

    try {
      const result =
        await db.runTransaction(
          async (tx) => {
            const proposalSnap =
              await tx.get(proposalRef);

            if (!proposalSnap.exists) {
              throw new HttpsError(
                "not-found",
                `Proposal ${proposalId} was not found.`
              );
            }

            const existing =
              proposalSnap.data() || {};

            requireProposalLocationAccess(
              staffAccess,
              existing.locationId
            );

            const currentStatus =
              cleanString(existing.status);

            if (currentStatus !== "DRAFT") {
              throw new HttpsError(
                "failed-precondition",
                "Only DRAFT proposals may be edited."
              );
            }

            const existingProspect =
              existing.prospect &&
              typeof existing.prospect === "object"
                ? existing.prospect as
                    Record<string, unknown>
                : {};

            const incomingProspect =
              data.prospect &&
              typeof data.prospect === "object"
                ? data.prospect as
                    Record<string, unknown>
                : {};

            const prospect = {
              appointmentId:
                nullableString(
                  incomingProspect.appointmentId
                ) ??
                nullableString(
                  existingProspect.appointmentId
                ),

              admissionsRequestId:
                nullableString(
                  incomingProspect.admissionsRequestId
                ) ??
                nullableString(
                  existingProspect.admissionsRequestId
                ),

              familyName:
                nullableString(
                  incomingProspect.familyName
                ) ??
                nullableString(
                  existingProspect.familyName
                ),

              primaryContactName:
                nullableString(
                  incomingProspect.primaryContactName
                ) ??
                nullableString(
                  existingProspect.primaryContactName
                ),

              email:
                nullableString(
                  cleanEmail(
                    incomingProspect.email
                  )
                ) ??
                nullableString(
                  cleanEmail(
                    existingProspect.email
                  )
                ),

              phone:
                nullableString(
                  incomingProspect.phone
                ) ??
                nullableString(
                  existingProspect.phone
                ),

              city:
                nullableString(
                  incomingProspect.city
                ) ??
                nullableString(
                  existingProspect.city
                ),

              state:
                nullableString(
                  incomingProspect.state
                ) ??
                nullableString(
                  existingProspect.state
                ),
            };

            const existingAthletes: unknown[] =
              Array.isArray(existing.athletes)
                ? existing.athletes
                : [];

            const proposalAthletes =
              athletes.map((athlete, index) => {
                if (
                  index !== 0 ||
                  !athlete ||
                  typeof athlete !== "object" ||
                  Array.isArray(athlete)
                ) {
                  return athlete;
                }

                const incomingAthlete =
                  athlete as Record<string, unknown>;

                const existingAthlete =
                  existingAthletes[0] &&
                  typeof existingAthletes[0] === "object" &&
                  !Array.isArray(existingAthletes[0])
                    ? existingAthletes[0] as
                        Record<string, unknown>
                    : {};

                return {
                  ...incomingAthlete,

                  dob:
                    nullableString(
                      incomingAthlete.dob ||
                      incomingAthlete.dateOfBirth ||
                      existingAthlete.dob ||
                      existingAthlete.dateOfBirth
                    ),
                };
              });

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                prospect,

                coach: {
                  uid:
                    callerUid,

                  name:
                    coachName,
                },

                athletes:
                  proposalAthletes,
                pricing,
                agreement,

                internalNotes:
                  nullableString(
                    data.internalNotes
                  ),

                updatedBy:
                  callerUid,

                updatedAt:
                  FieldValue.serverTimestamp(),
              }
            );

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  "UPDATED",

                fromStatus:
                  "DRAFT",

                toStatus:
                  "DRAFT",

                createdBy:
                  callerUid,

                createdByName:
                  coachName,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );

            return {
              proposalId,
              status:
                "DRAFT" as const,
            };
          }
        );

      return {
        ok: true,
        ...result,
      };
    } catch (error) {
      console.error(
        "[updateProposalDraft] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to update the proposal draft."
      );
    }
  });
