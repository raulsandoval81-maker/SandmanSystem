import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  STRIPE_SECRET_KEY,
  getStripe,
} from "../billing/stripeClient";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
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

function toCents(value: unknown): number {
  const dollars = Number(value);

  if (
    !Number.isFinite(dollars) ||
    dollars < 0
  ) {
    return 0;
  }

  return Math.round(dollars * 100);
}

export const createProposalCheckout =
  onCall(
    {
      secrets: [STRIPE_SECRET_KEY],
    },
    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to create proposal checkout."
        );
      }

      const token =
        req.auth.token as Record<string, unknown>;

      if (!hasCoachAccess(token)) {
        throw new HttpsError(
          "permission-denied",
          "Coach or administrator access is required."
        );
      }

      const proposalId =
        cleanString(req.data?.proposalId);

      if (!proposalId) {
        throw new HttpsError(
          "invalid-argument",
          "proposalId is required."
        );
      }

      const db = getFirestore();

      const proposalRef =
        db
          .collection("proposals")
          .doc(proposalId);

      const proposalSnap =
        await proposalRef.get();

      if (!proposalSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Proposal ${proposalId} was not found.`
        );
      }

      const proposal =
        proposalSnap.data() || {};

      if (cleanString(proposal.status) !== "LOCKED") {
        throw new HttpsError(
          "failed-precondition",
          "Only LOCKED proposals may begin checkout."
        );
      }

      const snapshot =
        proposal.lockedSnapshot &&
        typeof proposal.lockedSnapshot === "object"
          ? proposal.lockedSnapshot
          : null;

      if (!snapshot) {
        throw new HttpsError(
          "failed-precondition",
          "The locked proposal snapshot is missing."
        );
      }

      const pricing =
        snapshot.pricing &&
        typeof snapshot.pricing === "object"
          ? snapshot.pricing as Record<string, unknown>
          : {};

      const prospect =
        snapshot.prospect &&
        typeof snapshot.prospect === "object"
          ? snapshot.prospect as Record<string, unknown>
          : {};

      const dueNow =
        toCents(pricing.dueNow);

      const monthlyBalance =
        toCents(pricing.monthlyBalance);

      if (monthlyBalance < 50) {
        throw new HttpsError(
          "failed-precondition",
          "The locked monthly balance is invalid."
        );
      }

      const email =
        cleanString(prospect.email).toLowerCase();

      const publicBaseUrl =
        cleanString(
          process.env.SANDMAN_PUBLIC_BASE_URL
        ) || "https://www.sandmancombat.com";

      const lineItems = [];

      if (dueNow > 0) {
        lineItems.push({
          price_data: {
            currency: "usd",

            product_data: {
              name:
                `Sandman enrollment — ${proposalId}`,
            },

            unit_amount:
              dueNow,
          },

          quantity: 1,
        });
      }

      lineItems.push({
        price_data: {
          currency: "usd",

          product_data: {
            name:
              `Sandman monthly membership — ${proposalId}`,
          },

          recurring: {
            interval: "month" as const,
          },

          unit_amount:
            monthlyBalance,
        },

        quantity: 1,
      });

      try {
        const stripe = getStripe();

        const session =
          await stripe.checkout.sessions.create({
            mode: "subscription",

            line_items:
              lineItems,

            customer_email:
              email && email.includes("@")
                ? email
                : undefined,

            success_url:
              `${publicBaseUrl}/billing/success/?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url:
              `${publicBaseUrl}/billing/cancel/`,

            client_reference_id:
              proposalId,

            metadata: {
              proposalId,
              source:
                "admissions_proposal",
            },

            subscription_data: {
              metadata: {
                proposalId,
                source:
                  "admissions_proposal",
              },
            },

            allow_promotion_codes:
              false,
          });

        if (!session.url) {
          throw new Error(
            "Stripe did not return a Checkout Session URL."
          );
        }

        await proposalRef.update({
          pendingCheckoutSessionId:
            session.id,

          checkoutStartedAt:
            FieldValue.serverTimestamp(),

          checkoutStartedBy:
            req.auth.uid,

          updatedAt:
            FieldValue.serverTimestamp(),

          updatedBy:
            req.auth.uid,
        });

        return {
          ok: true,
          proposalId,
          status: "LOCKED",
          checkoutSessionId:
            session.id,
          checkoutUrl:
            session.url,
        };
      } catch (error) {
        console.error(
          "[createProposalCheckout] Failed:",
          error
        );

        throw new HttpsError(
          "internal",
          error instanceof Error
            ? error.message
            : "Unable to create proposal checkout."
        );
      }
    }
  );
