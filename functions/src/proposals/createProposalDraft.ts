import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  ProposalDraft,
} from "./proposalTypes";

import {
  requireProposalStaffAccess,
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

function pad6(value: number): string {
  return String(value).padStart(6, "0");
}

export const createProposalDraft =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to create a proposal."
      );
    }

    const staffAccess =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const data = req.data || {};

    const appointmentId =
      nullableString(data.appointmentId);

    const admissionsRequestId =
      nullableString(data.admissionsRequestId);

    if (!appointmentId && !admissionsRequestId) {
      throw new HttpsError(
        "invalid-argument",
        "An appointmentId or admissionsRequestId is required."
      );
    }

    const familyName =
      nullableString(
        data.prospect?.familyName ||
        data.familyName
      );

    const primaryContactName =
      nullableString(
        data.prospect?.primaryContactName ||
        data.primaryContactName
      );

    const email =
      nullableString(
        cleanEmail(
          data.prospect?.email ||
          data.email
        )
      );

    const phone =
      nullableString(
        data.prospect?.phone ||
        data.phone
      );

    const coachName =
      nullableString(
        data.coach?.name ||
        staffAccess.fullName
      );

    const athletes =
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

    const internalNotes =
      nullableString(data.internalNotes);

    const callerUid =
      req.auth.uid;

    const db =
      getFirestore();

    const counterRef =
      db
        .collection("counters")
        .doc("proposals");

    try {
      const result =
        await db.runTransaction(
          async (tx) => {
            const counterSnap =
              await tx.get(counterRef);

            const current =
              counterSnap.exists
                ? Number(
                    counterSnap.get("next") ||
                    1
                  )
                : 1;

            if (
              !Number.isInteger(current) ||
              current < 1
            ) {
              throw new HttpsError(
                "failed-precondition",
                "The proposal counter is invalid."
              );
            }

            const proposalId =
              `P-${pad6(current)}`;

            const proposalRef =
              db
                .collection("proposals")
                .doc(proposalId);

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            const proposalData:
              ProposalDraft &
              Record<string, unknown> = {
                proposalId,
                status: "DRAFT",

                prospect: {
                  appointmentId,
                  admissionsRequestId,
                  familyName,
                  primaryContactName,
                  email,
                  phone,
                },

                coach: {
                  uid: callerUid,
                  name: coachName,
                },

                athletes,
                pricing,
                agreement,
                internalNotes,

                createdBy:
                  callerUid,

                updatedBy:
                  callerUid,

                createdAt:
                  FieldValue.serverTimestamp(),

                updatedAt:
                  FieldValue.serverTimestamp(),
              };

            tx.set(
              counterRef,
              {
                next:
                  current + 1,

                updatedAt:
                  FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              }
            );

            tx.create(
              proposalRef,
              proposalData
            );

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  "CREATED",

                fromStatus:
                  null,

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
        "[createProposalDraft] Failed:",
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to create the proposal draft."
      );
    }
  });
