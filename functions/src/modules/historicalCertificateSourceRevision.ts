/**
 * Server-owned historical source certificate freshness policy.
 * Absence of a tracked baseline must never count as a verified baseline.
 * Certificate issuance and consumption must pair this check with a live,
 * server-owned baseline attestation read. A revision marker is never authority.
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
 * The marker alone does not authenticate its writer: every authority consumer
 * must also validate the matching server-owned attestation record.
 */
export function historicalSourceBaselineIsVerified(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const data = record as Record<string, unknown>;
  return data.baselineStatus === "VERIFIED_COMPLETE"
    && data.baselineAuthority === "SERVER_VERIFIED_SOURCE_INVENTORY"
    && typeof data.baselineVersion === "number"
    && Number.isSafeInteger(data.baselineVersion)
    && data.baselineVersion >= 1
    && typeof data.baselineSourceRevision === "number"
    && Number.isSafeInteger(data.baselineSourceRevision)
    && data.baselineSourceRevision >= 1
    && data.baselineSourceRevision === data.revision
    && typeof data.baselineEvidenceManifestId === "string"
    && /^[a-zA-Z0-9_-]{1,128}$/.test(data.baselineEvidenceManifestId)
    && typeof data.baselineAttestationId === "string"
    && /^[a-zA-Z0-9_-]{1,128}$/.test(data.baselineAttestationId)
    && typeof data.baselineVerificationReceiptId === "string"
    && /^[a-zA-Z0-9_-]{1,128}$/.test(data.baselineVerificationReceiptId)
    && typeof data.baselineInventoryFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(data.baselineInventoryFingerprint)
    && typeof data.baselineScopeFingerprint === "string"
    && /^[a-f0-9]{64}$/.test(data.baselineScopeFingerprint);
}

export function historicalBaselineAttestationMatches(
  marker: unknown,
  attestation: unknown,
  expected: {
    athleteId: string;
    discipline: string;
    manifestId: string;
    verificationReceiptId: string;
    reviewRevision: number;
  }
): boolean {
  if (!historicalSourceBaselineIsVerified(marker)
      || !attestation || typeof attestation !== "object") return false;
  const revision = marker as Record<string, unknown>;
  const record = attestation as Record<string, unknown>;
  const evidencePaths = Array.isArray(record.sourceEvidencePaths)
    ? record.sourceEvidencePaths : [];
  const practiceIds = Array.isArray(record.practiceIds) ? record.practiceIds : [];
  const scopeNames = Array.isArray(record.scopeNames) ? record.scopeNames : [];
  return record.kind === "SERVER_VERIFIED_HISTORICAL_BASELINE_ATTESTATION"
    && record.schemaVersion === 1
    && record.athleteId === expected.athleteId
    && record.discipline === expected.discipline
    && record.manifestId === expected.manifestId
    && record.verificationReceiptId === expected.verificationReceiptId
    && record.reviewRevision === expected.reviewRevision
    && record.sourceRevision === revision.revision
    && record.inventoryFingerprint === revision.baselineInventoryFingerprint
    && record.scopeFingerprint === revision.baselineScopeFingerprint
    && record.manifestId === revision.baselineEvidenceManifestId
    && record.verificationReceiptId === revision.baselineVerificationReceiptId
    && typeof record.authorizedBy === "string" && record.authorizedBy.length > 0
    && record.attestedAt != null
    && evidencePaths.length > 0
    && new Set(evidencePaths).size === evidencePaths.length
    && practiceIds.length > 0
    && new Set(practiceIds).size === practiceIds.length
    && scopeNames.length > 0
    && new Set(scopeNames).size === scopeNames.length;
}
