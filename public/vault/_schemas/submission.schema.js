export function validateSubmission(submission) {
  if (!submission) throw new Error("Submission is missing");

  if (typeof submission.uid !== "string" || !submission.uid.trim()) {
    throw new Error("Invalid uid");
  }

  if (!["honor", "strength"].includes(submission.lane)) {
    throw new Error(`Invalid lane: ${submission.lane}`);
  }

  if (!Number.isInteger(submission.segment) || submission.segment < 1) {
    throw new Error(`Invalid segment: ${submission.segment}`);
  }

  if (!Number.isInteger(submission.session) || submission.session < 1) {
    throw new Error(`Invalid session: ${submission.session}`);
  }

  if (typeof submission.sessionId !== "string" || !submission.sessionId.trim()) {
    throw new Error("Invalid sessionId");
  }

  if (!["pending", "approved", "rejected"].includes(submission.status)) {
    throw new Error(`Invalid status: ${submission.status}`);
  }

  if (!Number.isFinite(submission.xpAwarded) || submission.xpAwarded < 0) {
    throw new Error(`Invalid xpAwarded: ${submission.xpAwarded}`);
  }

  if (submission.reviewedBy !== undefined && typeof submission.reviewedBy !== "string") {
    throw new Error("Invalid reviewedBy");
  }

  if (
    submission.createdAt !== null &&
    typeof submission.createdAt !== "string" &&
    typeof submission.createdAt !== "number" &&
    typeof submission.createdAt !== "object"
  ) {
    throw new Error("Invalid createdAt");
  }

  if (
    submission.reviewedAt !== null &&
    typeof submission.reviewedAt !== "string" &&
    typeof submission.reviewedAt !== "number" &&
    typeof submission.reviewedAt !== "object"
  ) {
    throw new Error("Invalid reviewedAt");
  }

  if (submission.status === "approved" || submission.status === "rejected") {
    if (!submission.reviewedBy || !submission.reviewedBy.trim()) {
      throw new Error(`reviewedBy required when status is ${submission.status}`);
    }

    if (submission.reviewedAt == null) {
      throw new Error(`reviewedAt required when status is ${submission.status}`);
    }
  }

  if (submission.status === "pending" && submission.xpAwarded > 0) {
    throw new Error("Pending submissions cannot award XP yet");
  }

  return true;
}