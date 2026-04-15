export function validateSession(session) {
  if (!session) throw new Error("Session is missing");

  if (!["strength", "honor"].includes(session.lane)) {
    throw new Error(`Invalid lane: ${session.lane}`);
  }

  if (!Number.isInteger(session.segment) || session.segment < 1) {
    throw new Error(`Invalid segment: ${session.segment}`);
  }

  if (!Number.isInteger(session.n) || session.n < 1) {
    throw new Error(`Invalid session number: ${session.n}`);
  }

  if (session.stripeRequired !== undefined && !Number.isInteger(session.stripeRequired)) {
    throw new Error(`Invalid stripeRequired: ${session.stripeRequired}`);
  }

  if (session.xpValue !== undefined && !Number.isFinite(session.xpValue)) {
    throw new Error(`Invalid xpValue: ${session.xpValue}`);
  }

  if (session.isRetest !== undefined && typeof session.isRetest !== "boolean") {
    throw new Error(`Invalid isRetest: ${session.isRetest}`);
  }

  if (session.status && !["active", "locked"].includes(session.status)) {
    throw new Error(`Invalid status: ${session.status}`);
  }

  return true;
}