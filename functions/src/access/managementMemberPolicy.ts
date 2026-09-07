export function cleanMemberValue(value: unknown): string {
  return String(value ?? "").trim();
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
  const disciplines = athlete.disciplines && typeof athlete.disciplines === "object"
    ? Object.keys(athlete.disciplines) : [];
  return {
    athleteId,
    name: cleanMemberValue(athlete.fullName || athlete.publicName || athlete.name || athleteId),
    fullName: cleanMemberValue(athlete.fullName),
    publicName: cleanMemberValue(athlete.publicName),
    memberStatus: cleanMemberValue(athlete.rosterStatus || athlete.memberStatus || athlete.status || (athlete.active === false ? "inactive" : "active")),
    pathway: cleanMemberValue(athlete.programTrack || athlete.pathway || athlete.journey || athlete.track),
    primaryDiscipline: cleanMemberValue(athlete.primaryDiscipline || athlete.activeDiscipline || athlete.discipline || disciplines[0]),
    locationId: cleanMemberValue(athlete.locationId || athlete.team?.locationId),
    accessMode,
    directAccessActive: Boolean(authUid),
    athleteEmail: cleanMemberValue(athlete.athleteEmail || athlete.email).toLowerCase(),
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
