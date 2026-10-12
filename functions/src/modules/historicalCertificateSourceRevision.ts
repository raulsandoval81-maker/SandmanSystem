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
