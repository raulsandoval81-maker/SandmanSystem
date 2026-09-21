"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisciplineXpAuthority = resolveDisciplineXpAuthority;
function clean(value) {
    return String(value ?? "").trim().toLowerCase();
}
function xpValue(record, field) {
    const value = Number(record?.xp ?? 0);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`INVALID_DISCIPLINE_XP:${field}`);
    }
    return value;
}
/**
 * Resolves active-rank XP ownership for Management adjustments.
 *
 * The top-level XP field remains the operational compatibility authority for
 * the athlete's primary discipline. When a nested primary record exists, the
 * result is mirrored to both fields in the same transaction. Secondary
 * disciplines are isolated to their nested progression records.
 */
function resolveDisciplineXpAuthority(athlete, disciplineInput) {
    const discipline = clean(disciplineInput);
    const primaryDiscipline = clean(athlete?.primaryDiscipline ||
        athlete?.activeDiscipline ||
        athlete?.discipline ||
        athlete?.art ||
        athlete?.sport);
    if (!discipline) {
        throw new Error("DISCIPLINE_REQUIRED");
    }
    const disciplineRecords = athlete?.disciplines && typeof athlete.disciplines === "object"
        ? athlete.disciplines
        : {};
    const nested = disciplineRecords[discipline] &&
        typeof disciplineRecords[discipline] === "object"
        ? disciplineRecords[discipline]
        : null;
    const isPrimary = discipline === primaryDiscipline;
    if (isPrimary) {
        const sourceField = "xp";
        const writeTargets = nested
            ? ["xp", `disciplines.${discipline}.xp`]
            : ["xp"];
        return Object.freeze({
            discipline,
            primaryDiscipline,
            isPrimary: true,
            sourceField,
            authoritativeBeforeXp: xpValue(athlete, sourceField),
            progression: nested || athlete,
            progressionPrefix: nested ? `disciplines.${discipline}.` : "",
            xpWriteTargets: Object.freeze(writeTargets),
            mirrorsTopLevel: Boolean(nested),
        });
    }
    if (!nested) {
        throw new Error("ATHLETE_DISCIPLINE_NOT_FOUND");
    }
    const sourceField = `disciplines.${discipline}.xp`;
    return Object.freeze({
        discipline,
        primaryDiscipline,
        isPrimary: false,
        sourceField,
        authoritativeBeforeXp: xpValue(nested, sourceField),
        progression: nested,
        progressionPrefix: `disciplines.${discipline}.`,
        xpWriteTargets: Object.freeze([sourceField]),
        mirrorsTopLevel: false,
    });
}
