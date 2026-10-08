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

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function moneyCents(
  value: unknown,
  field: string
): number {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a whole number of cents.`
    );
  }

  return parsed;
}

export const configureProposalMembershipChoice =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in."
      );
    }

    const staff =
      await requireProposalStaffAccess(
        req.auth.uid
      );

    const proposalId =
      clean(req.data?.proposalId);

    if (!proposalId) {
      throw new HttpsError(
        "invalid-argument",
        "proposalId is required."
      );
    }

    const option1 = {
      id: "month_to_month",
      title:
        clean(req.data?.option1?.title) ||
        "Month-to-Month",
      monthlyCents:
        moneyCents(
          req.data?.option1?.monthlyCents,
          "option1.monthlyCents"
        ),
      dueNowCents:
        moneyCents(
          req.data?.option1?.dueNowCents,
          "option1.dueNowCents"
        ),
      billingTerm:
        "month_to_month",
      paymentMethodLabel:
        clean(
          req.data?.option1
            ?.paymentMethodLabel
        ) || "Cash or check",
      note:
        clean(req.data?.option1?.note),
    };

    const option2 = {
      id: "twelve_month",
      title:
        clean(req.data?.option2?.title) ||
        "12-Month Recurring Membership",
      monthlyCents:
        moneyCents(
          req.data?.option2?.monthlyCents,
          "option2.monthlyCents"
        ),
      dueNowCents:
        moneyCents(
          req.data?.option2?.dueNowCents,
          "option2.dueNowCents"
        ),
      billingTerm:
        "12_month",
      paymentMethodLabel:
        clean(
          req.data?.option2
            ?.paymentMethodLabel
        ) || "Recurring digital billing",
      note:
        clean(req.data?.option2?.note),
    };

    const contextNote =
      clean(req.data?.contextNote);

    const db = getFirestore();

    const ref =
      db.collection("proposals")
        .doc(proposalId);

    await db.runTransaction(
      async (tx) => {
        const snap = await tx.get(ref);

        if (!snap.exists) {
          throw new HttpsError(
            "not-found",
            "Proposal not found."
          );
        }

        const proposal =
          snap.data() || {};

        requireProposalLocationAccess(
          staff,
          proposal.locationId
        );

        if (
          proposal.status !==
          "AWAITING_CLIENT_SIGNATURE"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Membership choices can only be attached while the proposal is awaiting client review."
          );
        }

        const request = {
          active: true,
          options: [
            option1,
            option2,
          ],
          contextNote:
            contextNote || null,
          issuedBy:
            req.auth!.uid,
          issuedByName:
            staff.fullName,
          issuedAt:
            FieldValue.serverTimestamp(),
        };

        const history =
          ref.collection("history").doc();

        tx.update(
          ref,
          {
            membershipChoiceRequest:
              request,
            membershipChoiceResponse:
              FieldValue.delete(),
            updatedBy:
              req.auth!.uid,
            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        tx.create(
          history,
          {
            proposalId,
            event:
              "MEMBERSHIP_CHOICE_REQUESTED",
            options: [
              option1,
              option2,
            ],
            contextNote:
              contextNote || null,
            createdBy:
              req.auth!.uid,
            createdByName:
              staff.fullName,
            createdAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );

    return {
      ok: true,
      proposalId,
    };
  });
