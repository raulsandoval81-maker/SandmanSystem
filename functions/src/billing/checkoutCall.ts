import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  createSubscriptionCheckout,
} from "./checkout";

import {
  STRIPE_SECRET_KEY,
} from "./stripeClient";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanEmail(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function hasCoachAccess(
  token: Record<string, unknown>
): boolean {
  return (
    token.admin === true ||
    token.coach === true ||
    token.role === "admin" ||
    token.role === "coach"
  );
}

export const createBillingCheckoutCall =
  onCall(
    {
      secrets: [STRIPE_SECRET_KEY],
    },
    async (req) => {
if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to begin billing checkout."
      );
    }

    const familyId =
      cleanString(req.data?.familyId);

    if (!familyId) {
      throw new HttpsError(
        "invalid-argument",
        "A familyId is required."
      );
    }

    const db = getFirestore();

    const familyRef =
      db.collection("families").doc(familyId);

    const familySnap =
      await familyRef.get();

    if (!familySnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Family setup is required before billing can begin."
      );
    }

    const family =
      familySnap.data() || {};

    const callerUid =
      req.auth.uid;

    const token =
      req.auth.token as Record<string, unknown>;

    const parentUids = Array.isArray(
      family.parentUids
    )
      ? family.parentUids.map(cleanString)
      : [];

    const primaryParentUid =
      cleanString(family.primaryParentUid);

    const callerIsParent =
      primaryParentUid === callerUid ||
      parentUids.includes(callerUid);

    const callerIsCoach =
      hasCoachAccess(token);

    if (!callerIsParent && !callerIsCoach) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this family billing account."
      );
    }

    const familyName =
      cleanString(
        family.familyName ||
        family.name ||
        family.primaryContact?.name
      );

    const email =
      cleanEmail(
        family.billingEmail ||
        family.primaryContact?.email ||
        family.email
      );

    const stripePriceId =
      cleanString(
        family.stripePriceId ||
        family.billing?.stripePriceId
      );

    const stripeCustomerId =
      cleanString(
        family.stripeCustomerId ||
        family.billing?.stripeCustomerId
      ) || null;

    if (!familyName) {
      throw new HttpsError(
        "failed-precondition",
        "The family record is missing a billing name."
      );
    }

    if (!email || !email.includes("@")) {
      throw new HttpsError(
        "failed-precondition",
        "The family record is missing a valid billing email."
      );
    }

    if (!stripePriceId) {
      throw new HttpsError(
        "failed-precondition",
        "A membership plan must be assigned before checkout."
      );
    }

    const publicBaseUrl =
      cleanString(
        process.env.SANDMAN_PUBLIC_BASE_URL
      ) || "https://www.sandmancombat.com";

    try {
      const result =
        await createSubscriptionCheckout({
          familyId,
          familyName,
          email,
          priceId: stripePriceId,
          stripeCustomerId,
          successUrl:
            `${publicBaseUrl}/billing/success/`,
          cancelUrl:
            `${publicBaseUrl}/billing/cancel/`,
        });

      await familyRef.set(
        {
          stripeCustomerId:
            result.stripeCustomerId,

          billing: {
            stripeCustomerId:
              result.stripeCustomerId,

            pendingCheckoutSessionId:
              result.checkoutSessionId,

            checkoutStartedAt:
              FieldValue.serverTimestamp(),

            checkoutStartedBy:
              callerUid,
          },

          updatedAt:
            FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        ok: true,
        familyId,
        checkoutSessionId:
          result.checkoutSessionId,
        checkoutUrl:
          result.checkoutUrl,
      };
    } catch (error) {
      console.error(
        "[createBillingCheckoutCall] Checkout failed:",
        error
      );

      throw new HttpsError(
        "internal",
        error instanceof Error
          ? error.message
          : "Unable to create billing checkout."
      );
    }
  }
);
