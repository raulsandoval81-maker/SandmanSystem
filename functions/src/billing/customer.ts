import { getStripe } from "./stripeClient";

export interface CreateCustomerInput {
  familyId: string;
  email: string;
  name: string;
}

export async function createStripeCustomer(
  input: CreateCustomerInput
): Promise<string> {
  const stripe = getStripe();

  const customer = await stripe.customers.create({
    email: input.email,
    name: input.name,
    metadata: {
      familyId: input.familyId,
    },
  });

  return customer.id;
}
