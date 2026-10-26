const clone = value => JSON.parse(JSON.stringify(value));

function segmentKey(segment, index) {
  const groups = segment.variations.map(item => item.groupId).sort().join("+");
  return `${segment.blockId}:${segment.familyId}:${groups}:${index}`;
}

function capacities(preview) {
  return Object.fromEntries((preview.blocks || []).map(block => [block.blockId, block.minutes]));
}

function decorate(preview) {
  return (preview.segments || []).map((segment, index) => ({
    ...clone(segment), id: segmentKey(segment, index), included: true,
    originalMinutes: segment.proposedMinutes,
  }));
}

/** Local-only Coach exploration. The trusted preview is retained byte-for-byte as original. */
export function createCoachPreviewState(preview, {fixture = false} = {}) {
  return {
    original: clone(preview), segments: decorate(preview), fixture: fixture === true,
    adjustmentErrors: [], revision: 0,
  };
}

function validate(state, segments) {
  const errors = [];
  const allowed = capacities(state.original);
  const usage = {};
  for (const segment of segments.filter(item => item.included)) {
    if (!Number.isInteger(segment.proposedMinutes) || segment.proposedMinutes < 1) {
      errors.push(`invalid-minutes:${segment.id}`); continue;
    }
    usage[segment.blockId] = (usage[segment.blockId] || 0) + segment.proposedMinutes;
  }
  for (const [blockId, minutes] of Object.entries(usage)) {
    if (!(blockId in allowed)) errors.push(`unsupported-activity:${blockId}`);
    else if (minutes > allowed[blockId]) errors.push(`capacity-exceeded:${blockId}:${minutes}:${allowed[blockId]}`);
  }
  return errors;
}

function change(state, mutate) {
  const segments = clone(state.segments);
  mutate(segments);
  const errors = validate(state, segments);
  return errors.length ? {...state, adjustmentErrors: errors} : {
    ...state, segments, adjustmentErrors: [], revision: state.revision + 1,
  };
}

export function reorderCoachSegment(state, segmentId, direction) {
  return change(state, segments => {
    const from = segments.findIndex(item => item.id === segmentId);
    const to = direction === "up" ? from - 1 : direction === "down" ? from + 1 : -1;
    if (from >= 0 && to >= 0 && to < segments.length) [segments[from], segments[to]] = [segments[to], segments[from]];
  });
}

export function setCoachSegmentMinutes(state, segmentId, minutes) {
  return change(state, segments => {
    const segment = segments.find(item => item.id === segmentId);
    if (segment) segment.proposedMinutes = Number(minutes);
  });
}

export function setCoachSegmentIncluded(state, segmentId, included) {
  return change(state, segments => {
    const segment = segments.find(item => item.id === segmentId);
    if (segment) segment.included = included === true;
  });
}

/** Alternatives must be complete, server-supplied assembled segments. No client family IDs are resolved here. */
export function chooseTrustedAlternative(state, segmentId, alternativeId) {
  return change(state, segments => {
    const index = segments.findIndex(item => item.id === segmentId);
    if (index < 0) return;
    const current = segments[index];
    const alternative = (current.trustedAlternatives || []).find(item => item.alternativeId === alternativeId);
    if (!alternative) throw new Error("Alternative was not supplied by the trusted preview source.");
    segments[index] = {...clone(alternative.segment), id: current.id, included: current.included,
      originalMinutes: current.originalMinutes, trustedAlternatives: clone(current.trustedAlternatives)};
  });
}

export function restoreCoachProposal(state) {
  return createCoachPreviewState(state.original, {fixture: state.fixture});
}

export function coachPreviewSummary(state) {
  const included = state.segments.filter(segment => segment.included);
  const allocatedMinutes = included.reduce((sum, segment) => sum + segment.proposedMinutes, 0);
  return {
    allocatedMinutes,
    unallocatedMinutes: Math.max(0, state.original.durationMinutes - allocatedMinutes),
    includedSegments: included.length,
    athleteCount: new Set(included.flatMap(segment => segment.variations)
      .flatMap(variation => variation.athletes.map(athlete => athlete.athleteId))).size,
    groupCount: new Set(included.flatMap(segment => segment.variations.map(variation => variation.groupId))).size,
  };
}
