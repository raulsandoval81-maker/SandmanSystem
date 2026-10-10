// Read-only historical practice deduplication. Never authorizes AUTO.
export type HistoricalPractice = {
  practiceId: string;
  sessionDateKey: string;
  verifiedSkills: Array<{ familyId: string; state: string; verifiedAt: string | null; coachUid: string }>;
};
export type HistoryPage = {
  athleteId: string;
  discipline: string;
  scope: string;
  cursor?: string | null;
  nextCursor?: string | null;
  scopeExhausted: boolean;
  history?: HistoricalPractice[];
};
export function reconcileHistoryPages(
  pages: readonly HistoryPage[],
  scopes: readonly string[],
  athleteId: string,
  discipline: string
) {
  const blockers = new Set<string>();
  const found = new Map<string, HistoricalPractice>();
  for (const scope of scopes) {
    const scoped = pages.filter(p => p.scope === scope);
    const cursorMap = new Map(scoped.map(p => [p.cursor || "", p]));
    if (cursorMap.size !== scoped.length) blockers.add("duplicate-page-cursor");
    let cursor = "";
    const visited = new Set<string>();
    let terminated = false;
    while (!visited.has(cursor)) {
      visited.add(cursor);
      const page = cursorMap.get(cursor);
      if (!page) { blockers.add("missing-page:" + scope); terminated = true; break; }
      if (page.athleteId !== athleteId || page.discipline !== discipline) {
        blockers.add("identity-mismatch"); terminated = true; break;
      }
      if (!page.history) { blockers.add("missing-evidence:" + scope); terminated = true; break; }
      for (const record of page.history) {
        if (!record.practiceId || !/^\d{4}-\d{2}-\d{2}$/.test(record.sessionDateKey)
          || !Number.isFinite(Date.parse(record.sessionDateKey + "T00:00:00.000Z"))
          || new Date(record.sessionDateKey + "T00:00:00.000Z").toISOString().slice(0, 10) !== record.sessionDateKey) {
          blockers.add("invalid-practice-date"); continue;
        }
        if (!record.verifiedSkills.length) blockers.add("empty-verified-skill-history");
        if (record.verifiedSkills.some(s => !s.familyId || !s.coachUid || !s.state
          || !s.verifiedAt || !Number.isFinite(Date.parse(s.verifiedAt)))) {
          blockers.add("incomplete-verified-skill-observation");
        }
        // Verification may occur after practice, but cannot predate the session.
        // Retain the evidence for diagnostics while blocking progression.
        if (record.verifiedSkills.some(observation =>
          observation.verifiedAt && Number.isFinite(Date.parse(observation.verifiedAt))
          && observation.verifiedAt.slice(0, 10) < record.sessionDateKey)) {
          blockers.add("verification-predates-practice");
        }
        const existing = found.get(record.practiceId);
        if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
          blockers.add("conflicting-duplicate-practice");
        } else if (!existing) found.set(record.practiceId, record);
      }
      if (page.scopeExhausted) {
        if (page.nextCursor) blockers.add("inconsistent-end-cursor");
        terminated = true;
        break;
      }
      if (!page.nextCursor) { blockers.add("missing-next-cursor"); terminated = true; break; }
      cursor = page.nextCursor;
    }
    if (!terminated) blockers.add("cursor-cycle:" + scope);
    if (visited.size !== cursorMap.size) blockers.add("disconnected-page");
  }
  const practices = [...found.values()].sort((a, b) =>
    a.sessionDateKey.localeCompare(b.sessionDateKey) || a.practiceId.localeCompare(b.practiceId));
  const familyTimelines = new Map<string, Array<{
    practiceId: string; sessionDateKey: string; state: string;
    coachUid: string; verifiedAt: string | null;
  }>>();
  for (const practice of practices) {
    for (const observation of practice.verifiedSkills) {
      if (!observation.familyId) continue;
      const entries = familyTimelines.get(observation.familyId) || [];
      entries.push({
        practiceId: practice.practiceId,
        sessionDateKey: practice.sessionDateKey,
        state: observation.state,
        coachUid: observation.coachUid,
        verifiedAt: observation.verifiedAt,
      });
      familyTimelines.set(observation.familyId, entries);
    }
  }
  const skillTimelines = [...familyTimelines.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([familyId, observations]) => ({
      familyId,
      observations: observations.sort((a, b) =>
        a.sessionDateKey.localeCompare(b.sessionDateKey)
        || (a.verifiedAt || "").localeCompare(b.verifiedAt || "")
        || a.practiceId.localeCompare(b.practiceId)),
      currentState: null,
      eligibleForAuto: false,
    }));
  blockers.add("historical-transfer-coverage-unverified");
  blockers.add("current-skill-state-unresolved");
  return {
    athleteId, discipline,
    practices, skillTimelines,
    blockers: [...blockers].sort(),
    coverageComplete: false as const,
    eligibleForAuto: false as const
  };
}


// Read-only mixed-group curriculum preview. Inputs must come from the
// separately authorized accepted-evidence resolver; this helper never
// accepts evidence, writes progression, or enables automatic launch.
export type AcceptedGroupSkillSnapshot = {
  athleteId: string;
  approved: boolean;
  blockers: readonly string[];
  skills: readonly {familyId: string; state: string}[];
};

const GROUP_STATE_ORDER = ["NOT_INTRODUCED", "LEARNED", "APPLIED", "MASTERED", "REFINED"] as const;

export function previewMixedGroupSkillNeeds(
  athletes: readonly AcceptedGroupSkillSnapshot[],
  requestedFamilies: readonly string[]
) {
  const blockers: string[] = [];
  if (!athletes.length || athletes.length > 30) blockers.push("group-size-invalid");
  if (!requestedFamilies.length || requestedFamilies.length > 50
      || new Set(requestedFamilies).size !== requestedFamilies.length
      || requestedFamilies.some(family => !family.trim())) {
    blockers.push("curriculum-families-invalid");
  }
  const identities = new Set<string>();
  for (const athlete of athletes) {
    if (!athlete.athleteId.trim() || identities.has(athlete.athleteId)) {
      blockers.push("duplicate-or-missing-athlete");
    }
    identities.add(athlete.athleteId);
    if (!athlete.approved || athlete.blockers.length) blockers.push("athlete-evidence-not-ready:" + athlete.athleteId);
    const skills = new Set<string>();
    for (const skill of athlete.skills) {
      if (skills.has(skill.familyId) || !GROUP_STATE_ORDER.includes(skill.state as typeof GROUP_STATE_ORDER[number])) {
        blockers.push("athlete-skill-state-invalid:" + athlete.athleteId);
      }
      skills.add(skill.familyId);
    }
  }
  if (blockers.length) return {
    ready: false, lessonCandidates: [], blockers: [...new Set(blockers)].sort(),
    coachReviewRequired: true, eligibleForAuto: false,
  };
  const lessonCandidates = requestedFamilies.map(familyId => {
    const members = athletes.map(athlete => {
      const state = athlete.skills.find(skill => skill.familyId === familyId)?.state ?? null;
      const level = state === null ? -1 : GROUP_STATE_ORDER.indexOf(state as typeof GROUP_STATE_ORDER[number]);
      return {
        athleteId: athlete.athleteId, currentState: state,
        track: level < 1 ? "INTRODUCE" : level < 3 ? "PRACTICE" : "EXTEND",
      };
    });
    return {
      familyId, athletesNeedingIntroduction: members.filter(m => m.track === "INTRODUCE").length,
      practiceCount: members.filter(m => m.track === "PRACTICE").length,
      extensionCount: members.filter(m => m.track === "EXTEND").length,
      members,
    };
  }).sort((a,b) => b.athletesNeedingIntroduction - a.athletesNeedingIntroduction
    || b.practiceCount - a.practiceCount || a.familyId.localeCompare(b.familyId));
  return {ready: true, lessonCandidates, blockers: [],
    coachReviewRequired: true, eligibleForAuto: false};
}

/** Supervised AUTO picks one existing candidate; it never creates or confirms a lesson. */
export function selectSupervisedGroupLesson(
  preview: ReturnType<typeof previewMixedGroupSkillNeeds>,
  recentlyDeliveredFamilies: readonly string[] = []
) {
  if (!preview.ready || preview.blockers.length || !preview.lessonCandidates.length) {
    return {ready: false, selection: null, blockers: preview.blockers.length
      ? preview.blockers : ["no-eligible-lesson"], coachApprovalRequired: true,
      eligibleForAuto: false};
  }
  const recent = new Set(recentlyDeliveredFamilies);
  const fresh = preview.lessonCandidates.filter(item => !recent.has(item.familyId));
  if (!fresh.length) return {ready: false, selection: null,
    blockers: ["all-candidates-recently-delivered"], coachApprovalRequired: true,
    eligibleForAuto: false};
  const first = fresh[0];
  const second = fresh[1];
  // The existing rank is a heuristic, not proof that two lessons are interchangeable.
  // A tied top score requires explicit Coach choice instead of a silent tiebreak.
  const ambiguous = Boolean(second &&
    first.athletesNeedingIntroduction === second.athletesNeedingIntroduction &&
    first.practiceCount === second.practiceCount);
  if (ambiguous) return {
    ready: false, selection: null, blockers: ["multiple-equivalent-lessons"],
    coachApprovalRequired: true, eligibleForAuto: false,
  };
  return {
    ready: true,
    selection: {familyId: first.familyId, members: first.members,
      reason: "Highest introduction/practice need among families not recently delivered to this group"},
    blockers: [], coachApprovalRequired: true, eligibleForAuto: false,
  };
}

/** Pilot prerequisite graph; explicit entries only. Other families remain unconfigured.
 * These proposed edges require Coach curriculum approval before enforcement.
 */
export const PILOT_WRESTLING_PREREQUISITES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  stance_motion: [],
  level_change_entry: ["stance_motion"],
  double_leg: ["level_change_entry"],
  single_leg: ["level_change_entry"],
});

/** Diagnostic only until the program's curriculum authority approves the edges. */
export function evaluateGroupLessonPrerequisites(
  athletes: readonly AcceptedGroupSkillSnapshot[],
  familyIds: readonly string[],
  graph: Readonly<Record<string, readonly string[]>>
) {
  const blockers: string[] = [];
  const byFamily: Record<string, {ready: boolean; missing: {athleteId: string; prerequisite: string}[]}> = {};
  for (const family of familyIds) {
    const dependencies = graph[family];
    if (!dependencies || dependencies.some(dep => dep === family || !Object.prototype.hasOwnProperty.call(graph, dep))) {
      blockers.push("prerequisite-policy-unconfigured:" + family);
      continue;
    }
    const missing: {athleteId: string; prerequisite: string}[] = [];
    for (const athlete of athletes) {
      if (!athlete.approved || athlete.blockers.length) {
        blockers.push("athlete-evidence-not-ready:" + athlete.athleteId);
        continue;
      }
      for (const prerequisite of dependencies) {
        const state = athlete.skills.find(skill => skill.familyId === prerequisite)?.state;
        if (state !== "LEARNED" && state !== "APPLIED" && state !== "MASTERED" && state !== "REFINED") {
          missing.push({athleteId: athlete.athleteId, prerequisite});
        }
      }
    }
    byFamily[family] = {ready: missing.length === 0, missing};
  }
  return {policyApproved: false, eligibleForAuto: false, byFamily,
    blockers: [...new Set(blockers)].sort()};
}

/** Proposed prerequisite sequencing: diagnostic-only until curriculum policy approval. */
export function reviewSupervisedPrerequisiteSelection(
  preview: ReturnType<typeof previewMixedGroupSkillNeeds>,
  assessment: ReturnType<typeof evaluateGroupLessonPrerequisites>,
  recentlyDeliveredFamilies: readonly string[] = []
) {
  const blockedCandidates: {familyId:string; missing:{athleteId:string;prerequisite:string}[]}[] = [];
  const eligibleCandidates = preview.lessonCandidates.filter(candidate => {
    const policy = assessment.byFamily[candidate.familyId];
    if (!policy || !policy.ready) {
      blockedCandidates.push({familyId:candidate.familyId, missing:policy?.missing || []});
      return false;
    }
    return true;
  });
  const fallbackFamilies = [...new Set(blockedCandidates.flatMap(item =>
    item.missing.map(gap => gap.prerequisite)))].filter(family =>
      eligibleCandidates.some(candidate => candidate.familyId === family));
  const suggestedFoundation = fallbackFamilies.find(family => !recentlyDeliveredFamilies.includes(family)) || null;
  // A provisional policy may inform a Coach but NEVER authorize AUTO selection.
  return {
    ready:false, selection:null, coachApprovalRequired:true, eligibleForAuto:false,
    blockers:["curriculum-policy-not-approved",
      ...assessment.blockers,
      ...blockedCandidates.map(item => "prerequisites-not-met-or-unconfigured:" + item.familyId)],
    blockedCandidates, suggestedFoundation,
    eligibleCandidateFamilies:eligibleCandidates.map(candidate => candidate.familyId),
  };
}

/** Validate a proposed curriculum dependency map before any future approval.
 * Structural validation does not constitute Coach approval.
 */
export function auditCurriculumPrerequisiteGraph(
  families: readonly string[],
  graph: Readonly<Record<string, readonly string[]>>
) {
  const allowed = new Set(families);
  const issues: string[] = [];
  for (const [family, dependencies] of Object.entries(graph)) {
    if (!allowed.has(family)) issues.push("unknown-family:" + family);
    if (dependencies.length !== new Set(dependencies).size) issues.push("duplicate-prerequisite:" + family);
    for (const dependency of dependencies) {
      if (!allowed.has(dependency)) issues.push("unknown-prerequisite:" + family + ":" + dependency);
      if (!Object.prototype.hasOwnProperty.call(graph, dependency))
        issues.push("unmapped-prerequisite:" + family + ":" + dependency);
    }
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const visit = (family: string) => {
    if (active.has(family)) { issues.push("dependency-cycle:" + family); return; }
    if (visited.has(family)) return;
    active.add(family);
    for (const dep of graph[family] || []) {
      if (Object.prototype.hasOwnProperty.call(graph, dep)) visit(dep);
    }
    active.delete(family);
    visited.add(family);
  };
  for (const family of Object.keys(graph)) visit(family);
  return {structurallyValid: issues.length === 0, mappedFamilies: Object.keys(graph).length,
    totalFamilies: families.length, unmappedFamilies: families.filter(f => !Object.prototype.hasOwnProperty.call(graph, f)),
    issues: [...new Set(issues)].sort(), policyApproved: false, eligibleForAuto: false};
}

/** Advisory track readiness, without approving or activating curriculum policy. */
export function reviewTrackReadiness(
 athletes: readonly AcceptedGroupSkillSnapshot[],
 familyId: string,
 dependencies: readonly string[]
) {
 const results=athletes.map(athlete=>{
  const evidenceReady=athlete.approved && !athlete.blockers.length;
  const states=dependencies.map(id=>athlete.skills.find(s=>s.familyId===id)?.state||null);
  return {athleteId:athlete.athleteId,
   introduce:evidenceReady,
   practice:evidenceReady&&states.every(s=>["LEARNED","APPLIED","MASTERED","REFINED"].includes(s||"")),
   extend:evidenceReady&&states.every(s=>["APPLIED","MASTERED","REFINED"].includes(s||"")),
   missingForPractice:dependencies.filter((_,i)=>!["LEARNED","APPLIED","MASTERED","REFINED"].includes(states[i]||"")),
   missingForExtend:dependencies.filter((_,i)=>!["APPLIED","MASTERED","REFINED"].includes(states[i]||"")),
  };
 });
 return {familyId,policyApproved:false,eligibleForAuto:false,coachReviewRequired:true,athletes:results};
}

/** Draft-only Wrestling sequencing for Coach review; NEVER an approved AUTO graph. */
export const WRESTLING_REVIEW_GRAPH: Readonly<Record<string, readonly string[]>> = {
  stance_motion: [], level_change_entry: ["stance_motion"], angle: ["stance_motion"],
  head_position: ["stance_motion"], distance: ["stance_motion"], tempo: ["stance_motion"],
  pressure_footwork: ["stance_motion"], motion_attack_reattack: ["level_change_entry"],
  double_leg: ["level_change_entry"], single_leg: ["level_change_entry"],
  setups_ties: ["head_position"], snap_go_behind: ["setups_ties"],
  arm_drag: ["setups_ties"], reattack_reshot: ["shot_defense"],
  chain_wrestling: ["level_change_entry"], underhook: ["setups_ties"],
  two_on_one: ["setups_ties"], upper_body: ["underhook"],
  shot_defense: ["stance_motion"], down_block: ["shot_defense"],
  counter_offense: ["shot_defense"], front_headlock: ["snap_go_behind"],
  whizzer: ["shot_defense"], scramble: ["shot_defense"],
  ride_control: [], return: ["ride_control"],
  turn_system: ["ride_control"], crossface: ["ride_control"],
  leg_ride: ["ride_control"], escape: [],
  stand_up: ["escape"], sitout_switch: ["escape"],
  hip_heist: ["escape"], reversal: ["escape"],
  survival_recovery: ["escape"], bottom_integration: ["stand_up"],
};

/** Advisory distinctions for draft curriculum review; no policy approval implied. */
export const WRESTLING_SUPPORTING_SKILLS: Readonly<Record<string, readonly string[]>> = {
 chain_wrestling:["double_leg","single_leg"], motion_attack_reattack:["angle"],
 reattack_reshot:["level_change_entry"], upper_body:["two_on_one"],
 front_headlock:["shot_defense"], bottom_integration:["reversal"],
};

export function reviewWrestlingDependencyRoles(
 graph: Readonly<Record<string, readonly string[]>>,
 supporting: Readonly<Record<string, readonly string[]>>
) {
 const issues:string[]=[];
 const entries=Object.keys(graph).map(familyId=>{
  const deps=graph[familyId]||[];
  const support=supporting[familyId]||[];
  for(const id of support) if(!Object.prototype.hasOwnProperty.call(graph,id))
   issues.push("unknown-support:"+familyId+":"+id);
  // An existing draft edge can be reclassified as supporting without changing the source graph.
  return {familyId, mandatoryFoundations:deps.filter(id=>!support.includes(id)),
    supportingSkills:support, policyApproved:false};
 });
 for(const family of Object.keys(supporting)) if(!Object.prototype.hasOwnProperty.call(graph,family))
  issues.push("unknown-family:"+family);
 return {entries,issues,policyApproved:false,eligibleForAuto:false};
}

/** Draft-only readiness: supporting relationships never become blockers. */
export function reviewWrestlingRoleReadiness(
 athletes: readonly AcceptedGroupSkillSnapshot[],
 familyId: string
) {
 const roles = reviewWrestlingDependencyRoles(WRESTLING_REVIEW_GRAPH,WRESTLING_SUPPORTING_SKILLS);
 const entry = roles.entries.find(row => row.familyId === familyId);
 if (!entry || roles.issues.length) return null;
 return {
   ...reviewTrackReadiness(athletes,familyId,entry.mandatoryFoundations),
   mandatoryFoundations:entry.mandatoryFoundations,
   supportingSkills:entry.supportingSkills,
   policyApproved:false,
   eligibleForAuto:false
 };
}
