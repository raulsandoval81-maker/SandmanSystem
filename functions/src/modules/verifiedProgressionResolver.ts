// Pure progression reconciliation. Callers must first authorize every athlete,
// verify the practice identity/location, and retrieve server-owned evidence.
// This module never certifies history, writes XP, or authorizes AUTO.
export type VerifiedSkillObservation = {
  practiceId: string;
  familyId: string;
  state: string;
  verifiedAt: string;
  coachUid: string;
  discipline: string;
};
export type ProgressionEvidenceInput = {
  athleteId: string;
  discipline: string;
  native: readonly VerifiedSkillObservation[];
  acceptedTransfer: readonly VerifiedSkillObservation[];
  nativeCoverageComplete: boolean;
  transferRequired: boolean;
  transferAccepted: boolean;
};
const STATES = new Set(["NOT_INTRODUCED","LEARNED","APPLIED","MASTERED","REFINED"]);
const KEY = /^[A-Za-z0-9_-]{1,128}$/;
export function reconcileVerifiedProgression(input: ProgressionEvidenceInput) {
  const blockers = new Set<string>();
  if (!KEY.test(input.athleteId) || !input.discipline) blockers.add("identity-invalid");
  if (!input.nativeCoverageComplete) blockers.add("native-history-coverage-unverified");
  if (input.transferRequired && !input.transferAccepted) blockers.add("transfer-evidence-not-accepted");
  const byFamily = new Map<string, VerifiedSkillObservation[]>();
  const accepted = [...input.native, ...(input.transferAccepted ? input.acceptedTransfer : [])];
  for (const obs of accepted) {
    if (!KEY.test(obs.practiceId) || !KEY.test(obs.coachUid) || !obs.familyId
        || obs.discipline !== input.discipline || !STATES.has(obs.state)
        || !Number.isFinite(Date.parse(obs.verifiedAt))
        || new Date(obs.verifiedAt).toISOString() !== obs.verifiedAt) {
      blockers.add("skill-observation-invalid");
      continue;
    }
    byFamily.set(obs.familyId, [...(byFamily.get(obs.familyId) || []), obs]);
  }
  const skills: {familyId:string;state:string}[] = [];
  for (const [familyId, history] of byFamily) {
    const ordered = history.sort((a,b) => b.verifiedAt.localeCompare(a.verifiedAt)
      || b.practiceId.localeCompare(a.practiceId));
    const latest = ordered.filter(x => x.verifiedAt === ordered[0].verifiedAt);
    if (new Set(latest.map(x => x.state)).size > 1) {
      blockers.add("conflicting-state:" + familyId);
    } else {
      skills.push({familyId,state:latest[0].state});
    }
  }
  if (!accepted.length) blockers.add("no-verified-skill-observations");
  return {
    athleteId: input.athleteId,
    approved: blockers.size === 0,
    skills: skills.sort((a,b) => a.familyId.localeCompare(b.familyId)),
    blockers: [...blockers].sort(),
    evidenceSource: input.native.length && input.transferAccepted && input.acceptedTransfer.length
      ? "native-and-transfer" : input.native.length ? "native"
      : input.transferAccepted && input.acceptedTransfer.length ? "accepted-transfer" : "none",
    eligibleForAuto: false as const,
  };
}

// Server-owned discovery pages must be reconciled across an explicit scope.
// A successful individual page does not establish exhaustive practice history.
export type NativeEvidencePage = {
  scope: string;
  cursor: string | null;
  nextCursor: string | null;
  scopeExhausted: boolean;
  observations: readonly VerifiedSkillObservation[];
};
export function reconcileNativeHistoryPages(
  athleteId: string,
  discipline: string,
  requiredScopes: readonly string[],
  pages: readonly NativeEvidencePage[],
  transferRequired = false,
  transferAccepted = false,
  acceptedTransfer: readonly VerifiedSkillObservation[] = [],
) {
  const blockers = new Set<string>();
  const observations: VerifiedSkillObservation[] = [];
  if (!requiredScopes.length || new Set(requiredScopes).size !== requiredScopes.length)
    blockers.add("native-scopes-unverified");
  for (const page of pages) {
    if (!requiredScopes.includes(page.scope)) blockers.add("unexpected-scope:" + page.scope);
  }
  for (const scope of requiredScopes) {
    const scoped = pages.filter(page => page.scope === scope);
    const cursors = new Map(scoped.map(page => [page.cursor || "", page]));
    if (cursors.size !== scoped.length) blockers.add("duplicate-page-cursor:" + scope);
    let cursor = "";
    let exhausted = false;
    const visited = new Set<string>();
    while (!visited.has(cursor)) {
      visited.add(cursor);
      const page = cursors.get(cursor);
      if (!page) { blockers.add("missing-page:" + scope); break; }
      observations.push(...page.observations);
      if (page.nextCursor === null) {
        exhausted = true;
        if (!page.scopeExhausted) blockers.add("scope-not-exhausted:" + scope);
        break;
      }
      if (page.scopeExhausted) blockers.add("inconsistent-exhaustion:" + scope);
      cursor = page.nextCursor;
    }
    if (!exhausted && visited.has(cursor)) blockers.add("cursor-cycle:" + scope);
    if (!scoped.length) blockers.add("missing-scope:" + scope);
    // A valid chain must consume every returned page. Orphaned pages may
    // conceal extra practices, even if the reachable chain is exhausted.
    for (const page of scoped) {
      if (!visited.has(page.cursor || "")) {
        blockers.add("unlinked-page:" + scope);
      }
    }
  }
  const unique = new Map<string, VerifiedSkillObservation>();
  for (const obs of observations) {
    const key = [obs.practiceId,obs.familyId,obs.state,obs.verifiedAt,obs.coachUid].join("|");
    unique.set(key, obs);
  }
  const result = reconcileVerifiedProgression({
    athleteId, discipline, native:[...unique.values()], acceptedTransfer,
    nativeCoverageComplete: blockers.size === 0, transferRequired, transferAccepted,
  });
  return {...result, approved: result.approved && blockers.size === 0,
    blockers:[...new Set([...result.blockers,...blockers])].sort(), eligibleForAuto:false as const};
}

// A bounded discovery scan is not independent coverage certification.
// Report precise gaps while preventing any client or diagnostic caller from
// turning technically exhausted pages into accepted progression.
export function assessIndependentCoverage(
  scopes: readonly {scope:string;authorized:boolean;scanExhausted:boolean}[],
  reconciliationBlockers: readonly string[],
  sourceValidationBlockers: readonly string[],
  declaredPriorLocations: readonly string[],
) {
  const blockers = new Set<string>([...reconciliationBlockers,...sourceValidationBlockers]);
  if (!scopes.length) blockers.add("no-discovery-scopes");
  for (const scope of scopes) {
    if (!scope.authorized) blockers.add("scope-not-authorized:" + scope.scope);
    else if (!scope.scanExhausted) blockers.add("scope-not-exhausted:" + scope.scope);
  }
  if (declaredPriorLocations.length) blockers.add("transfer-history-attestation-required");
  blockers.add("independent-source-coverage-certification-required");
  return {
    discoveryScannedToEnd: scopes.length > 0 && scopes.every(s=>s.authorized && s.scanExhausted),
    diagnosticBlockers:[...blockers].sort(),
    coverageComplete:false as const,
    evidenceApproved:false as const,
    eligibleForAuto:false as const,
  };
}
