/**
 * Browser-independent Big Clock run-state identity guard.
 * A previous completed or running practice must never appear as the current run.
 * Legacy unkeyed states intentionally do not resume.
 */
const id = value => String(value ?? "").trim();
export function practiceRunIdentity({ queryPracticeId, querySessionId, payload, session } = {}) {
  return {
    practiceId: id(queryPracticeId || payload?.practiceId || session?.practiceId),
    sessionId: id(querySessionId || payload?.sessionId || session?.sessionId)
  };
}
export function matchingPracticeRun(state, identity) {
  if (!state || !identity?.practiceId || !identity?.sessionId) return false;
  return id(state.practiceId) === id(identity.practiceId)
    && id(state.sessionId) === id(identity.sessionId);
}
export function restorePracticeRun(state, identity) {
  return matchingPracticeRun(state, identity) ? state : {};
}
