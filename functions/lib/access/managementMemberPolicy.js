"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanMemberValue = cleanMemberValue;
exports.managementLocationScope = managementLocationScope;
exports.mapManagementMember = mapManagementMember;
exports.memberMatchesSearch = memberMatchesSearch;
function cleanMemberValue(value) {
    return String(value ?? "").trim();
}
function managementLocationScope(staff, role) {
    const normalizedRole = cleanMemberValue(role).toLowerCase().replace(/[\s-]+/g, "_");
    if (normalizedRole === "admin" || normalizedRole === "system_admin")
        return null;
    const values = new Set();
    for (const raw of [staff.locationIds, staff.locations, staff.locationId]) {
        for (const value of Array.isArray(raw) ? raw : [raw]) {
            const cleaned = cleanMemberValue(value);
            if (cleaned)
                values.add(cleaned);
        }
    }
    return [...values];
}
function mapManagementMember(athleteId, athlete, parentLinks = []) {
    const authUid = cleanMemberValue(athlete.authUid);
    const explicitMode = cleanMemberValue(athlete.access?.mode).toLowerCase();
    const accessMode = ["parent_managed", "hybrid", "self_managed"].includes(explicitMode)
        ? explicitMode
        : authUid ? "unclassified" : "parent_managed";
    const disciplineRecords = athlete.disciplines &&
        typeof athlete.disciplines === "object"
        ? athlete.disciplines
        : {};
    const legacyDiscipline = cleanMemberValue(athlete.primaryDiscipline ||
        athlete.activeDiscipline ||
        athlete.discipline ||
        athlete.art ||
        athlete.sport);
    const disciplines = [...new Set([
            ...Object.keys(disciplineRecords),
            ...(legacyDiscipline ? [legacyDiscipline] : [])
        ])];
    const disciplineProgress = disciplines.map((discipline) => {
        const record = disciplineRecords[discipline] &&
            typeof disciplineRecords[discipline] === "object"
            ? disciplineRecords[discipline]
            : discipline === legacyDiscipline
                ? athlete
                : {};
        return {
            discipline,
            trackBase: cleanMemberValue(record.trackBase ||
                record.programTrack ||
                record.track),
            tier: cleanMemberValue(record.tier),
            rankName: cleanMemberValue(record.rankName),
            xp: Number.isFinite(Number(record.xp))
                ? Number(record.xp)
                : 0,
            xpCap: Number.isFinite(Number(record.xpCap))
                ? Number(record.xpCap)
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
        athleteEmail: cleanMemberValue(athlete.athleteEmail || athlete.email).toLowerCase(),
        parentLinkStatus: parentLinks.length
            ? [...new Set(parentLinks.map((link) => cleanMemberValue(link.status || "unknown").toLowerCase()))].join(", ")
            : "none",
    };
}
function memberMatchesSearch(member, query) {
    const needle = cleanMemberValue(query).toLowerCase();
    if (!needle)
        return false;
    return [member.athleteId, member.fullName, member.publicName, member.name]
        .some((value) => cleanMemberValue(value).toLowerCase().includes(needle));
}
