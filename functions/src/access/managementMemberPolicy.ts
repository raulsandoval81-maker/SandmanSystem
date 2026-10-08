export function cleanMemberValue(value: unknown): string {
  return String(value ?? "").trim();
}

function managementMemberAge(value: unknown): number | null {
  const raw = cleanMemberValue(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() - (month - 1);
  const dayDiff = today.getDate() - day;

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

export function managementLocationScope(staff: Record<string, unknown>, role: unknown): string[] | null {
  const normalizedRole = cleanMemberValue(role).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalizedRole === "admin" || normalizedRole === "system_admin") return null;
  const values = new Set<string>();
  for (const raw of [staff.locationIds, staff.locations, staff.locationId]) {
    for (const value of Array.isArray(raw) ? raw : [raw]) {
      const cleaned = cleanMemberValue(value);
      if (cleaned) values.add(cleaned);
    }
  }
  return [...values];
}

export function mapManagementMember(
  athleteId: string,
  athlete: Record<string, any>,
  parentLinks: Array<Record<string, any>> = []
) {
  const authUid = cleanMemberValue(athlete.authUid);
  const explicitMode = cleanMemberValue(athlete.access?.mode).toLowerCase();
  const accessMode = ["parent_managed", "hybrid", "self_managed"].includes(explicitMode)
    ? explicitMode
    : authUid ? "unclassified" : "parent_managed";
  const disciplineRecords =
    athlete.disciplines &&
    typeof athlete.disciplines === "object"
      ? athlete.disciplines
      : {};

  const legacyDiscipline =
    cleanMemberValue(
      athlete.primaryDiscipline ||
      athlete.activeDiscipline ||
      athlete.discipline ||
      athlete.art ||
      athlete.sport
    );

  const disciplines =
    [...new Set([
      ...Object.keys(disciplineRecords),
      ...(legacyDiscipline ? [legacyDiscipline] : [])
    ])];

  const disciplineProgress =
    disciplines.map((discipline) => {
      const record =
        disciplineRecords[discipline] &&
        typeof disciplineRecords[discipline] === "object"
          ? disciplineRecords[discipline]
          : discipline === legacyDiscipline
            ? athlete
            : {};

      return {
        discipline,
        trackBase: cleanMemberValue(
          athlete.trackBase ||
          athlete.programTrack ||
          athlete.track ||
          record.trackBase ||
          record.programTrack ||
          record.track
        ),
        tier: cleanMemberValue(
          athlete.tier ??
          athlete.progressionTier ??
          record.tier
        ),
        rankName: cleanMemberValue(
          athlete.rankName ||
          athlete.tierName ||
          record.rankName
        ),
        xp: Number.isFinite(Number(athlete.xp))
          ? Number(athlete.xp)
          : Number.isFinite(Number(athlete.currentTierXP))
            ? Number(athlete.currentTierXP)
            : 0,
        xpCap: Number.isFinite(Number(athlete.xpCap))
          ? Number(athlete.xpCap)
          : Number.isFinite(Number(athlete.tierCap))
            ? Number(athlete.tierCap)
            : 0,
      };
    });

  return {
    athleteId,
    name: cleanMemberValue(athlete.fullName || athlete.publicName || athlete.name || athleteId),
    fullName: cleanMemberValue(athlete.fullName),
    publicName: cleanMemberValue(athlete.publicName),
    memberStatus: cleanMemberValue(athlete.rosterStatus || athlete.memberStatus || athlete.status || (athlete.active === false ? "inactive" : "active")),
    pathway: cleanMemberValue(athlete.programTrack || athlete.pathway || athlete.journey || athlete.track),
    trackBase: cleanMemberValue(athlete.trackBase || athlete.programTrack || athlete.track),
    rankName: cleanMemberValue(athlete.rankName),
    tier: cleanMemberValue(athlete.tier),
    xp: Number.isFinite(Number(athlete.xp)) ? Number(athlete.xp) : 0,
    primaryDiscipline: cleanMemberValue(athlete.primaryDiscipline || athlete.activeDiscipline || athlete.discipline || disciplines[0]),
    disciplineIds: disciplines,
    disciplineProgress,
    locationId: cleanMemberValue(athlete.locationId || athlete.team?.locationId),
    accessMode,
    directAccessActive: Boolean(authUid),
    priorExperienceRecognitionUsed:
      athlete.verifiedExperienceOverride?.used === true ||
      athlete.legacy === true ||
      Number(athlete.legacyCreditTotal || 0) > 0,
    athleteEmail: cleanMemberValue(athlete.athleteEmail || athlete.email).toLowerCase(),
    parentEmail: cleanMemberValue(athlete.parentEmail).toLowerCase(),
    age: Number.isFinite(Number(athlete.age))
      ? Number(athlete.age)
      : managementMemberAge(
          athlete.dob ||
          athlete.dateOfBirth ||
          athlete.birthDate ||
          athlete.profile?.dob ||
          athlete.profile?.dateOfBirth
        ),
    parentLinkStatus: parentLinks.length
      ? [...new Set(parentLinks.map((link) => cleanMemberValue(link.status || "unknown").toLowerCase()))].join(", ")
      : "none",
  };
}

export function memberMatchesSearch(member: ReturnType<typeof mapManagementMember>, query: unknown): boolean {
  const needle = cleanMemberValue(query).toLowerCase();
  if (!needle) return false;
  return [member.athleteId, member.fullName, member.publicName, member.name]
    .some((value) => cleanMemberValue(value).toLowerCase().includes(needle));
}
