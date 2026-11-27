// A Coach may encounter a previously archived Honor or Conditioning submission
// after a navigation failure. The archive is immutable; a matching prior record
// is success for that specific submission, never permission to overwrite it.
export function archiveMatchesSubmission(record, athleteId, key, lane) {
  if (!record || typeof record !== "object") return false;
  return record.athleteId === athleteId &&
    record.sourceAthleteId === athleteId &&
    record.sourceKey === key &&
    record.sourceCollection === "laneSubmissions" &&
    record.historyType === "submission" &&
    record.status === "closed" &&
    (lane === "conditioning"
      ? record.assignmentLane === "conditioning"
      : record.lane === lane);
}

// This pre-award check runs before any XP request. An already archived
// submission with a different award cannot be silently changed by a retry.
export async function assertCompatibleLaneArchive({
  historyRef, athleteId, key, lane, expectedAward, getDoc,
}) {
  const existing = await getDoc(historyRef);
  if (!existing.exists()) return false;
  const data = existing.data();
  if (!archiveMatchesSubmission(data, athleteId, key, lane) ||
      Number(data.awardedXp || 0) !== Number(expectedAward || 0)) {
    throw new Error("HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW");
  }
  return true;
}

export async function ensureImmutableLaneArchive({
  historyRef, archive, athleteId, key, lane, getDoc, setDoc,
}) {
  const existing = await getDoc(historyRef);
  if (existing.exists()) {
    if (!archiveMatchesSubmission(existing.data(), athleteId, key, lane) ||
        Number(existing.data().awardedXp || 0) !== Number(archive.awardedXp || 0)) {
      throw new Error("HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW");
    }
    return { created: false, existing: true };
  }

  // Do not use merge:true. Existing documents are never rewritten by the
  // Coach role under the scoped Firestore containment policy.
  await setDoc(historyRef, archive);
  return { created: true, existing: false };
}
