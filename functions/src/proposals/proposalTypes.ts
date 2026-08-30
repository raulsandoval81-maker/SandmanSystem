export const PROPOSAL_STATUSES = [
  "DRAFT",
  "REVIEW",
  "READY_FOR_CHECKOUT",
  "CHECKOUT_CREATED",
  "PAID",
  "VOID",
] as const;

export type ProposalStatus =
  typeof PROPOSAL_STATUSES[number];

export interface ProposalProspect {
  appointmentId: string | null;
  admissionsRequestId: string | null;
  familyName: string | null;
  primaryContactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

export interface ProposalCoach {
  uid: string;
  name: string | null;
}

export interface ProposalDraft {
  proposalId: string;
  status: ProposalStatus;

  locationId: string;

  prospect: ProposalProspect;
  coach: ProposalCoach;

  athletes: unknown[];
  pricing: Record<string, unknown>;
  agreement: Record<string, unknown>;

  internalNotes: string | null;

  createdBy: string;
  updatedBy: string;
}
