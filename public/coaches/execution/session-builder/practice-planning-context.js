export function planningContextPayload(session = {}, overrides = {}) {
  const trainingGroups = Array.isArray(overrides.trainingGroups)
    ? overrides.trainingGroups
    : (Array.isArray(session.trainingGroups) ? session.trainingGroups : []);
  return {
    trainingGroups,
    fourGroupExceptionAcknowledged: overrides.fourGroupExceptionAcknowledged
      ?? session.fourGroupExceptionAcknowledged === true,
    planningSources: overrides.planningSources || session.planningSources || {},
    planningSourcesExplicitlySelected: overrides.planningSourcesExplicitlySelected
      ?? session.planningSourcesExplicitlySelected === true,
    groupPlanning: overrides.groupPlanning || session.groupPlanning || {},
    groupLessonAdjustments: overrides.groupLessonAdjustments || session.groupLessonAdjustments || {},
    clipboardPlan: overrides.clipboardPlan || session.clipboardPlan || null,
  };
}

export function restorePlanningContext(session = {}, practice = {}) {
  const practiceId = String(practice.practiceId || session.practiceId || "").trim();
  const draft = practice.planningContextDraft;
  if (!practiceId || !draft || String(draft.practiceId || "") !== practiceId
      || !Array.isArray(draft.trainingGroups) || !draft.trainingGroups.length) {
    return session;
  }
  return {
    ...session,
    practiceId,
    trainingGroups: draft.trainingGroups,
    fourGroupExceptionAcknowledged: draft.fourGroupExceptionAcknowledged === true,
    planningSources: draft.planningSources || {},
    planningSourcesExplicitlySelected: draft.planningSourcesExplicitlySelected === true,
    groupPlanning: draft.groupPlanning || {},
    groupLessonAdjustments: draft.groupLessonAdjustments || {},
    clipboardPlan: draft.clipboardPlan || null,
    planningContextRevision: Number(draft.revision || 0),
    planningContextRestored: true,
  };
}

export function planningContextRosterIds(context = {}) {
  return (Array.isArray(context.trainingGroups) ? context.trainingGroups : [])
    .flatMap((group) => Array.isArray(group.athleteIds) ? group.athleteIds.map(String) : []);
}
