// Checks browser group assignments against the canonical checked-in roster.
// This verifies participation, NOT athlete progression or curriculum readiness.
export function reconcileCheckedInGroups(groups, checkedInIds) {
  const roster = (Array.isArray(checkedInIds) ? checkedInIds : []).map(String).filter(Boolean);
  const ids = (Array.isArray(groups) ? groups : []).flatMap(g => Array.isArray(g.athleteIds) ? g.athleteIds.map(String) : []);
  if (!roster.length) return { ok: false, reason: "No athletes are checked in." };
  if (!Array.isArray(groups) || !groups.length) return { ok: false, reason: "Attendance groups are missing." };
  if (new Set(roster).size !== roster.length || new Set(ids).size !== ids.length
      || ids.length !== roster.length || ids.some(id => !new Set(roster).has(id))) {
    return { ok: false, reason: "Training groups no longer match the checked-in athletes. Return to Attendance." };
  }
  return { ok: true, checkedInCount: roster.length, groupCount: groups.length };
}
