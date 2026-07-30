export type MembershipStatus =
  | "pending"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "unpaid";

export interface BillingRecord {
  familyId: string;

  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;

  membershipStatus: MembershipStatus;

  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;

  createdAt: string;
  updatedAt: string;
}
