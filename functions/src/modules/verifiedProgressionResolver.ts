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
