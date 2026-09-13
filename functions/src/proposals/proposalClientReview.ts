import {
  createHash,
  randomBytes,
} from "node:crypto";

export function cleanReviewString(
  value: unknown
): string {
  return String(value ?? "").trim();
}

export function createProposalReviewToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProposalReviewToken(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function buildClientProposalSnapshot(
  proposalId: string,
  proposal: Record<string, any>
) {
  const prospect =
    proposal.prospect || {};

  const coach =
    proposal.coach || {};

  return {
    version: 1,

    proposalId,

    prospect: {
      familyName:
        prospect.familyName || null,

      primaryContactName:
        prospect.primaryContactName || null,
    },

    preparedBy: {
      name:
        coach.name || null,
    },

    athletes:
      Array.isArray(proposal.athletes)
        ? proposal.athletes
        : [],

    pricing:
      proposal.pricing || {},

    agreement:
      proposal.agreement || {},
  };
}
