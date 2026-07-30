import Stripe from "stripe";
import { defineSecret } from "firebase-functions/params";

export const STRIPE_SECRET_KEY =
  defineSecret("STRIPE_SECRET_KEY");

export const STRIPE_WEBHOOK_SECRET =
  defineSecret("STRIPE_WEBHOOK_SECRET");

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = STRIPE_SECRET_KEY.value();

    if (!key) {
      throw new Error(
        "Missing STRIPE_SECRET_KEY"
      );
    }

    stripe = new Stripe(key);
  }

  return stripe;
}