"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAMPIONSHIP_TOTALS = void 0;
exports.buildParentSignalInputs = buildParentSignalInputs;
exports.emitParentSignalsBestEffort = emitParentSignalsBestEffort;
exports.deriveTrustedStrengthAmount = deriveTrustedStrengthAmount;
exports.deriveYouthAssignmentAward = deriveYouthAssignmentAward;
exports.awardReceiptKey = awardReceiptKey;
exports.arenaLayerKey = arenaLayerKey;
exports.conflictingArenaBonusKind = conflictingArenaBonusKind;
exports.isPracticeDayAllowed = isPracticeDayAllowed;
exports.remainingChampionshipDelta = remainingChampionshipDelta;
exports.shouldEmitAwardSideEffects = shouldEmitAwardSideEffects;
exports.requestAwardIdentity = requestAwardIdentity;
exports.athleteTier = athleteTier;
exports.classifyAthlete = classifyAthlete;
exports.activeXpCap = activeXpCap;
exports.persistedStripeCount = persistedStripeCount;
exports.normalizeXpRequest = normalizeXpRequest;
exports.buildAwardPlan = buildAwardPlan;
exports.awardXpAuthoritatively = awardXpAuthoritatively;
exports.dispatchAuthoritativeXp = dispatchAuthoritativeXp;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const sendParentSignalToAthleteParents_1 = require("../modules/parent/sendParentSignalToAthleteParents");
const parentSignalTypes_1 = require("../modules/parent/parentSignalTypes");
const f8ProgressionPolicy_1 = require("../policy/f8ProgressionPolicy");
const xpDomainPolicy_1 = require("../policy/xpDomainPolicy");
const f8CurriculumCompatibilityPolicy_1 = require("../policy/f8CurriculumCompatibilityPolicy");
const f8StrengthHonorAccessPolicy_1 = require("../policy/f8StrengthHonorAccessPolicy");
exports.CHAMPIONSHIP_TOTALS = Object.freeze({
    COMPETE: 15,
    PLACE: 30,
    CHAMPION: 50,
});
const F4_CAPS = Object.freeze({
    T0: 1000, T1: 1600, T2: 2200, T3: 2800, T4: 3200,
});
const ARENA_AMOUNTS = Object.freeze({
    "ARENA/BATTLE": 10,
    "ARENA/WEEKEND_BATTLE": 15,
    "ARENA/PODIUM": 5,
    "ARENA/SECOND_DIVISION": 5,
    "ARENA/STYLEIQ": 5,
    "ARENA/EXTRA": 5,
    "ARENA/FORFEIT_WIN": 5,
    "ARENA/NO_OPP_DAY": 5,
    "ARENA/SPORTSMANSHIP": -5,
});
function buildParentSignalInputs(result) {
    const common = {
        athleteId: String(result.uid),
        athleteName: result.athleteName,
        source: "authoritativeXpService",
        sourceId: result.logId,
    };
    const signals = [];
    if (result.becameEligible) {
        signals.push({ ...common, type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.TESTING_ELIGIBLE });
    }
    if (result.earnedStripe) {
        signals.push({ ...common, type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.XP_MILESTONE,
            stripeCount: result.stripeCount });
    }
    if (result.kind === "ATTENDANCE") {
        signals.push({ ...common, type: parentSignalTypes_1.PARENT_SIGNAL_TYPES.DAILY_GRIND_LOGGED,
            amount: result.delta });
    }
    return signals;
}
async function emitParentSignalsBestEffort(result, sender = sendParentSignalToAthleteParents_1.sendParentSignalToAthleteParents) {
    for (const signal of buildParentSignalInputs(result)) {
        try {
            await sender(signal);
        }
        catch (error) {
            console.error("[authoritativeXpService] parent signal failed", error);
        }
    }
}
function requiredString(value, name) {
    const text = String(value ?? "").trim();
    if (!text)
        throw new https_1.HttpsError("invalid-argument", `${name} required`);
    return text;
}
function deriveTrustedStrengthAmount(entry) {
    if (!entry || typeof entry !== "object") {
        throw new https_1.HttpsError("failed-precondition", "TRUSTED_STRENGTH_SUBMISSION_REQUIRED");
    }
    const lane = String(entry.lane ?? "").trim().toLowerCase();
    const kind = String(entry.kind ?? "").trim().toLowerCase();
    if (lane === "conditioning" || kind === "remote_hiit")
        return 5;
    if (kind === "iron")
        return 10;
    const structuredStrength = lane === "strength" && [
        entry.main, entry.mainLift, entry.explosive, entry.secondary,
        entry.assistance, entry.conditioning,
    ].some((value) => String(value ?? "").trim());
    if (structuredStrength)
        return 10;
    throw new https_1.HttpsError("failed-precondition", "UNCLASSIFIED_STRENGTH_SUBMISSION");
}
function deriveYouthAssignmentAward(entry, requestedKind, assignment = entry) {
    if (!entry || typeof entry !== "object") {
        throw new https_1.HttpsError("failed-precondition", "TRUSTED_YOUTH_ASSIGNMENT_REQUIRED");
    }
    const lane = String(entry.lane ?? "").trim().toLowerCase();
    const track = String(entry.track ?? "").trim().toLowerCase();
    if (!assignment || typeof assignment !== "object") {
        throw new https_1.HttpsError("failed-precondition", "TRUSTED_YOUTH_ASSIGNMENT_REQUIRED");
    }
    const primaryLane = String(assignment.primaryLane ?? "").trim().toLowerCase();
    const kind = String(requestedKind ?? "").trim().toUpperCase();
    const strengthMinutes = Number(assignment.strengthMinutes);
    const honorMinutes = Number(assignment.honorMinutes);
    const totalMinutes = strengthMinutes + honorMinutes;
    const rewardXp = Number(assignment.rewardXp);
    const assignmentId = requiredString(assignment.assignmentId, "youth assignmentId");
    if (String(assignment.status ?? "").toLowerCase() !== "completed") {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_NOT_COMPLETED");
    }
    if (lane !== "conditioning" || track !== "f8") {
        throw new https_1.HttpsError("failed-precondition", "TRUSTED_YOUTH_ASSIGNMENT_REQUIRED");
    }
    if (!new Set(["strength", "honor"]).has(primaryLane)) {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_PRIMARY_LANE_REQUIRED");
    }
    if (kind !== primaryLane.toUpperCase()) {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_PRIMARY_LANE_MISMATCH");
    }
    if (!Number.isInteger(strengthMinutes) || !Number.isInteger(honorMinutes)
        || strengthMinutes < 0 || honorMinutes < 0
        || totalMinutes < 1 || totalMinutes > 30
        || Number(entry[`${primaryLane}Minutes`]) < 1) {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_DURATION_INVALID");
    }
    if (rewardXp !== 5) {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_REWARD_INVALID");
    }
    if (String(entry.assignmentId ?? "") !== assignmentId
        || String(entry.primaryLane ?? "").toLowerCase() !== primaryLane
        || Number(entry.strengthMinutes) !== strengthMinutes
        || Number(entry.honorMinutes) !== honorMinutes
        || Number(entry.totalMinutes) !== totalMinutes
        || Number(entry.rewardXp) !== rewardXp) {
        throw new https_1.HttpsError("failed-precondition", "YOUTH_ASSIGNMENT_COMPLETION_MISMATCH");
    }
    return 5;
}
function awardReceiptKey(uid, identity) {
    return stateKey(["xp-award-v1", requiredString(uid, "uid"), requiredString(identity, "identity")]);
}
function arenaLayerKey(kind) {
    return kind === "ARENA/BATTLE" || kind === "ARENA/WEEKEND_BATTLE"
        ? "PARTICIPATION" : kind;
}
function conflictingArenaBonusKind(kind) {
    if (kind === "ARENA/PODIUM")
        return "ARENA/SECOND_DIVISION";
    if (kind === "ARENA/SECOND_DIVISION")
        return "ARENA/PODIUM";
    return null;
}
function isPracticeDayAllowed(dayKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? "").trim());
    if (!match)
        throw new https_1.HttpsError("invalid-argument", "INVALID_PRACTICE_DAY_KEY");
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
    if (date.getUTCFullYear() !== Number(year)
        || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day)) {
        throw new https_1.HttpsError("invalid-argument", "INVALID_PRACTICE_DAY_KEY");
    }
    return date.getUTCDay() !== 0;
}
function remainingChampionshipDelta(target, alreadyAwarded) {
    return Math.max(0, Number(target) - Math.max(0, Number(alreadyAwarded) || 0));
}
function shouldEmitAwardSideEffects(result) {
    return result.idempotent !== true;
}
function requestAwardIdentity(request) {
    if (request.kind === "ATTENDANCE") {
        return `attendance:${requiredString(request.meta.attendanceSessionId, "meta.attendanceSessionId")}`;
    }
    if (request.kind === "STRENGTH" || request.kind === "HONOR") {
        if (String(request.meta.assignmentId ?? "").trim()) {
            return `youth-assignment:${requiredString(request.meta.assignmentId, "meta.assignmentId")}`;
        }
        return `lane-submission:${request.kind.toLowerCase()}:${requiredString(request.meta.key, "meta.key")}`;
    }
    if (request.kind.startsWith("CHAMPIONSHIP/")) {
        const tournamentId = requiredString(request.meta.tournamentId, "meta.tournamentId");
        const source = requiredString(request.meta.source ?? "championship-arena", "meta.source");
        return `championship:${source}:${tournamentId}:${request.kind.split("/")[1]}`;
    }
    if (request.kind.startsWith("ARENA/")) {
        const tournamentId = requiredString(request.meta.tournamentId, "meta.tournamentId");
        return `arena:${tournamentId}:${arenaLayerKey(request.kind)}`;
    }
    throw new https_1.HttpsError("invalid-argument", "STABLE_AWARD_IDENTITY_REQUIRED");
}
function athleteTier(athlete, base) {
    if (base === "F8")
        return (0, f8CurriculumCompatibilityPolicy_1.resolveF8ProgressionTier)(athlete);
    return String(athlete?.tier ?? athlete?.tierCode ?? athlete?.rank ?? "T0").toUpperCase();
}
function classifyAthlete(athlete, documentId = "") {
    const id = String(documentId || athlete?.uid || athlete?.id || "").toUpperCase();
    const markers = [athlete?.trackBase, athlete?.track, athlete?.programTrack,
        athlete?.trackCode, athlete?.journey, athlete?.program]
        .map((value) => String(value ?? "").toUpperCase()).join(" ");
    const f8 = id.startsWith("F8_") || /(^|\W)F8(\W|$)|FOUNDRY8|YOUTH/.test(markers);
    const f4 = id.startsWith("F4_") || /(^|\W)F4(\W|$)|FOUNDRY4|PATH2LEGEND|TEEN/.test(markers);
    const adult = /ADULT|Q2M|QUEST2MASTERY|MASTERY/.test(markers);
    const matches = [f8, f4, adult].filter(Boolean).length;
    if (matches !== 1) {
        throw new https_1.HttpsError("failed-precondition", matches > 1 ? "AMBIGUOUS_ATHLETE_PROGRAM" : "UNCLASSIFIED_ATHLETE_PROGRAM");
    }
    if (f8)
        return "F8";
    if (adult)
        return "ADULT";
    return "F4";
}
function activeXpCap(athlete, base) {
    const tier = athleteTier(athlete, base);
    if (base === "F8")
        return (0, f8ProgressionPolicy_1.resolveF8RankXpCap)(tier);
    return Number(athlete?.xpCap || F4_CAPS[tier] || 1000);
}
function persistedStripeCount(base, tier, xp, cap) {
    if (base === "F8")
        return (0, f8ProgressionPolicy_1.calculateF8StripeCount)(tier, xp);
    const ratio = cap > 0 ? Math.max(0, xp) / cap : 0;
    if (ratio >= 1)
        return 4;
    if (ratio >= 0.75)
        return 3;
    if (ratio >= 0.5)
        return 2;
    if (ratio >= 0.25)
        return 1;
    return 0;
}
function normalizeXpRequest(input) {
    const uid = requiredString(input?.uid, "uid");
    const originalKind = requiredString(input?.kind, "kind").toUpperCase();
    const meta = input?.meta && typeof input.meta === "object" ? { ...input.meta } : {};
    let kind = originalKind === "DAILY_GRIND" ? "ATTENDANCE" : originalKind;
    if (kind === "TOURNAMENT") {
        throw new https_1.HttpsError("invalid-argument", "Legacy TOURNAMENT cannot be inferred. Use an explicit ARENA/* award with meta.tournamentId.");
    }
    if (kind === "PRESTIGE") {
        const result = String(meta.result ?? meta.outcome ?? "").toUpperCase();
        if (!String(meta.tournamentId ?? "").trim() || !(result in exports.CHAMPIONSHIP_TOTALS)) {
            throw new https_1.HttpsError("invalid-argument", "PRESTIGE requires meta.tournamentId and meta.result COMPETE, PLACE, or CHAMPION.");
        }
        kind = `CHAMPIONSHIP/${result}`;
        meta.compatibilityKind = "PRESTIGE";
    }
    const championship = kind.startsWith("CHAMPIONSHIP/");
    const result = kind.split("/")[1];
    const defaultAmount = championship
        ? exports.CHAMPIONSHIP_TOTALS[result]
        : kind === "ATTENDANCE" ? 10
            : kind === "STRENGTH" || kind === "HONOR" ? 5
                : ARENA_AMOUNTS[kind];
    const amount = championship ? Number(defaultAmount) : Number(input?.amount ?? defaultAmount);
    if (!Number.isFinite(amount))
        throw new https_1.HttpsError("invalid-argument", "amount must be a number");
    return { uid, kind, amount, note: String(input?.note ?? "").trim(), meta };
}
function laneFor(kind) {
    if (kind.startsWith("CHAMPIONSHIP/"))
        return "championship";
    if (kind.startsWith("ARENA/"))
        return "arena";
    if (kind === "STRENGTH")
        return "strength";
    if (kind === "HONOR")
        return "honor";
    return "combat";
}
function validateAndResolveAmount(base, request) {
    const { kind, amount } = request;
    if (kind.startsWith("CHAMPIONSHIP/"))
        return amount;
    if (kind === "ATTENDANCE") {
        const approved = base === "F8" ? [...f8ProgressionPolicy_1.F8_SOURCE_XP_VALUES.combatPractice] : [5, 10, 15, 20];
        if (!approved.includes(amount))
            throw new https_1.HttpsError("invalid-argument", `${base} practice amount is not approved`);
        return amount;
    }
    if (kind === "STRENGTH") {
        if (![5, 10].includes(amount))
            throw new https_1.HttpsError("invalid-argument", "STRENGTH amount must be 5 or 10");
        return amount;
    }
    if (kind === "HONOR") {
        const approved = base === "F8" ? [5] : [5, 10];
        if (!approved.includes(amount))
            throw new https_1.HttpsError("invalid-argument", "HONOR amount is not approved");
        return amount;
    }
    if (!(kind in ARENA_AMOUNTS))
        throw new https_1.HttpsError("invalid-argument", `Unsupported kind: ${kind}`);
    if (amount !== ARENA_AMOUNTS[kind])
        throw new https_1.HttpsError("invalid-argument", `${kind} amount is not approved`);
    if (base === "F8") {
        if (kind === "ARENA/BATTLE")
            return 10;
        if (kind === "ARENA/WEEKEND_BATTLE")
            return 15;
        if (kind === "ARENA/STYLEIQ")
            return 0;
        if (!["ARENA/PODIUM", "ARENA/SECOND_DIVISION"].includes(kind)) {
            throw new https_1.HttpsError("invalid-argument", `F8 competition kind is not approved: ${kind}`);
        }
    }
    return amount;
}
function buildAwardPlan(args) {
    const { athlete, athleteId, request } = args;
    const base = classifyAthlete(athlete, athleteId);
    const tier = athleteTier(athlete, base);
    const xpCap = activeXpCap(athlete, base);
    const beforeXp = (0, xpDomainPolicy_1.resolveAuthoritativeActiveRankXp)(athlete);
    if (!Number.isFinite(beforeXp) || beforeXp < 0) {
        throw new https_1.HttpsError("failed-precondition", "INVALID_ACTIVE_XP");
    }
    const lane = laneFor(request.kind);
    const source = String(request.meta.source ?? (lane === "championship" ? "championship-arena" : "engine"));
    let requestedDelta = validateAndResolveAmount(base, request);
    let championshipTarget = null;
    let practiceStateAfter = null;
    let arenaEventStateAfter = null;
    if (lane === "championship") {
        const result = request.kind.split("/")[1];
        championshipTarget = exports.CHAMPIONSHIP_TOTALS[result] ?? null;
        if (championshipTarget === null)
            throw new https_1.HttpsError("invalid-argument", "Unknown championship result");
        const matchCount = Number(request.meta.matchCount);
        if ((result === "PLACE" || result === "CHAMPION") && (!Number.isInteger(matchCount) || matchCount < 3)) {
            throw new https_1.HttpsError("failed-precondition", "CHAMPIONSHIP_REQUIRES_THREE_MATCHES");
        }
        requestedDelta = remainingChampionshipDelta(championshipTarget, Number(args.championshipAwarded ?? 0));
        if (requestedDelta === 0)
            throw new https_1.HttpsError("already-exists", "CHAMPIONSHIP_TARGET_ALREADY_AWARDED");
    }
    const m = args.monthly && typeof args.monthly === "object" ? args.monthly : {};
    const strength = Number(m.strength ?? 0);
    const honor = Number(m.honor ?? 0);
    let monthlyField = null;
    let monthlyAfter = null;
    if (request.kind === "ATTENDANCE") {
        if ((base === "F4" || base === "ADULT") && tier === "T0" && requestedDelta > 10) {
            throw new https_1.HttpsError("failed-precondition", "APPRENTICE_PRACTICE_XP_CEILING");
        }
        monthlyField = "attendance";
        monthlyAfter = Number(m.attendance ?? 0) + requestedDelta;
        if (monthlyAfter > 225)
            throw new https_1.HttpsError("failed-precondition", "MONTHLY_ATTENDANCE_CAP_REACHED");
        const count = Number(args.practiceState?.count ?? 0);
        const dailyXp = Number(args.practiceState?.xp ?? 0);
        const durationMinutes = Number(request.meta.durationMinutes ?? 60);
        const dailyLimit = base === "F8" ? 20 : durationMinutes >= 120 ? 20 : durationMinutes >= 90 ? 15 : 10;
        if (count >= 2 || dailyXp + requestedDelta > dailyLimit) {
            throw new https_1.HttpsError("failed-precondition", base === "F8" ? "F8_DAILY_PRACTICE_LIMIT_REACHED" : "DAILY_GRIND_XP_LIMIT");
        }
        practiceStateAfter = { count: count + 1, xp: dailyXp + requestedDelta };
    }
    else if (lane === "arena") {
        monthlyField = "arena";
        monthlyAfter = Number(m.arena ?? 0) + requestedDelta;
        const cap = base === "F8"
            ? (0, f8ProgressionPolicy_1.resolveF8CompetitionMonthlyCap)(tier)
            : base === "F4" ? 80 : 40;
        if (monthlyAfter > cap)
            throw new https_1.HttpsError("failed-precondition", "MONTHLY_ARENA_CAP_REACHED");
        if (base === "F8") {
            const eventXp = Number(args.arenaEventState?.xp ?? 0);
            const kinds = { ...(args.arenaEventState?.kinds ?? {}) };
            const layerKey = arenaLayerKey(request.kind);
            const conflictingBonusKind = conflictingArenaBonusKind(request.kind);
            if (conflictingBonusKind && kinds[arenaLayerKey(conflictingBonusKind)]) {
                throw new https_1.HttpsError("already-exists", "ARENA_PODIUM_SECOND_DIVISION_MUTUALLY_EXCLUSIVE");
            }
            if (request.kind !== "ARENA/STYLEIQ" && kinds[layerKey]) {
                throw new https_1.HttpsError("already-exists", "F8_TOURNAMENT_LAYER_ALREADY_AWARDED");
            }
            if (eventXp + requestedDelta > f8ProgressionPolicy_1.F8_SOURCE_XP_VALUES.tournament.maximum) {
                throw new https_1.HttpsError("failed-precondition", "F8_TOURNAMENT_XP_MAX_REACHED");
            }
            kinds[layerKey] = true;
            arenaEventStateAfter = { xp: eventXp + requestedDelta, kinds };
        }
    }
    else if (lane === "strength" || lane === "honor") {
        monthlyField = lane;
        monthlyAfter = Number(m[lane] ?? 0) + requestedDelta;
        if (base === "F8") {
            const cap = (0, f8ProgressionPolicy_1.resolveF8CombinedStrengthHonorMonthlyCap)(tier);
            if (strength + honor + requestedDelta > cap) {
                throw new https_1.HttpsError("failed-precondition", "MONTHLY_STRENGTH_HONOR_CAP_REACHED");
            }
        }
        else if (monthlyAfter > 120) {
            throw new https_1.HttpsError("failed-precondition", `MONTHLY_${lane.toUpperCase()}_CAP_REACHED`);
        }
    }
    const affectsMainXp = lane !== "strength" && lane !== "honor" || base === "F8";
    const unclamped = affectsMainXp ? beforeXp + requestedDelta : beforeXp;
    const afterXp = Math.max(0, Math.min(xpCap, unclamped));
    const delta = affectsMainXp ? afterXp - beforeXp : requestedDelta;
    if (affectsMainXp && requestedDelta > 0 && delta === 0) {
        throw new https_1.HttpsError("failed-precondition", "XP_CAP_REACHED");
    }
    const bucketField = request.kind === "ATTENDANCE" ? "xpDaily"
        : lane === "arena" ? (request.kind === "ARENA/STYLEIQ" ? "xpFightIQ" : "xpArena")
            : lane === "strength" ? "xpStrength" : lane === "honor" ? "xpHonor" : null;
    return {
        base, tier, kind: request.kind, lane, source, beforeXp, afterXp, xpCap, delta,
        stripeCount: persistedStripeCount(base, tier, afterXp, xpCap),
        monthlyField, monthlyAfter,
        monthlyStrengthAfter: strength + (lane === "strength" ? requestedDelta : 0),
        monthlyHonorAfter: honor + (lane === "honor" ? requestedDelta : 0),
        championshipTarget, bucketField, practiceStateAfter, arenaEventStateAfter,
    };
}
function monthKey(ts) {
    const d = ts.toDate();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function championshipEventKey(uid, tournamentId, source) {
    return (0, node_crypto_1.createHash)("sha256").update(`${uid}|${tournamentId}|${source}`).digest("hex").slice(0, 32);
}
function pacificDayKey(ts) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(ts.toDate());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function stateKey(parts) {
    return (0, node_crypto_1.createHash)("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 32);
}
async function awardXpAuthoritatively(coachUid, input) {
    if (!String(coachUid ?? "").trim())
        throw new https_1.HttpsError("unauthenticated", "coachUid required");
    const request = normalizeXpRequest(input);
    const db = (0, firestore_1.getFirestore)();
    const now = firestore_1.Timestamp.now();
    const mk = monthKey(now);
    const athleteRef = db.doc(`athletes/${request.uid}`);
    const canonicalLogRef = db.collection("xpLogs").doc();
    const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(athleteRef);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", `athlete not found: ${request.uid}`);
        const athlete = snap.data() || {};
        const testingState = String(athlete?.testing?.state ?? "").toUpperCase();
        if (["COOLDOWN", "FREEZE"].includes(testingState) || String(athlete?.status ?? "").toUpperCase() === "FROZEN") {
            throw new https_1.HttpsError("failed-precondition", testingState || "FROZEN");
        }
        const provisionalBase = classifyAthlete(athlete, request.uid);
        const progressionCycleId = String(athlete?.progressionCycle?.id ?? "").trim()
            || `legacy:${athleteTier(athlete, provisionalBase)}`;
        let trustedDiscipline = "";
        let trustedPracticeDayKey = "";
        if (request.kind === "ATTENDANCE") {
            const attendanceSessionId = requiredString(request.meta.attendanceSessionId, "meta.attendanceSessionId");
            const attendanceSnap = await tx.get(db.doc(`attendance_sessions/${attendanceSessionId}`));
            if (!attendanceSnap.exists) {
                throw new https_1.HttpsError("failed-precondition", "TRUSTED_ATTENDANCE_SESSION_REQUIRED");
            }
            const session = attendanceSnap.data() || {};
            if (String(session.status ?? "").toLowerCase() !== "finalized" || session.finalized !== true) {
                throw new https_1.HttpsError("failed-precondition", "ATTENDANCE_SESSION_NOT_FINALIZED");
            }
            const presentIds = Array.isArray(session.presentIds) ? session.presentIds.map(String) : [];
            if (!presentIds.includes(request.uid)) {
                throw new https_1.HttpsError("failed-precondition", "ATHLETE_NOT_PRESENT_IN_ATTENDANCE_SESSION");
            }
            const trustedSessionId = String(session.sessionId || session.liveSessionId || attendanceSessionId);
            if (requiredString(request.meta.sessionId, "meta.sessionId") !== trustedSessionId) {
                throw new https_1.HttpsError("failed-precondition", "ATTENDANCE_SESSION_ID_MISMATCH");
            }
            trustedDiscipline = requiredString(session.discipline, "attendance discipline").toLowerCase();
            trustedPracticeDayKey = requiredString(session.sessionDateKey, "attendance sessionDateKey");
            if (!isPracticeDayAllowed(trustedPracticeDayKey)) {
                throw new https_1.HttpsError("failed-precondition", "ATTENDANCE_BLOCKED_SUNDAY");
            }
            request.meta.discipline = trustedDiscipline;
            request.meta.sessionDateKey = trustedPracticeDayKey;
            request.meta.durationMinutes = Number(session.durationMinutes ?? request.meta.durationMinutes ?? 60);
        }
        if (request.kind === "STRENGTH" || request.kind === "HONOR") {
            const expectedSource = request.kind === "STRENGTH" ? "lane-review" : "honor_lane_review";
            if (String(request.meta.source ?? "") !== expectedSource) {
                throw new https_1.HttpsError("failed-precondition", `TRUSTED_${request.kind}_SOURCE_REQUIRED`);
            }
            const key = requiredString(request.meta.key, "meta.key");
            const submissionSnap = await tx.get(db.doc(`laneSubmissions/${request.uid}`));
            const submissionData = submissionSnap.data() || {};
            const entry = submissionData[key];
            if (!entry || typeof entry !== "object") {
                throw new https_1.HttpsError("failed-precondition", "TRUSTED_LANE_SUBMISSION_REQUIRED");
            }
            const isYouthAssignment = String(entry.lane ?? "").toLowerCase() === "conditioning"
                && String(entry.track ?? "").toLowerCase() === "f8"
                && String(entry.assignmentId ?? "").trim().length > 0;
            if (isYouthAssignment) {
                const assignment = submissionData.conditioning_assignment;
                request.amount = deriveYouthAssignmentAward(entry, request.kind, assignment);
                request.meta.authoritativeAmount = request.amount;
                request.meta.submissionLane = String(entry.lane ?? "");
                request.meta.primaryLane = String(assignment?.primaryLane ?? "");
                request.meta.assignmentId = String(assignment?.assignmentId ?? "");
            }
            else if (request.kind === "STRENGTH") {
                request.amount = deriveTrustedStrengthAmount(entry);
                request.meta.authoritativeAmount = request.amount;
                request.meta.submissionLane = String(entry.lane ?? "");
            }
            else if (String(entry.lane ?? "").toLowerCase() !== "honor") {
                throw new https_1.HttpsError("failed-precondition", "TRUSTED_HONOR_SUBMISSION_REQUIRED");
            }
        }
        const awardIdentity = requestAwardIdentity(request);
        const receiptRef = db.collection("xpAwardReceipts").doc(awardReceiptKey(request.uid, awardIdentity));
        const receiptSnap = await tx.get(receiptRef);
        if (receiptSnap.exists) {
            const prior = receiptSnap.data()?.result || {};
            return {
                ...prior, ok: true, idempotent: true, duplicate: true,
                awardedAmount: Number(prior.awardedAmount ?? prior.amount ?? 0),
                delta: 0, amount: 0, lifetimeXpDelta: 0,
            };
        }
        const conflictingBonusKind = conflictingArenaBonusKind(request.kind);
        if (conflictingBonusKind) {
            const tournamentId = requiredString(request.meta.tournamentId, "meta.tournamentId");
            const conflictingIdentity = `arena:${tournamentId}:${arenaLayerKey(conflictingBonusKind)}`;
            const conflictingReceiptRef = db.collection("xpAwardReceipts").doc(awardReceiptKey(request.uid, conflictingIdentity));
            if ((await tx.get(conflictingReceiptRef)).exists) {
                throw new https_1.HttpsError("already-exists", "ARENA_PODIUM_SECOND_DIVISION_MUTUALLY_EXCLUSIVE");
            }
        }
        const monthlyRoot = athlete.monthly && typeof athlete.monthly === "object" ? athlete.monthly : {};
        const monthly = monthlyRoot[mk] && typeof monthlyRoot[mk] === "object" ? monthlyRoot[mk] : {};
        let championshipAwarded = 0;
        let championshipLogId = "";
        let championshipKey = "";
        let championshipStateRef = null;
        let practiceStateRef = null;
        let practiceState = {};
        let arenaEventStateRef = null;
        let arenaEventState = {};
        if (request.kind.startsWith("CHAMPIONSHIP/")) {
            const tournamentId = requiredString(request.meta.tournamentId, "meta.tournamentId");
            const source = String(request.meta.source ?? "championship-arena");
            if (!new Set(["championship-arena", "declared-championship"]).has(source)) {
                throw new https_1.HttpsError("invalid-argument", "Invalid championship source");
            }
            championshipKey = championshipEventKey(request.uid, tournamentId, source);
            championshipStateRef = db.collection("championshipXpState").doc(championshipKey);
            const championshipState = await tx.get(championshipStateRef);
            championshipAwarded = Number(championshipState.data()?.awarded ?? 0);
            championshipLogId = String(championshipState.data()?.logId ?? "");
        }
        if (request.kind === "ATTENDANCE") {
            practiceStateRef = db.collection("f8PracticeDayState").doc(stateKey([request.uid, trustedPracticeDayKey, trustedDiscipline]));
            practiceState = (await tx.get(practiceStateRef)).data() || {};
        }
        if (provisionalBase === "F8" && request.kind.startsWith("ARENA/")) {
            const tournamentId = requiredString(request.meta.tournamentId, "meta.tournamentId");
            arenaEventStateRef = db.collection("f8ArenaEventState").doc(stateKey([request.uid, tournamentId]));
            arenaEventState = (await tx.get(arenaEventStateRef)).data() || {};
        }
        if (request.kind.startsWith("CHAMPIONSHIP/")) {
            const target = exports.CHAMPIONSHIP_TOTALS[request.kind.split("/")[1]];
            if (target <= championshipAwarded) {
                return {
                    ok: true, blocked: false, idempotent: true, duplicate: true,
                    uid: request.uid, kind: request.kind, delta: 0, amount: 0, awardedAmount: 0,
                    beforeXp: Number(athlete.xp ?? 0), afterXp: Number(athlete.xp ?? 0),
                    lifetimeXpBefore: Number(athlete.lifetimeXp ?? 0),
                    lifetimeXpAfter: Number(athlete.lifetimeXp ?? 0), lifetimeXpDelta: 0,
                    xpCap: activeXpCap(athlete, provisionalBase),
                    stripeCount: Number(athlete.stripeCount ?? 0),
                    beforeStripeCount: Number(athlete.stripeCount ?? 0),
                    earnedStripe: false, becameEligible: false,
                    athleteName: athlete.publicName || athlete.fullName || athlete.name || request.uid,
                    parentUid: athlete.parentUid || null, base: provisionalBase,
                    tier: athleteTier(athlete, provisionalBase), monthKey: mk,
                    logId: championshipLogId,
                };
            }
        }
        const plan = buildAwardPlan({ athlete, athleteId: request.uid, request, monthly,
            championshipAwarded, practiceState, arenaEventState });
        const lifetimeXp = (0, xpDomainPolicy_1.resolveLifetimeXpAccumulation)(athlete, plan.beforeXp, plan.afterXp);
        const beforeStripeCount = persistedStripeCount(plan.base, plan.tier, plan.beforeXp, plan.xpCap);
        const athletePatch = {
            xp: plan.afterXp,
            xpCap: plan.xpCap,
            stripeCount: plan.stripeCount,
            trackBase: plan.base,
            updatedAt: now,
        };
        if (plan.base === "F8") {
            const remoteAccess = (0, f8StrengthHonorAccessPolicy_1.resolveF8RemoteAccess)({
                ...athlete,
                progressionTier: plan.tier,
                stripeCount: plan.stripeCount,
            });
            if (remoteAccess.gatewayReached) {
                athletePatch["unlocks.strength"] = true;
                athletePatch["unlocks.honor"] = true;
            }
        }
        if (lifetimeXp.delta > 0)
            athletePatch.lifetimeXp = lifetimeXp.after;
        if (plan.monthlyField && plan.monthlyAfter !== null) {
            athletePatch[`monthly.${mk}.${plan.monthlyField}`] = plan.monthlyAfter;
        }
        if (plan.bucketField && plan.delta !== 0) {
            athletePatch[plan.bucketField] = firestore_1.FieldValue.increment(plan.delta);
        }
        const ratio = plan.xpCap > 0 ? plan.afterXp / plan.xpCap : 0;
        const currentState = String(athlete?.testing?.state ?? "ACTIVE").toUpperCase();
        if ((currentState === "ACTIVE" || currentState === "TEMPLE") && ratio >= 1) {
            athletePatch["testing.state"] = "ELIGIBLE";
            athletePatch.tierStatus = "eligible";
            athletePatch["testing.testEligibleAt"] = now;
        }
        else if (currentState === "ACTIVE" && ratio >= 0.9) {
            athletePatch["testing.state"] = "TEMPLE";
            athletePatch.tierStatus = "temple";
            athletePatch["testing.templeEnteredAt"] = now;
        }
        tx.set(athleteRef, athletePatch, { merge: true });
        const log = {
            createdAt: now, monthKey: mk, uid: request.uid, coachUid,
            kind: plan.kind, lane: plan.lane, amount: plan.delta,
            beforeXp: plan.beforeXp, afterXp: plan.afterXp, xpCap: plan.xpCap,
            lifetimeXpBefore: lifetimeXp.before, lifetimeXpAfter: lifetimeXp.after,
            lifetimeXpDelta: lifetimeXp.delta,
            base: plan.base, tier: plan.tier, note: request.note,
            meta: { ...request.meta, source: plan.source, championshipTarget: plan.championshipTarget },
        };
        tx.set(canonicalLogRef, { ...log, awardIdentity, progressionCycleId });
        tx.set(db.collection("xp_logs").doc(canonicalLogRef.id), {
            ...log, awardIdentity, progressionCycleId, compatibilityMirror: true,
        });
        tx.set(db.collection("xp_monthly").doc(`${request.uid}_${mk}`), {
            uid: request.uid, month: mk,
            ...(plan.monthlyField && plan.monthlyAfter !== null ? { [plan.monthlyField]: plan.monthlyAfter } : {}),
            updatedAt: now, compatibilityMirror: true,
        }, { merge: true });
        if (championshipStateRef && plan.championshipTarget !== null) {
            tx.set(championshipStateRef, {
                uid: request.uid,
                tournamentId: request.meta.tournamentId,
                source: plan.source,
                awarded: plan.championshipTarget,
                logId: canonicalLogRef.id,
                updatedAt: now,
            }, { merge: true });
        }
        if (practiceStateRef && plan.practiceStateAfter) {
            tx.set(practiceStateRef, { uid: request.uid, dayKey: trustedPracticeDayKey,
                discipline: trustedDiscipline,
                ...plan.practiceStateAfter, updatedAt: now }, { merge: true });
        }
        if (arenaEventStateRef && plan.arenaEventStateAfter) {
            tx.set(arenaEventStateRef, { uid: request.uid, tournamentId: request.meta.tournamentId,
                ...plan.arenaEventStateAfter, updatedAt: now }, { merge: true });
        }
        const becameEligible = (currentState === "ACTIVE" || currentState === "TEMPLE") && ratio >= 1;
        const awardResult = { ok: true, blocked: false, idempotent: false, duplicate: false,
            uid: request.uid, kind: plan.kind,
            delta: plan.delta, amount: plan.delta, awardedAmount: plan.delta,
            beforeXp: plan.beforeXp, afterXp: plan.afterXp,
            lifetimeXpBefore: lifetimeXp.before, lifetimeXpAfter: lifetimeXp.after,
            lifetimeXpDelta: lifetimeXp.delta,
            xpCap: plan.xpCap, stripeCount: plan.stripeCount, beforeStripeCount,
            earnedStripe: plan.stripeCount > beforeStripeCount, becameEligible,
            athleteName: athlete.publicName || athlete.fullName || athlete.name || request.uid,
            parentUid: athlete.parentUid || null,
            base: plan.base, tier: plan.tier, monthKey: mk, logId: canonicalLogRef.id,
            awardIdentity, progressionCycleId };
        tx.create(receiptRef, {
            uid: request.uid, awardIdentity, progressionCycleId,
            kind: plan.kind, source: plan.source,
            createdAt: now, logId: canonicalLogRef.id, result: awardResult,
        });
        return awardResult;
    });
    if (shouldEmitAwardSideEffects(result))
        try {
            const leaderboardTrack = result.base === "F8" ? "foundry8" : "foundry4";
            const entry = { uid: result.uid, xp: result.delta, kind: result.kind,
                base: result.base, tier: result.tier, sourceLogId: result.logId, createdAt: now };
            await Promise.all([
                db.collection("leaderboards").doc(leaderboardTrack).collection("months")
                    .doc(result.monthKey).collection("entries").add(entry),
                db.collection("leaderboards").doc(leaderboardTrack).collection("lifetime")
                    .doc("summary").collection("entries").add(entry),
            ]);
        }
        catch (error) {
            console.error("[authoritativeXpService] compatibility leaderboard write failed", error);
        }
    if (shouldEmitAwardSideEffects(result))
        await emitParentSignalsBestEffort(result);
    return result;
}
async function dispatchAuthoritativeXp(coachUid, payload, award = awardXpAuthoritatively) {
    return award(coachUid, payload);
}
