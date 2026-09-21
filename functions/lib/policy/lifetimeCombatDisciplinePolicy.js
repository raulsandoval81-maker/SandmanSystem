"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_COMBAT_DISCIPLINES = void 0;
exports.normalizeLifetimeCombatDiscipline = normalizeLifetimeCombatDiscipline;
exports.athleteCanonicalCombatDisciplines = athleteCanonicalCombatDisciplines;
exports.resolveAuthoritativeLifetimeCombatDiscipline = resolveAuthoritativeLifetimeCombatDiscipline;
exports.resolveLifetimeCombatDisciplineState = resolveLifetimeCombatDisciplineState;
exports.buildLifetimeCombatDisciplineUpdate = buildLifetimeCombatDisciplineUpdate;
exports.buildHistoricalLifetimeCombatDisciplineSet = buildHistoricalLifetimeCombatDisciplineSet;
exports.semanticChangesLifetime = semanticChangesLifetime;
exports.CANONICAL_COMBAT_DISCIPLINES = Object.freeze([
    "wrestling",
    "boxing",
    "muay-thai",
    "submission-grappling",
    "mma",
]);
const CANONICAL_SET = new Set(exports.CANONICAL_COMBAT_DISCIPLINES);
const APPROVED_ALIASES = Object.freeze({
    wrestling: "wrestling",
    boxing: "boxing",
    kickbox: "muay-thai",
    kickboxing: "muay-thai",
    muaythai: "muay-thai",
    "muay-thai": "muay-thai",
    bjj: "submission-grappling",
    grappling: "submission-grappling",
    submission: "submission-grappling",
    submissiongrappling: "submission-grappling",
    "submission-grappling": "submission-grappling",
    mma: "mma",
});
function normalizedToken(value) {
    return String(value ?? "").trim().toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");
}
function normalizeLifetimeCombatDiscipline(value) {
    const token = normalizedToken(value);
    const compact = token.replace(/-/g, "");
    const discipline = APPROVED_ALIASES[token] || APPROVED_ALIASES[compact];
    if (!discipline || !CANONICAL_SET.has(discipline)) {
        throw new Error(`UNKNOWN_LIFETIME_COMBAT_DISCIPLINE:${token || "EMPTY"}`);
    }
    return discipline;
}
function athleteCanonicalCombatDisciplines(athlete) {
    const candidates = [];
    if (Array.isArray(athlete?.disciplineIds))
        candidates.push(...athlete.disciplineIds);
    if (Array.isArray(athlete?.disciplines))
        candidates.push(...athlete.disciplines);
    else if (athlete?.disciplines && typeof athlete.disciplines === "object") {
        candidates.push(...Object.keys(athlete.disciplines));
    }
    candidates.push(athlete?.primaryDiscipline, athlete?.activeDiscipline, athlete?.discipline, athlete?.art, athlete?.sport);
    const normalized = new Set();
    for (const candidate of candidates) {
        if (!String(candidate ?? "").trim())
            continue;
        try {
            normalized.add(normalizeLifetimeCombatDiscipline(candidate));
        }
        catch { /* Non-Combat and retired labels do not establish Combat enrollment. */ }
    }
    return Object.freeze([...normalized]);
}
function resolveAuthoritativeLifetimeCombatDiscipline(args) {
    const enrolled = athleteCanonicalCombatDisciplines(args.athlete);
    const requested = String(args.requestedDiscipline ?? "").trim()
        ? normalizeLifetimeCombatDiscipline(args.requestedDiscipline) : null;
    const stored = String(args.storedEventDiscipline ?? "").trim()
        ? normalizeLifetimeCombatDiscipline(args.storedEventDiscipline) : null;
    if (stored && requested && stored !== requested) {
        throw new Error("LIFETIME_COMBAT_DISCIPLINE_EVENT_MISMATCH");
    }
    const resolved = stored || requested;
    if (resolved) {
        if (!enrolled.includes(resolved)) {
            throw new Error("LIFETIME_COMBAT_DISCIPLINE_NOT_ENROLLED");
        }
        return resolved;
    }
    if (enrolled.length === 1)
        return enrolled[0];
    if (enrolled.length === 0)
        throw new Error("LIFETIME_COMBAT_DISCIPLINE_NOT_ENROLLED");
    throw new Error("AMBIGUOUS_LIFETIME_COMBAT_DISCIPLINE");
}
function resolveLifetimeCombatDisciplineState(athlete) {
    const raw = athlete?.lifetimeCombatByDiscipline;
    if (raw === undefined || raw === null) {
        return Object.freeze({ mapPresent: false, mapValid: true, mapTotal: 0,
            byDiscipline: Object.freeze({}) });
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("INVALID_LIFETIME_COMBAT_DISCIPLINE_MAP");
    }
    const byDiscipline = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!CANONICAL_SET.has(key)) {
            throw new Error(`UNKNOWN_LIFETIME_COMBAT_DISCIPLINE_KEY:${key}`);
        }
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
            throw new Error(`INVALID_LIFETIME_COMBAT_DISCIPLINE_XP:${key}`);
        }
        if (amount > 0)
            byDiscipline[key] = amount;
    }
    const mapTotal = Object.values(byDiscipline).reduce((sum, value) => sum + value, 0);
    const aggregate = Number(athlete?.lifetimeCombatXp ?? 0);
    if (!Number.isFinite(aggregate) || aggregate < 0 || !Number.isInteger(aggregate)) {
        throw new Error("INVALID_LIFETIME_COMBAT_XP");
    }
    if (mapTotal !== aggregate) {
        throw new Error("LIFETIME_COMBAT_DISCIPLINE_INVARIANT_VIOLATION");
    }
    return Object.freeze({ mapPresent: true, mapValid: true, mapTotal,
        byDiscipline: Object.freeze(byDiscipline) });
}
function buildLifetimeCombatDisciplineUpdate(args) {
    const canonicalDiscipline = normalizeLifetimeCombatDiscipline(args.discipline);
    const state = resolveLifetimeCombatDisciplineState(args.athlete);
    if (!state.mapPresent) {
        return Object.freeze({ canonicalDiscipline, disciplineMapApplied: false,
            disciplineLifetimeBefore: null, disciplineLifetimeAfter: null,
            mapTotalBefore: null, mapTotalAfter: null, patch: Object.freeze({}) });
    }
    const before = Number(state.byDiscipline[canonicalDiscipline] ?? 0);
    const delta = args.effects.lifetimeComponentDelta;
    const after = before + delta;
    if (after < 0 || !Number.isInteger(after)) {
        throw new Error("LIFETIME_COMBAT_DISCIPLINE_UNDERFLOW");
    }
    const next = { ...state.byDiscipline };
    if (after === 0)
        delete next[canonicalDiscipline];
    else
        next[canonicalDiscipline] = after;
    const mapTotalAfter = Object.values(next).reduce((sum, value) => sum + value, 0);
    if (mapTotalAfter !== args.effects.componentAfter) {
        throw new Error("LIFETIME_COMBAT_DISCIPLINE_INVARIANT_VIOLATION");
    }
    return Object.freeze({ canonicalDiscipline, disciplineMapApplied: delta !== 0,
        disciplineLifetimeBefore: before, disciplineLifetimeAfter: after,
        mapTotalBefore: state.mapTotal, mapTotalAfter,
        patch: Object.freeze(delta === 0 ? {} : { lifetimeCombatByDiscipline: next }) });
}
function buildHistoricalLifetimeCombatDisciplineSet(args) {
    const athlete = { lifetimeCombatByDiscipline: args.byDiscipline,
        lifetimeCombatXp: args.lifetimeCombatXp };
    return resolveLifetimeCombatDisciplineState(athlete).byDiscipline;
}
function semanticChangesLifetime(semantic) {
    return semantic === "NEW_EARNED_XP" || semantic === "RECOGNIZED_PRIOR_EXPERIENCE"
        || semantic === "REVERSE_ERRONEOUS_AWARD";
}
