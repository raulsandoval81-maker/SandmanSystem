import Stripe from "stripe";
import { getStripe } from "./stripeClient";
import { createStripeCustomer } from "./customer";

export interface CreateCheckoutInput {
  familyId: string;
  familyName: string;
  email: string;
  priceId: string;
  stripeCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutResult {
  checkoutSessionId: string;
  checkoutUrl: string;
  stripeCustomerId: string;
}

export async function createSubscriptionCheckout(
  input: CreateCheckoutInput
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();

  let stripeCustomerId = input.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    stripeCustomerId = await createStripeCustomer({
      familyId: input.familyId,
      email: input.email,
      name: input.familyName,
    });
  }

  const session: Stripe.Checkout.Session =
    await stripe.checkout.sessions.create({
      mode: "subscription",

      customer: stripeCustomerId,

      line_items: [
        {
          price: input.priceId,
          quantity: 1,
        },
      ],

      success_url:
        `${input.successUrl}?session_id={CHECKOUT_SESSION_ID}`,

      cancel_url: input.cancelUrl,

      client_reference_id: input.familyId,

      metadata: {
        familyId: input.familyId,
      },

      subscription_data: {
        metadata: {
          familyId: input.familyId,
        },
      },

      allow_promotion_codes: true,
    });

  if (!session.url) {
    throw new Error(
      "Stripe did not return a Checkout Session URL."
    );
  }

  return {
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    stripeCustomerId,
  };
}
