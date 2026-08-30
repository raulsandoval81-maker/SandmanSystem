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

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "./proposalAccess";

import {
  handleProposalCheckoutCompleted,
} from "../billing/webhook";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
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

      const actorUid =
        req.auth.uid;

      const staffAccess =
        await requireProposalStaffAccess(
          req.auth.uid
        );

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

      requireProposalLocationAccess(
        staffAccess,
        proposal.locationId
      );

      const proposalStatus =
        cleanString(proposal.status);

      const existingCheckoutSessionId =
        cleanString(
          proposal.pendingCheckoutSessionId
        );

      if (
        proposalStatus !==
          "READY_FOR_CHECKOUT" &&
        proposalStatus !==
          "CHECKOUT_CREATED"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Only checkout-ready or active-checkout proposals may use checkout."
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

        let replacingExpiredSessionId:
          string | null = null;

        if (
          proposalStatus ===
            "CHECKOUT_CREATED" &&
          existingCheckoutSessionId
        ) {
          const existingSession =
            await stripe.checkout.sessions.retrieve(
              existingCheckoutSessionId
            );

          if (
            existingSession.status ===
              "open" &&
            existingSession.url
          ) {
            return {
              ok: true,
              proposalId,
              status:
                "CHECKOUT_CREATED",
              checkoutSessionId:
                existingSession.id,
              checkoutUrl:
                existingSession.url,
              resumed:
                true,
            };
          }

          if (
            existingSession.payment_status ===
              "paid"
          ) {
            await handleProposalCheckoutCompleted(
              existingSession
            );

            return {
              ok: true,
              proposalId,
              status: "PAID",
              checkoutSessionId:
                existingSession.id,
              reconciled: true,
            };
          }

          if (
            existingSession.status ===
              "complete"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Stripe checkout is complete but payment is not confirmed as paid."
            );
          }

          if (
            existingSession.status ===
              "expired"
          ) {
            replacingExpiredSessionId =
              existingSession.id;
          } else {
            throw new HttpsError(
              "failed-precondition",
              `Existing Stripe checkout is ${existingSession.status || "unavailable"}.`
            );
          }
        }

        const checkoutIdempotencyKey =
          replacingExpiredSessionId
            ? `proposal-checkout-retry-${proposalId}-${replacingExpiredSessionId}`
            : `proposal-checkout-${proposalId}`;

        const session =
          await stripe.checkout.sessions.create({
            mode: "subscription",


            payment_method_types: ["card"],

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
          }, {
            idempotencyKey:
              checkoutIdempotencyKey,
          });

        if (!session.url) {
          throw new Error(
            "Stripe did not return a Checkout Session URL."
          );
        }

        await db.runTransaction(
          async (tx) => {
            const currentSnap =
              await tx.get(proposalRef);

            if (!currentSnap.exists) {
              throw new HttpsError(
                "not-found",
                `Proposal ${proposalId} was not found.`
              );
            }

            const currentProposal =
              currentSnap.data() || {};

            const currentStatus =
              cleanString(
                currentProposal.status
              );

            const currentSessionId =
              cleanString(
                currentProposal
                  .pendingCheckoutSessionId
              );

            if (
              currentStatus ===
                "CHECKOUT_CREATED" &&
              currentSessionId === session.id
            ) {
              return;
            }

            const isReplacingExpiredCheckout =
              currentStatus ===
                "CHECKOUT_CREATED" &&
              Boolean(
                replacingExpiredSessionId
              ) &&
              currentSessionId ===
                replacingExpiredSessionId;

            if (
              currentStatus !==
                "READY_FOR_CHECKOUT" &&
              !isReplacingExpiredCheckout
            ) {
              throw new HttpsError(
                "failed-precondition",
                `Proposal ${proposalId} is no longer eligible for this checkout session.`
              );
            }

            const historyRef =
              proposalRef
                .collection("history")
                .doc();

            tx.update(
              proposalRef,
              {
                status:
                  "CHECKOUT_CREATED",

                pendingCheckoutSessionId:
                  session.id,

                checkoutStartedAt:
                  FieldValue.serverTimestamp(),

                checkoutStartedBy:
                  actorUid,

                updatedAt:
                  FieldValue.serverTimestamp(),

                updatedBy:
                  actorUid,
              }
            );

            tx.create(
              historyRef,
              {
                proposalId,

                event:
                  isReplacingExpiredCheckout
                    ? "CHECKOUT_RESTARTED"
                    : "STATUS_CHANGED",

                fromStatus:
                  isReplacingExpiredCheckout
                    ? "CHECKOUT_CREATED"
                    : "READY_FOR_CHECKOUT",

                toStatus:
                  "CHECKOUT_CREATED",

                replacedCheckoutSessionId:
                  isReplacingExpiredCheckout
                    ? replacingExpiredSessionId
                    : null,

                createdBy:
                  actorUid,

                createdByName:
                  cleanString(
                    snapshot.coach &&
                    typeof snapshot.coach ===
                      "object"
                      ? (
                          snapshot.coach as
                            Record<string, unknown>
                        ).name
                      : ""
                  ) || null,

                createdAt:
                  FieldValue.serverTimestamp(),
              }
            );
          }
        );

        return {
          ok: true,
          proposalId,
          status: "CHECKOUT_CREATED",
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
