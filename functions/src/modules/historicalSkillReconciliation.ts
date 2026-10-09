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
    while (!visited.has(cursor)) {
      visited.add(cursor);
      const page = cursorMap.get(cursor);
      if (!page) { blockers.add("missing-page:" + scope); break; }
      if (page.athleteId !== athleteId || page.discipline !== discipline) {
        blockers.add("identity-mismatch"); break;
      }
      if (!page.history) { blockers.add("missing-evidence:" + scope); break; }
      for (const record of page.history) {
        if (!record.practiceId || !/^\d{4}-\d{2}-\d{2}$/.test(record.sessionDateKey)) {
          blockers.add("invalid-practice-date"); continue;
        }
        if (record.verifiedSkills.some(s => !s.verifiedAt || !Number.isFinite(Date.parse(s.verifiedAt)))) {
          blockers.add("invalid-verification-date");
        }
        const existing = found.get(record.practiceId);
        if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
          blockers.add("conflicting-duplicate-practice");
        } else if (!existing) found.set(record.practiceId, record);
      }
      if (page.scopeExhausted) {
        if (page.nextCursor) blockers.add("inconsistent-end-cursor");
        break;
      }
      if (!page.nextCursor) { blockers.add("missing-next-cursor"); break; }
      cursor = page.nextCursor;
    }
    if (visited.has(cursor) && cursorMap.get(cursor)?.nextCursor) blockers.add("cursor-cycle");
    if (visited.size !== cursorMap.size) blockers.add("disconnected-page");
  }
  blockers.add("historical-transfer-coverage-unverified");
  blockers.add("current-skill-state-unresolved");
  return {
    athleteId, discipline,
    practices: [...found.values()].sort((a, b) =>
      a.sessionDateKey.localeCompare(b.sessionDateKey) || a.practiceId.localeCompare(b.practiceId)),
    blockers: [...blockers].sort(),
    coverageComplete: false as const,
    eligibleForAuto: false as const
  };
}
