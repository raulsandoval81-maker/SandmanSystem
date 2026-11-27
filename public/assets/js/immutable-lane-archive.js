// Archives are immutable. A Coach may safely resume a previously archived
// submission, but may never overwrite a mismatched closed record.
export function archiveMatchesSubmission(record, athleteId, key, lane, expectedAward, expectedPrimaryLane = "strength") {
  if (!record || typeof record !== "object") return false;
  return record.athleteId === athleteId &&
    record.sourceAthleteId === athleteId &&
    record.sourceKey === key &&
    record.sourceCollection === "laneSubmissions" &&
    record.historyType === "submission" &&
    record.status === "closed" &&
    Number(record.awardedXp || 0) === Number(expectedAward || 0) &&
    (lane === "conditioning"
      ? record.assignmentLane === "conditioning" &&
        record.lane === expectedPrimaryLane
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
  athleteId, key, lane, expectedAward, expectedPrimaryLane, readHistoryForAthlete,
}) {
  const record = await findLaneArchive(athleteId, key, readHistoryForAthlete);
  if (!record) return false;
  if (!archiveMatchesSubmission(record, athleteId, key, lane, expectedAward, expectedPrimaryLane)) {
    throw new Error("HISTORY_ARCHIVE_CONFLICT_REQUIRES_REVIEW");
  }
  return true;
}

export async function ensureImmutableLaneArchive({
  historyRef, archive, athleteId, key, lane, readHistoryForAthlete, setDoc,
}) {
  if (await assertCompatibleLaneArchive({
    athleteId, key, lane, expectedAward: archive.awardedXp,
    expectedPrimaryLane: archive.lane, readHistoryForAthlete,
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
      athleteId, key, lane, expectedAward: archive.awardedXp,
    expectedPrimaryLane: archive.lane, readHistoryForAthlete,
    }).catch(() => false);
    if (matches) return { created: false, existing: true };
    throw error;
  }
}


// The server receipt is authoritative across interrupted Coach approvals.
// On an idempotent retry, the requested button amount might differ from the
// amount already granted. Never archive or close an incorrect award.
export function assertAuthoritativeAwardReceipt(receipt, expectedAmount) {
  const awarded = receipt?.awardedAmount;
  if (receipt?.ok !== true ||
      typeof awarded !== "number" ||
      !Number.isFinite(awarded) ||
      !Number.isFinite(Number(expectedAmount)) ||
      awarded !== Number(expectedAmount)) {
    throw new Error("XP_AWARD_RECEIPT_MISMATCH_REQUIRES_REVIEW");
  }
  return awarded;
}
