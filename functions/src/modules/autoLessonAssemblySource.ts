export const AUTO_LESSON_SOURCE_CONTRACT = "skill-check-auto-preview-v1" as const;

const TRACKS = new Set(["INTRODUCE", "PRACTICE", "EXTEND"]);
const TIERS: Readonly<Record<string, string>> = Object.freeze({
  t0: "Apprentice", t1: "Warrior", t2: "Hero", t3: "Veteran", t4: "Legend",
});
function normalizeJourney(value: string) {
  const journey = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return journey === "p2l" || journey === "path2legend" || journey === "foundry4" ? "p2l" : journey;
}

export type ProtectedAssemblyGroup = Readonly<{
  groupId: string;
  familyId: string;
  purpose: string;
  athletes: readonly Readonly<{
    athleteId: string;
    tier: string;
    journey: string;
    track: string;
    currentState: string | null;
    evidence: Readonly<{manifestId: string; reviewRevision: number; accepted: boolean}>;
  }>[];
}>;

/** Server-only projection. Callers must supply records read and authorized by skillCheckCoachCall. */
export function buildProtectedAutoLessonAssemblySource(input: Readonly<{
  discipline: string;
  journey: string;
  groups: readonly ProtectedAssemblyGroup[];
  recommendationBlockers?: readonly string[];
}>) {
  const blockers = new Set(input.recommendationBlockers || []);
  let sourceEvidenceAccepted = true;
  if (input.discipline !== "wrestling") blockers.add("unsupported-discipline");
  if (normalizeJourney(input.journey) !== "p2l") blockers.add("unsupported-journey");
  const recommendations = input.groups.flatMap(group => {
    if (!group.groupId || !group.familyId || !group.athletes.length) {
      sourceEvidenceAccepted = false;
      blockers.add("invalid-server-recommendation:" + (group.groupId || "missing-group")); return [];
    }
    const tiers = new Set(group.athletes.map(athlete => athlete.tier.toLowerCase()));
    if (tiers.size !== 1) {
      sourceEvidenceAccepted = false;
      blockers.add("inconsistent-group-rank:" + group.groupId); return [];
    }
    const tier = [...tiers][0];
    if (!TIERS[tier]) {
      sourceEvidenceAccepted = false;
      blockers.add("unsupported-rank:" + group.groupId + ":" + tier); return [];
    }
    if (group.athletes.some(athlete => normalizeJourney(athlete.journey) !== "p2l")) {
      sourceEvidenceAccepted = false;
      blockers.add("wrong-athlete-journey:" + group.groupId); return [];
    }
    if (group.athletes.some(athlete => !TRACKS.has(athlete.track))) {
      sourceEvidenceAccepted = false;
      blockers.add("invalid-server-track:" + group.groupId); return [];
    }
    if (group.athletes.some(athlete => !athlete.evidence.accepted
        || !athlete.evidence.manifestId || !Number.isInteger(athlete.evidence.reviewRevision))) {
      sourceEvidenceAccepted = false;
      blockers.add("accepted-evidence-missing:" + group.groupId); return [];
    }
    return [{
      groupId: group.groupId,
      tier,
      rankName: TIERS[tier],
      familyId: group.familyId,
      instructionalPurpose: group.purpose,
      evidenceComplete: true,
      athletes: group.athletes.map(athlete => ({
        athleteId: athlete.athleteId,
        track: athlete.track,
        currentState: athlete.currentState,
      })),
      evidenceProvenance: group.athletes.map(athlete => ({
        athleteId: athlete.athleteId,
        manifestId: athlete.evidence.manifestId,
        reviewRevision: athlete.evidence.reviewRevision,
        status: "ACCEPTED_HISTORICAL_EVIDENCE" as const,
      })),
    }];
  });
  return {
    contractVersion: AUTO_LESSON_SOURCE_CONTRACT,
    issuedBy: "skillCheckCoachCall" as const,
    discipline: "wrestling" as const,
    journey: "p2l" as const,
    sourceEvidenceAccepted,
    reviewStatus: "COACH_REVIEW_REQUIRED" as const,
    authorizationStatus: "DIAGNOSTIC_ONLY" as const,
    previewOnly: true as const,
    authoritative: false as const,
    eligibleForAuto: false as const,
    coachApprovalRequired: true as const,
    recommendations,
    blockers: [...blockers].sort(),
  };
}
