// Archives are immutable. A Coach may safely resume a previously archived
// submission, but may never overwrite a mismatched closed record.
export function archiveMatchesSubmission(record, athleteId, key, lane, expectedAward) {
  if (!record || typeof record !== "object") return false;
  return record.athleteId === athleteId &&
    record.sourceAthleteId === athleteId &&
    record.sourceKey === key &&
    record.sourceCollection === "laneSubmissions" &&
    record.historyType === "submission" &&
    record.status === "closed" &&
    Number(record.awardedXp || 0) === Number(expectedAward || 0) &&
    (lane === "conditioning"
      ? record.assignmentLane === "conditioning"
      : record.lane === lane);
}

// The containment policy authorizes queries filtered by athleteId, but a
// direct getDoc of a *missing* history ID cannot be ownership-checked from
// resource.data. Query the authorized athlete scope instead.
export async function findLaneArchive(athleteId, key, readHistoryForAthlete) {
  const snapshot = await readHistoryForAthlete(athleteId);
  const matchId = `${athleteId}__${key}`;
  const match = snapshot.docs.find((item) => item.id === matchId);
  return match ? match.data() : null;
}

export async function assertCompatibleLaneArchive({
  athleteId, key, lane, expectedAward, readHistoryForAthlete,
}) {
  const record = await findLaneArchive(athleteId, key, readHistoryForAthlete);
  if (!record) return false;
  if (!archiveMatchesSubmission(record, athleteId, key, lane, expectedAward)) {
    throw new Error("HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW");
  }
  return true;
}

export async function ensureImmutableLaneArchive({
  historyRef, archive, athleteId, key, lane, readHistoryForAthlete, setDoc,
}) {
  if (await assertCompatibleLaneArchive({
    athleteId, key, lane, expectedAward: archive.awardedXp, readHistoryForAthlete,
  })) return { created: false, existing: true };

  try {
    // The rules allow Coach create but deny update; no merge:true, ever.
    await setDoc(historyRef, archive);
    return { created: true, existing: false };
  } catch (error) {
    // A concurrent approver may have created the same immutable document
    // after our scoped query. Accept only the exact matching final archive.
    // Any other failure is rethrown without retrying the write.
    const matches = await assertCompatibleLaneArchive({
      athleteId, key, lane, expectedAward: archive.awardedXp, readHistoryForAthlete,
    }).catch(() => false);
    if (matches) return { created: false, existing: true };
    throw error;
  }
}
