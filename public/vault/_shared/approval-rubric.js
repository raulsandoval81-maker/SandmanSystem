// approval-rubic.js
// V1-safe placeholder so imports never break.
// This file will host the manual approval rubric later.

export const APPROVAL_RUBRIC_VERSION = "v0";

export function getApprovalRubric() {
  return {
    version: APPROVAL_RUBRIC_VERSION,
    notes: "Placeholder (no rubric yet).",
    rules: []
  };
}

// Future: validate + score a submitted Strength/Honor session
export function scoreSubmission(_payload = {}) {
  return {
    ok: true,
    score: 0,
    awardXp: 0,
    reason: "Placeholder rubric — manual review only."
  };
}