import { MembershipStatus } from "./billingTypes";

export function normalizeMembershipStatus(
  stripeStatus: string | null | undefined
): MembershipStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";

    case "past_due":
      return "past_due";

    case "paused":
      return "paused";

    case "canceled":
      return "canceled";

    case "unpaid":
    case "incomplete_expired":
      return "unpaid";

    case "incomplete":
    default:
      return "pending";
  }
}
