/**
 * Server-owned historical source certificate freshness policy.
 * Absence of a tracked baseline must never count as a verified baseline.
 * This policy is not yet wired into issuance/consumption: those paths remain
 * rollout blockers until the issuance schema and legacy migration are ready.
 */
export function historicalCertificateSourceRevisionIsCurrent(
  certifiedSourceRevision: unknown,
  currentSourceRevision: unknown
): boolean {
  return typeof certifiedSourceRevision === "number"
    && Number.isSafeInteger(certifiedSourceRevision)
    && certifiedSourceRevision >= 1
    && typeof currentSourceRevision === "number"
    && Number.isSafeInteger(currentSourceRevision)
    && currentSourceRevision >= 1
    && certifiedSourceRevision === currentSourceRevision;
}

/**
 * A monotonic revision is necessary but insufficient for old source documents:
 * revision 1 could have been created after years of untracked writes.
 * Only a server-recorded complete inventory baseline permits certification.
 */
export function historicalSourceBaselineIsVerified(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const data = record as Record<string, unknown>;
  return data.baselineStatus === "VERIFIED_COMPLETE"
    && data.baselineAuthority === "SERVER_VERIFIED_SOURCE_INVENTORY"
    && typeof data.baselineVersion === "number"
    && Number.isSafeInteger(data.baselineVersion)
    && data.baselineVersion >= 1;
}
