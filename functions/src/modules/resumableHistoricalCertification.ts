import { createHash } from "node:crypto";

export const LARGE_HISTORY_SCHEMA_VERSION = 1;
export const LARGE_HISTORY_PAGE_SIZE = 10;
export const LARGE_HISTORY_MAX_PAGES = 1000;

export type HistoricalInventoryObservation = {
  evidencePath: string;
  familyId: string;
  state: string;
  coachUid: string;
  verifiedAt: string;
};

export type HistoricalInventoryRecord = {
  practiceId: string;
  practicePath: string;
  attendancePath: string;
  athleteMemoryPath: string;
  sessionDateKey: string;
  discipline: string;
  locationId: string;
  academyId: string;
  scopeId: string;
  observations: HistoricalInventoryObservation[];
};

export type HistoricalChainPage = {
  kind: "LARGE_HISTORY_INVENTORY_PAGE" | "LARGE_HISTORY_RECONCILIATION_PAGE";
  schemaVersion: number;
  athleteId: string;
  discipline: string;
  runId: string;
  sourceRevision: number;
  scopeFingerprint: string;
  sequence: number;
  previousPageHash: string;
  cursorBefore: string;
  cursorAfter: string;
  exhausted: boolean;
  records: HistoricalInventoryRecord[];
  verifiedRecordCount: number;
  evidenceCount: number;
  inventoryPageHash?: string;
  recordedAt: string;
  authorizedBy: string;
  pageHash: string;
};

export function canonicalizeHistoricalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeHistoricalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalizeHistoricalValue(item)]));
  }
  return value;
}

export function canonicalHistoricalJson(value: unknown): string {
  return JSON.stringify(canonicalizeHistoricalValue(value));
}

export function historicalChainHash(value: unknown): string {
  return createHash("sha256").update(canonicalHistoricalJson(value)).digest("hex");
}

export function historicalPageHashInput(page: Omit<HistoricalChainPage, "pageHash">) {
  return page;
}

export function createHistoricalChainPage(
  page: Omit<HistoricalChainPage, "pageHash">
): HistoricalChainPage {
  return {...page, pageHash: historicalChainHash(historicalPageHashInput(page))};
}

export function verifyHistoricalPageChain(
  pages: unknown[],
  expected: {
    kind: HistoricalChainPage["kind"];
    athleteId: string;
    discipline: string;
    runId: string;
    sourceRevision: number;
    scopeFingerprint: string;
  }
): {valid: boolean; blockers: string[]; rootHash: string; recordCount: number; evidenceCount: number} {
  const blockers: string[] = [];
  const records = pages.filter((page): page is HistoricalChainPage =>
    Boolean(page && typeof page === "object"));
  let previous = "GENESIS";
  let recordCount = 0;
  let evidenceCount = 0;
  const practiceIds = new Set<string>();
  const evidencePaths = new Set<string>();
  const semanticEvidence = new Set<string>();
  if (!records.length) blockers.push("missing-pages");
  records.forEach((page, index) => {
    if (page.sequence !== index) blockers.push("missing-or-reordered-page:" + index);
    if (page.kind !== expected.kind || page.schemaVersion !== LARGE_HISTORY_SCHEMA_VERSION
        || page.athleteId !== expected.athleteId || page.discipline !== expected.discipline
        || page.runId !== expected.runId || page.sourceRevision !== expected.sourceRevision
        || page.scopeFingerprint !== expected.scopeFingerprint) {
      blockers.push("page-identity-mismatch:" + index);
    }
    if (page.previousPageHash !== previous) blockers.push("previous-page-hash-mismatch:" + index);
    const {pageHash, ...hashInput} = page;
    if (historicalChainHash(hashInput) !== pageHash) blockers.push("page-hash-mismatch:" + index);
    if (!Array.isArray(page.records) || page.verifiedRecordCount !== page.records.length
        || page.evidenceCount !== page.records.reduce((sum, item) =>
          sum + (Array.isArray(item.observations) ? item.observations.length : 0), 0)) {
      blockers.push("page-count-mismatch:" + index);
    }
    for (const record of Array.isArray(page.records) ? page.records : []) {
      if (practiceIds.has(record.practiceId)) blockers.push("duplicate-practice:" + record.practiceId);
      practiceIds.add(record.practiceId);
      for (const observation of Array.isArray(record.observations) ? record.observations : []) {
        if (evidencePaths.has(observation.evidencePath))
          blockers.push("duplicate-evidence-path:" + observation.evidencePath);
        evidencePaths.add(observation.evidencePath);
        const semantic = record.practiceId + "|" + observation.familyId;
        if (semanticEvidence.has(semantic)) blockers.push("duplicate-evidence-identity:" + semantic);
        semanticEvidence.add(semantic);
      }
    }
    recordCount += page.verifiedRecordCount;
    evidenceCount += page.evidenceCount;
    previous = pageHash;
  });
  if (records.length && records[records.length - 1].exhausted !== true)
    blockers.push("terminal-page-not-exhausted");
  if (records.slice(0, -1).some(page => page.exhausted === true))
    blockers.push("premature-terminal-page");
  return {valid:blockers.length === 0, blockers:[...new Set(blockers)].sort(),
    rootHash:previous, recordCount, evidenceCount};
}

export function compareHistoricalPasses(
  inventory: HistoricalChainPage[], reconciliation: HistoricalChainPage[]
): string[] {
  const blockers: string[] = [];
  if (inventory.length !== reconciliation.length) blockers.push("reconciliation-page-count-mismatch");
  const count = Math.max(inventory.length, reconciliation.length);
  for (let index = 0; index < count; index += 1) {
    const original = inventory[index];
    const recheck = reconciliation[index];
    if (!original || !recheck) continue;
    if (recheck.inventoryPageHash !== original.pageHash)
      blockers.push("reconciliation-page-binding-mismatch:" + index);
    if (canonicalHistoricalJson(recheck.records) !== canonicalHistoricalJson(original.records)
        || recheck.cursorBefore !== original.cursorBefore
        || recheck.cursorAfter !== original.cursorAfter
        || recheck.exhausted !== original.exhausted) {
      blockers.push("reconciliation-source-mismatch:" + index);
    }
  }
  return [...new Set(blockers)].sort();
}

export function resolveHistoricalSkillStates(pages: HistoricalChainPage[]) {
  const byFamily = new Map<string, Array<{state:string; verifiedAt:string; practiceId:string}>>();
  for (const page of pages) for (const record of page.records) {
    for (const observation of record.observations) {
      byFamily.set(observation.familyId, [...(byFamily.get(observation.familyId) || []),
        {state:observation.state, verifiedAt:observation.verifiedAt, practiceId:record.practiceId}]);
    }
  }
  const blockers: string[] = [];
  const skillStates: Array<{familyId:string;state:string;observedAt:string;evidenceCount:number}> = [];
  for (const [familyId, values] of byFamily) {
    values.sort((left,right) => right.verifiedAt.localeCompare(left.verifiedAt)
      || right.practiceId.localeCompare(left.practiceId));
    const latest = values.filter(value => value.verifiedAt === values[0].verifiedAt);
    if (new Set(latest.map(value => value.state)).size !== 1) {
      blockers.push("conflicting-latest-state:" + familyId);
    } else {
      skillStates.push({familyId,state:latest[0].state,observedAt:latest[0].verifiedAt,
        evidenceCount:values.length});
    }
  }
  return {skillStates:skillStates.sort((a,b) => a.familyId.localeCompare(b.familyId)),
    blockers: blockers.sort()};
}
