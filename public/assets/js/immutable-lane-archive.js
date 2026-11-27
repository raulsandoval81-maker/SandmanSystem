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

export async function ensureImmutableLaneArchive({
  historyRef, archive, athleteId, key, lane, getDoc, setDoc,
}) {
  const existing = await getDoc(historyRef);
  if (existing.exists()) {
    if (!archiveMatchesSubmission(existing.data(), athleteId, key, lane)) {
      throw new Error("HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW");
    }
    return { created: false, existing: true };
  }

  // Do not use merge:true. Existing documents are never rewritten by the
  // Coach role under the scoped Firestore containment policy.
  await setDoc(historyRef, archive);
  return { created: true, existing: false };
}
