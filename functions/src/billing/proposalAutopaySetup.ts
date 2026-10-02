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
} from "./stripeClient";

import {
  requireProposalStaffAccess,
  requireProposalLocationAccess,
} from "../proposals/proposalAccess";

import {
  resolveLockedRecurringPricing,
} from "../proposals/lockedRecurringPricing";

import {
  ensureProposalMonthlySponsorCoupon,
  recoverOrCreateProposalSubscription,
} from "./proposalMonthlySponsor";

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function proposalEmail(proposal: Record<string, any>): string {
  const snapshot =
    proposal.lockedSnapshot &&
    typeof proposal.lockedSnapshot === "object"
      ? proposal.lockedSnapshot
      : {};

  const prospect =
    snapshot.prospect &&
    typeof snapshot.prospect === "object"
      ? snapshot.prospect
      : {};

  return cleanString(
    prospect.email ||
    proposal.prospect?.email ||
    proposal.email
  ).toLowerCase();
}

function proposalName(proposal: Record<string, any>): string {
  const snapshot =
    proposal.lockedSnapshot &&
    typeof proposal.lockedSnapshot === "object"
      ? proposal.lockedSnapshot
      : {};

  const prospect =
    snapshot.prospect &&
    typeof snapshot.prospect === "object"
      ? snapshot.prospect
      : {};

  return cleanString(
    prospect.familyName ||
    prospect.primaryContactName ||
    proposal.prospect?.familyName ||
    proposal.prospect?.primaryContactName
  ) || "Sandman Family";
}

function getLockedPricing(
  proposal: Record<string, any>
): Record<string, unknown> {
  const snapshot =
    proposal.lockedSnapshot &&
    typeof proposal.lockedSnapshot === "object"
      ? proposal.lockedSnapshot as Record<string, unknown>
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

  return pricing;
}

function nextBillingUnix(
  proposal: Record<string, any>
): number {
  const value =
    proposal.cashPrepayment?.nextBillingDate ||
    proposal.nextBillingDate;

  let millis = 0;

  if (value instanceof Timestamp) {
    millis = value.toMillis();
  } else if (
    value &&
    typeof value?.toMillis === "function"
  ) {
    millis = value.toMillis();
  } else if (value) {
    millis = new Date(value).getTime();
  }

  if (!Number.isFinite(millis) || millis <= 0) {
    throw new HttpsError(
      "failed-precondition",
      "Cash prepayment is missing a valid Stripe takeover date."
    );
  }

  const unix =
    Math.floor(millis / 1000);

  if (
    unix <=
    Math.floor(Date.now() / 1000)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The Stripe takeover date must still be in the future."
    );
  }

  return unix;
}

async function recurringItems(
  stripe: Stripe,
  proposalId: string,
  pricing: Record<string, unknown>
): Promise<{
  items: Stripe.SubscriptionCreateParams.Item[];
  catalogMonthlyTotal: number;
}> {
  const rawCatalogItems =
    Array.isArray(pricing.stripeCatalogItems)
      ? pricing.stripeCatalogItems
      : [];

  if (!rawCatalogItems.length) {
    throw new HttpsError(
      "failed-precondition",
      "The locked proposal does not contain recurring Stripe catalog items."
    );
  }

  const items:
    Stripe.SubscriptionCreateParams.Item[] = [];

  let catalogMonthlyTotal = 0;

  for (
    let index = 0;
    index < rawCatalogItems.length;
    index += 1
  ) {
    const rawItem =
      rawCatalogItems[index];

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
      rawItem as Record<string, unknown>;

    const lookupKey =
      cleanString(item.lookupKey);

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

    const expectedAmount =
      Math.round(
        Number(item.amount) * 100
      );

    if (
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount < 50
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe catalog item ${lookupKey} has an invalid amount.`
      );
    }

    const rawQuantity =
      Number(item.quantity ?? 1);

    const quantity =
      Number.isInteger(rawQuantity) &&
      rawQuantity > 0
        ? rawQuantity
        : 1;

    const prices =
      await stripe.prices.list({
        lookup_keys: [lookupKey],
        active: true,
        limit: 10,
      });

    if (prices.data.length !== 1) {
      throw new HttpsError(
        "failed-precondition",
        `Unable to resolve exactly one active Stripe Price for ${lookupKey}.`
      );
    }

    const price =
      prices.data[0];

    if (
      !price.active ||
      price.currency !== "usd" ||
      price.type !== "recurring" ||
      !price.recurring ||
      price.recurring.interval !== "month" ||
      price.recurring.interval_count !== 1 ||
      price.unit_amount === null ||
      price.unit_amount !== expectedAmount
    ) {
      throw new HttpsError(
        "failed-precondition",
        `Stripe Price ${lookupKey} no longer matches the locked proposal.`
      );
    }

    items.push({
      price: price.id,
      quantity,
    });

    catalogMonthlyTotal +=
      expectedAmount * quantity;
  }

  return {
    items,
    catalogMonthlyTotal,
  };
}

export const createProposalAutopaySetup =
  onCall(
    {
      secrets: [STRIPE_SECRET_KEY],
    },
    async (req) => {
      if (!req.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Management sign-in is required."
        );
      }

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

      const status =
        cleanString(proposal.status)
          .toUpperCase();

      const followUp =
        cleanString(
          proposal.billingFollowUpStatus
        ).toUpperCase();

      if (
        status !== "PAID" ||
        followUp !==
          "AUTOPAY_SETUP_REQUIRED" ||
        cleanString(
          proposal.paymentMethod
        ) !== "cash_prepaid" ||
        !proposal.cashPrepayment
      ) {
        throw new HttpsError(
          "failed-precondition",
          "This proposal is not waiting for cash-prepaid Stripe autopay setup."
        );
      }

      if (
        cleanString(
          proposal.stripeSubscriptionId
        )
      ) {
        return {
          ok: true,
          proposalId,
          status: "AUTOPAY_READY",
          alreadyComplete: true,
        };
      }

      // Validate the recurring proposal before issuing a client setup link.
      const pricing =
        getLockedPricing(proposal);

      nextBillingUnix(proposal);

      const stripe =
        getStripe();

      const pendingSessionId =
        cleanString(
          proposal.pendingAutopaySetupSessionId
        );

      if (pendingSessionId) {
        try {
          const existing =
            await stripe.checkout.sessions.retrieve(
              pendingSessionId
            );

          if (
            existing.status === "open" &&
            existing.url
          ) {
            return {
              ok: true,
              proposalId,
              setupSessionId:
                existing.id,
              setupUrl:
                existing.url,
              resumed: true,
            };
          }

          if (
            existing.status === "complete"
          ) {
            await handleProposalAutopaySetupCompleted(
              existing
            );

            return {
              ok: true,
              proposalId,
              status: "AUTOPAY_READY",
              reconciled: true,
            };
          }
        } catch (error) {
          console.warn(
            "[createProposalAutopaySetup] Existing setup session could not be reused:",
            error
          );
        }
      }

      // Resolve catalog now so a bad or stale proposal never reaches the client.
      await recurringItems(
        stripe,
        proposalId,
        pricing
      );

      let customerId =
        cleanString(
          proposal.stripeCustomerId
        );

      if (!customerId) {
        const email =
          proposalEmail(proposal);

        const customer =
          await stripe.customers.create(
            {
              name:
                proposalName(proposal),
              email:
                email && email.includes("@")
                  ? email
                  : undefined,
              metadata: {
                proposalId,
                source:
                  "cash_prepaid_autopay",
              },
            },
            {
              idempotencyKey:
                `cash-autopay-customer-${proposalId}`,
            }
          );

        customerId =
          customer.id;
      }

      const publicBaseUrl =
        cleanString(
          process.env.SANDMAN_PUBLIC_BASE_URL
        ) ||
        "https://www.sandmancombat.com";

      const session =
        await stripe.checkout.sessions.create(
          {
            mode: "setup",
            customer: customerId,
            payment_method_types: [
              "card",
            ],
            client_reference_id:
              proposalId,
            success_url:
              `${publicBaseUrl}/billing/success/?autopay=1&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:
              `${publicBaseUrl}/billing/cancel/?autopay=1`,
            metadata: {
              proposalId,
              source:
                "cash_prepaid_autopay",
              billingFlowVersion:
                "cash_prepaid_setup_v1",
            },
            setup_intent_data: {
              metadata: {
                proposalId,
                source:
                  "cash_prepaid_autopay",
                billingFlowVersion:
                  "cash_prepaid_setup_v1",
              },
            },
            custom_text: {
              submit: {
                message:
                  "No charge is made today. This card will be saved for future Sandman membership billing after the prepaid cash period ends.",
              },
            },
          },
          {
            idempotencyKey:
              pendingSessionId
                ? `cash-autopay-setup-${proposalId}-retry-${pendingSessionId}`
                : `cash-autopay-setup-${proposalId}`,
          }
        );

      if (!session.url) {
        throw new HttpsError(
          "internal",
          "Stripe did not return an autopay setup URL."
        );
      }

      await proposalRef.set(
        {
          stripeCustomerId:
            customerId,
          pendingAutopaySetupSessionId:
            session.id,
          autopaySetupStartedAt:
            FieldValue.serverTimestamp(),
          autopaySetupStartedBy:
            req.auth.uid,
          updatedAt:
            FieldValue.serverTimestamp(),
          updatedBy:
            req.auth.uid,
        },
        { merge: true }
      );

      return {
        ok: true,
        proposalId,
        setupSessionId:
          session.id,
        setupUrl:
          session.url,
      };
    }
  );

export async function handleProposalAutopaySetupCompleted(
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const proposalId =
    cleanString(
      session.metadata?.proposalId
    );

  if (!proposalId) {
    return null;
  }

  if (
    cleanString(
      session.metadata?.source
    ) !== "cash_prepaid_autopay"
  ) {
    return null;
  }

  if (session.mode !== "setup") {
    throw new Error(
      `Cash autopay session ${session.id} is not a setup session.`
    );
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || null;

  const setupIntentId =
    typeof session.setup_intent === "string"
      ? session.setup_intent
      : session.setup_intent?.id || null;

  if (!customerId || !setupIntentId) {
    throw new Error(
      `Cash autopay session ${session.id} is missing Stripe setup details.`
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
    throw new Error(
      `Proposal ${proposalId} was not found.`
    );
  }

  const proposal =
    proposalSnap.data() || {};

  const status =
    cleanString(proposal.status)
      .toUpperCase();

  const followUp =
    cleanString(
      proposal.billingFollowUpStatus
    ).toUpperCase();

  if (
    status !== "PAID" ||
    ![
      "AUTOPAY_SETUP_REQUIRED",
      "AUTOPAY_READY",
    ].includes(followUp)
  ) {
    throw new Error(
      `Proposal ${proposalId} is not eligible for cash-prepaid autopay completion.`
    );
  }

  const expectedSessionId =
    cleanString(
      proposal.pendingAutopaySetupSessionId
    );

  if (
    expectedSessionId &&
    expectedSessionId !== session.id
  ) {
    throw new Error(
      `Stripe setup session ${session.id} does not match proposal ${proposalId}.`
    );
  }

  const stripe =
    getStripe();

  const setupIntent =
    await stripe.setupIntents.retrieve(
      setupIntentId
    );

  const paymentMethodId =
    typeof setupIntent.payment_method ===
      "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id ||
        null;

  if (
    setupIntent.status !== "succeeded" ||
    !paymentMethodId
  ) {
    throw new Error(
      `Proposal ${proposalId} did not return a reusable Stripe payment method.`
    );
  }

  const pricing =
    getLockedPricing(proposal);

  const firstRecurringChargeUnix =
    nextBillingUnix(proposal);

  const {
    items,
    catalogMonthlyTotal,
  } =
    await recurringItems(
      stripe,
      proposalId,
      pricing
    );

  const recurringAmounts =
    resolveLockedRecurringPricing(
      pricing,
      catalogMonthlyTotal
    );

  const sponsorCoupon =
    await ensureProposalMonthlySponsorCoupon(
      stripe,
      proposalId,
      cleanString(
        pricing.catalog ||
        pricing.pricingModel
      ),
      recurringAmounts
    );

  const savedSubscriptionId =
    cleanString(
      proposal.stripeSubscriptionId
    );

  const {
    subscription,
    discountId:
      sponsorDiscountId,
  } =
    await recoverOrCreateProposalSubscription(
      stripe,
      {
        proposalId,
        checkoutSessionId:
          session.id,
        customerId,
        firstRecurringChargeUnix,
        items:
          items.map((item) => ({
            price:
              String(item.price),
            quantity:
              Number(
                item.quantity
              ),
          })),
        amounts:
          recurringAmounts,
        coupon:
          sponsorCoupon,
        source:
          "admissions_proposal",
        billingFlowVersion:
          "cash_prepaid_setup_v1",
      },
      savedSubscriptionId || null,
      () =>
        stripe.subscriptions.create(
          {
            customer:
              customerId,
            items,
            ...(sponsorCoupon
              ? {
                  discounts: [
                    {
                      coupon:
                        sponsorCoupon.id,
                    },
                  ],
                }
              : {}),
            expand: ["discounts"],
            collection_method:
              "charge_automatically",
            default_payment_method:
              paymentMethodId,
            billing_cycle_anchor:
              firstRecurringChargeUnix,
            proration_behavior:
              "none",
            metadata: {
              proposalId,
              checkoutSessionId:
                session.id,
              source:
                "admissions_proposal",
              billingFlowVersion:
                "cash_prepaid_setup_v1",
              monthlyBaseCents:
                String(
                  recurringAmounts
                    .monthlyBaseCents
                ),
              monthlySponsorCents:
                String(
                  recurringAmounts
                    .monthlySponsorCents
                ),
              monthlyBalanceCents:
                String(
                  recurringAmounts
                    .monthlyBalanceCents
                ),
            },
          },
          {
            idempotencyKey:
              `cash-autopay-subscription-${proposalId}-${session.id}`,
          }
        )
    );

  await db.runTransaction(
    async (tx) => {
      const currentSnap =
        await tx.get(
          proposalRef
        );

      if (!currentSnap.exists) {
        throw new Error(
          `Proposal ${proposalId} was not found.`
        );
      }

      const current =
        currentSnap.data() || {};

      if (
        cleanString(
          current.stripeSubscriptionId
        ) === subscription.id &&
        cleanString(
          current.billingFollowUpStatus
        ).toUpperCase() ===
          "AUTOPAY_READY"
      ) {
        return;
      }

      const historyRef =
        proposalRef
          .collection("history")
          .doc();

      tx.update(
        proposalRef,
        {
          billingFollowUpStatus:
            "AUTOPAY_READY",
          stripeCustomerId:
            customerId,
          stripeAutopaySetupSessionId:
            session.id,
          stripeSetupIntentId:
            setupIntentId,
          stripePaymentMethodId:
            paymentMethodId,
          stripeSubscriptionId:
            subscription.id,
          stripeMonthlySponsorCouponId:
            sponsorCoupon?.id || null,
          stripeMonthlySponsorDiscountId:
            sponsorDiscountId,
          stripeLivemode:
            session.livemode,
          autopaySetupCompletedAt:
            FieldValue.serverTimestamp(),
          pendingAutopaySetupSessionId:
            FieldValue.delete(),
          updatedAt:
            FieldValue.serverTimestamp(),
          updatedBy:
            "stripe",
        }
      );

      tx.create(
        historyRef,
        {
          proposalId,
          event:
            "AUTOPAY_SETUP_COMPLETED",
          stripeCheckoutSessionId:
            session.id,
          stripeSetupIntentId:
            setupIntentId,
          stripeSubscriptionId:
            subscription.id,
          createdBy:
            "stripe",
          createdByName:
            "Stripe Webhook",
          createdAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );

  return proposalId;
}
