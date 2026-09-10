export const CONFIRMED_CANONICAL_RELATIONSHIPS = Object.freeze([
  Object.freeze({ parentUid: "QFX9rqSQkmQODbTSQRqSoddfW1E2", athleteUid: "F4_0001" }),
]);

export const MISSING_ATHLETE_DEACTIVATION_CANDIDATES = Object.freeze(
  ["F4_0054", "F4_0055", "F4_0056", "F4_0057", "F4_0058", "F4_0059", "F8_0019"]
    .map((athleteUid) => Object.freeze({ parentUid: "faHSwYkdOtgTH2n2Qrp4COXYdjk1", athleteUid }))
);

export const MANUAL_REVIEW_RELATIONSHIPS = Object.freeze([
  ["9xJO", "F4_0001"], ["9xJO", "F8_0001"],
  ["faHSwYkdOtgTH2n2Qrp4COXYdjk1", "F4_0001"],
  ["faHSwYkdOtgTH2n2Qrp4COXYdjk1", "F8_0001"],
  ["v5Xi", "F4_0022"], ["pending-email", "F4_0062"], ["pending-email", "F4_0063"],
].map(([parentUid, athleteUid]) => Object.freeze({ parentUid, athleteUid })));

const clean = (value) => String(value ?? "").trim();
export const canonicalParentLinkId = (parentUid, athleteUid) => `${clean(parentUid)}_${clean(athleteUid)}`;

export function buildParentLinkNormalizationPlan({ links = [], existingAthleteIds = [] } = {}) {
  const athleteIds = new Set(existingAthleteIds.map(clean));
  const normalize = [];
  const deactivate = [];
  const errors = [];

  for (const relationship of CONFIRMED_CANONICAL_RELATIONSHIPS) {
    const id = canonicalParentLinkId(relationship.parentUid, relationship.athleteUid);
    const record = links.find((link) => clean(link.id) === id);
    if (!record) {
      errors.push({ code: "CANONICAL_LINK_MISSING", id, ...relationship });
      continue;
    }
    if (clean(record.athleteUid) !== relationship.athleteUid) {
      errors.push({ code: "ATHLETE_MISMATCH", id, ...relationship });
      continue;
    }
    if (clean(record.parentUid) !== relationship.parentUid) {
      normalize.push({ id, ...relationship, patch: { parentUid: relationship.parentUid } });
    }
  }

  for (const candidate of MISSING_ATHLETE_DEACTIVATION_CANDIDATES) {
    if (athleteIds.has(candidate.athleteUid)) {
      errors.push({ code: "ATHLETE_NOW_EXISTS", ...candidate });
      continue;
    }
    for (const link of links) {
      if (clean(link.parentUid) !== candidate.parentUid || clean(link.athleteUid) !== candidate.athleteUid) continue;
      if (clean(link.status).toLowerCase() !== "active") continue;
      deactivate.push({
        id: clean(link.id),
        ...candidate,
        patch: { status: "inactive", deactivationReason: "missing_athlete_repair_artifact" },
      });
    }
  }

  return Object.freeze({ normalize, deactivate, errors, writes: normalize.length + deactivate.length });
}

export function logicalRelationshipCount(links = []) {
  return new Set(links.map((link) => `${clean(link.parentUid)}|${clean(link.athleteUid)}`)).size;
}

export function postCanonicalDuplicateCandidates(links = []) {
  const normalizedLinks = links.map((link) => {
    const confirmed = CONFIRMED_CANONICAL_RELATIONSHIPS.find(
      (item) => canonicalParentLinkId(item.parentUid, item.athleteUid) === clean(link.id)
    );
    return { ...link, parentUid: clean(link.parentUid) || confirmed?.parentUid || "" };
  });
  const groups = new Map();
  for (const link of normalizedLinks) {
    const parentUid = clean(link.parentUid);
    const athleteUid = clean(link.athleteUid);
    if (!parentUid || !athleteUid) continue;
    const key = `${parentUid}|${athleteUid}`;
    groups.set(key, [...(groups.get(key) || []), link]);
  }
  const candidates = [];
  for (const records of groups.values()) {
    const { parentUid, athleteUid } = records[0];
    const canonicalId = canonicalParentLinkId(parentUid, athleteUid);
    const canonical = records.find((item) => clean(item.id) === canonicalId);
    if (!canonical || clean(canonical.status).toLowerCase() !== "active") continue;
    for (const record of records) {
      if (clean(record.id) !== canonicalId && clean(record.status).toLowerCase() === "active") {
        candidates.push({ id: clean(record.id), parentUid, athleteUid, canonicalId });
      }
    }
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}
