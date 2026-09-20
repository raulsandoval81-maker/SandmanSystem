import type Stripe from "stripe";

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  Timestamp,
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
  hashProposalReviewToken,
} from "./proposalClientReview";

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
      const proposalId =
        cleanString(req.data?.proposalId);

      const clientToken =
        cleanString(req.data?.token);

      const isClientCheckout =
        Boolean(clientToken);

      if (
        !isClientCheckout &&
        !req.auth
      ) {
        throw new HttpsError(
          "unauthenticated",
          "A valid checkout link or staff sign-in is required."
        );
      }

      const actorUid =
        isClientCheckout
          ? "client"
          : req.auth!.uid;

      const staffAccess =
        !isClientCheckout &&
        req.auth
          ? await requireProposalStaffAccess(
              req.auth.uid
            )
          : null;

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

      if (staffAccess) {
        requireProposalLocationAccess(
          staffAccess,
          proposal.locationId
        );
      } else {
        const review =
          proposal.clientReview || {};

        const tokenMatches =
          clientToken &&
          hashProposalReviewToken(
            clientToken
          ) ===
            cleanString(
              review.tokenHash
            );

        if (!tokenMatches) {
          throw new HttpsError(
            "permission-denied",
            "This checkout link is invalid."
          );
        }

        const expiresAt =
          review.expiresAt;

        if (
          !(expiresAt instanceof Timestamp) ||
          expiresAt.toMillis() <
            Date.now()
        ) {
          throw new HttpsError(
            "failed-precondition",
            "This checkout link has expired."
          );
        }
      }

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

      const firstRecurringChargeDate =
        cleanString(
          pricing.firstRecurringChargeDate
        );

      const recurringBillingDay =
        Number(
          pricing.recurringBillingDay
        );

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          firstRecurringChargeDate
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The locked first recurring charge date is invalid."
        );
      }

      const [
        recurringYear,
        recurringMonth,
        recurringDay,
      ] =
        firstRecurringChargeDate
          .split("-")
          .map(Number);

      const firstRecurringChargeMs =
        Date.UTC(
          recurringYear,
          recurringMonth - 1,
          recurringDay,
          12,
          0,
          0
        );

      const validatedRecurringDate =
        new Date(
          firstRecurringChargeMs
        );

      if (
        validatedRecurringDate.getUTCFullYear() !==
          recurringYear ||
        validatedRecurringDate.getUTCMonth() !==
          recurringMonth - 1 ||
        validatedRecurringDate.getUTCDate() !==
          recurringDay ||
        recurringBillingDay !== 5 ||
        recurringDay !== 5
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The locked recurring billing schedule is invalid."
        );
      }

      const firstRecurringChargeUnix =
        Math.floor(
          firstRecurringChargeMs / 1000
        );

      if (
        firstRecurringChargeUnix <=
        Math.floor(Date.now() / 1000)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The first recurring charge date must be in the future."
        );
      }

      if (dueNow < 50) {
        throw new HttpsError(
          "failed-precondition",
          "This proposal has no payable amount due now. A no-charge enrollment requires a separate Management billing path."
        );
      }

      const email =
        cleanString(prospect.email).toLowerCase();

      const publicBaseUrl =
        cleanString(
          process.env.SANDMAN_PUBLIC_BASE_URL
        ) || "https://www.sandmancombat.com";

      const rawCatalogItems =
        Array.isArray(
          pricing.stripeCatalogItems
        )
          ? pricing.stripeCatalogItems
          : [];

      if (rawCatalogItems.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "The locked proposal does not contain Stripe catalog membership items. Rebuild and approve the proposal before checkout."
        );
      }

      const catalogItems =
        rawCatalogItems.map(
          (rawItem, index) => {
            if (
              !rawItem ||
              typeof rawItem !== "object"
            ) {
              throw new HttpsError(
                "failed-precondition",
                `Stripe catalog item ${index + 1} is invalid.`
              );
            }

            const item =
              rawItem as Record<
                string,
                unknown
              >;

            const lookupKey =
              cleanString(
                item.lookupKey
              );

            if (
              ![
                "sandman_academy-2026-v3_",
                "sandman_academy-2026-v4_",
              ].some((prefix) =>
                lookupKey.startsWith(prefix)
              )
            ) {
              throw new HttpsError(
                "failed-precondition",
                `Stripe catalog item ${index + 1} has an invalid lookup key.`
              );
            }

            if (
              item.recurring !== true
            ) {
              throw new HttpsError(
                "failed-precondition",
                `Stripe catalog item ${lookupKey} is not marked recurring.`
              );
            }

            const expectedAmount =
              toCents(item.amount);

            if (expectedAmount < 50) {
              throw new HttpsError(
                "failed-precondition",
                `Stripe catalog item ${lookupKey} has an invalid amount.`
              );
            }

            const rawQuantity =
              Number(
                item.quantity ?? 1
              );

            const quantity =
              Number.isInteger(
                rawQuantity
              ) &&
              rawQuantity > 0
                ? rawQuantity
                : 1;

            return {
              lookupKey,
              expectedAmount,
              quantity,
            };
          }
        );

      const lockedCatalogMonthlyTotal =
        catalogItems.reduce(
          (total, item) =>
            total +
            (
              item.expectedAmount *
              item.quantity
            ),
          0
        );

      if (
        lockedCatalogMonthlyTotal !==
        monthlyBalance
      ) {
        throw new HttpsError(
          "failed-precondition",
          `The locked monthly balance does not match the approved Stripe catalog total. Expected ${lockedCatalogMonthlyTotal} cents but found ${monthlyBalance} cents.`
        );
      }

      try {
        const stripe = getStripe();

        const lineItems:
          Stripe.Checkout.SessionCreateParams.LineItem[] =
          [];

        if (dueNow > 0) {
          lineItems.push({
            price_data: {
              currency: "usd",

              product_data: {
                name:
                  `Sandman enrollment payment — ${proposalId}`,
              },

              unit_amount:
                dueNow,
            },

            quantity: 1,
          });
        }

        for (
          const item of catalogItems
        ) {
          const prices =
            await stripe.prices.list({
              lookup_keys: [
                item.lookupKey,
              ],

              active: true,

              limit: 10,
            });

          if (
            prices.data.length !== 1
          ) {
            throw new HttpsError(
              "failed-precondition",
              `Unable to resolve exactly one active Stripe Price for ${item.lookupKey}.`
            );
          }

          const price =
            prices.data[0];

          if (
            !price.active ||
            price.currency !== "usd" ||
            price.type !== "recurring" ||
            !price.recurring ||
            price.recurring.interval !==
              "month" ||
            price.recurring.interval_count !==
              1 ||
            price.unit_amount === null
          ) {
            throw new HttpsError(
              "failed-precondition",
              `Stripe Price ${item.lookupKey} is not an active monthly USD recurring price.`
            );
          }

          if (
            price.unit_amount !==
            item.expectedAmount
          ) {
            throw new HttpsError(
              "failed-precondition",
              `Stripe Price ${item.lookupKey} does not match the locked proposal amount.`
            );
          }

          /*
           * Recurring membership is intentionally not
           * added to today's Checkout Session.
           *
           * The Stripe webhook creates the subscription
           * after the enrollment payment succeeds.
           */

        }



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

          const currentBillingFlow =
            cleanString(
              existingSession.metadata
                ?.billingFlowVersion
            ) ===
              "payment_then_subscription_v1" &&
            existingSession.mode ===
              "payment";

          if (
            existingSession.status ===
              "open" &&
            existingSession.url &&
            currentBillingFlow
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
            existingSession.status ===
              "open" &&
            !currentBillingFlow
          ) {
            await stripe.checkout.sessions.expire(
              existingSession.id
            );

            replacingExpiredSessionId =
              existingSession.id;
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
          } else if (
            !replacingExpiredSessionId
          ) {
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
            mode: "payment",

            customer_creation:
              "always",


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

              billingFlowVersion:
                "payment_then_subscription_v1",

              firstRecurringChargeDate,

              recurringBillingDay:
                String(
                  recurringBillingDay
                ),
            },

            payment_intent_data: {
              setup_future_usage:
                "off_session",

              metadata: {
                proposalId,
                source:
                  "admissions_proposal",

                billingFlowVersion:
                  "payment_then_subscription_v1",
              },
            },

            custom_text: {
              submit: {
                message:
                  `Today's payment covers the approved enrollment payment. Your recurring membership of $${(
                    monthlyBalance / 100
                  ).toFixed(
                    2
                  )}/month begins ${firstRecurringChargeDate} and bills on the 5th of each month.`,
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

                checkoutStartedByType:
                  isClientCheckout
                    ? "client"
                    : "staff",

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
                    snapshot.preparedBy &&
                    typeof snapshot.preparedBy ===
                      "object"
                      ? (
                          snapshot.preparedBy as
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

        if (error instanceof HttpsError) {
          throw error;
        }

        throw new HttpsError(
          "internal",
          error instanceof Error
            ? error.message
            : "Unable to create proposal checkout."
        );
      }
    }
  );
