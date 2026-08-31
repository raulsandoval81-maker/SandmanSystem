"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeTestingSession = exports.BASE_CHECK_SCORE_KEYS = exports.MAX_PANEL_SUBMISSIONS = exports.MIN_PANEL_SUBMISSIONS = exports.ALLOWED_PANEL_SLOTS = exports.TESTING_PASSING_SCORE = void 0;
exports.calculateAuthoritativePanelResult = calculateAuthoritativePanelResult;
exports.finalizeTestingSessionAuthoritatively = finalizeTestingSessionAuthoritatively;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const passAthleteTest_1 = require("./passAthleteTest");
const freezeAthlete_1 = require("./freezeAthlete");
exports.TESTING_PASSING_SCORE = 85;
exports.ALLOWED_PANEL_SLOTS = Object.freeze(["A", "B", "C"]);
exports.MIN_PANEL_SUBMISSIONS = 2;
exports.MAX_PANEL_SUBMISSIONS = 3;
exports.BASE_CHECK_SCORE_KEYS = Object.freeze([
    "0-0", "0-1", "0-2", "0-3",
    "1-0", "1-1", "1-2", "1-3",
    "2-0", "2-1", "2-2",
    "3-0", "3-1", "3-2",
    "4-0", "4-1", "4-2",
    "5-0", "5-1", "5-2",
]);
function requiredIdentity(value, field) {
    const result = String(value ?? "").trim();
    if (!result)
        throw new https_1.HttpsError("invalid-argument", `${field} required`);
    return result;
}
function calculateAuthoritativePanelResult(submissions) {
    if (submissions.length < exports.MIN_PANEL_SUBMISSIONS ||
        submissions.length > exports.MAX_PANEL_SUBMISSIONS) {
        throw new https_1.HttpsError("failed-precondition", "TWO_TO_THREE_PANEL_SUBMISSIONS_REQUIRED");
    }
    const panels = submissions.map((submission) => {
        if (String(submission?.status ?? "").toLowerCase() !== "final"
            || String(submission?.testId ?? "") !== "test1"
            || Number(submission?.version) !== 1) {
            throw new https_1.HttpsError("failed-precondition", "MALFORMED_BASE_CHECK_SUBMISSION");
        }
        const panel = requiredIdentity(submission?.panel, "panel").toUpperCase();
        const coachId = requiredIdentity(submission?.coachId, "coachId").toLowerCase();
        if (!exports.ALLOWED_PANEL_SLOTS.includes(panel)) {
            throw new https_1.HttpsError("failed-precondition", "INVALID_PANEL_SLOT");
        }
        const scores = submission?.scores;
        if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
            throw new https_1.HttpsError("failed-precondition", "MALFORMED_PANEL_SCORES");
        }
        const keys = Object.keys(scores).sort();
        const expected = [...exports.BASE_CHECK_SCORE_KEYS].sort();
        if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
            throw new https_1.HttpsError("failed-precondition", "MALFORMED_PANEL_SCORES");
        }
        const total = exports.BASE_CHECK_SCORE_KEYS.reduce((sum, key) => {
            const score = Number(scores[key]);
            if (![0, 3, 5].includes(score)) {
                throw new https_1.HttpsError("failed-precondition", "MALFORMED_PANEL_SCORE_VALUE");
            }
            return sum + score;
        }, 0);
        if (Number(submission?.total) !== total) {
            throw new https_1.HttpsError("failed-precondition", "PANEL_TOTAL_MISMATCH");
        }
        return Object.freeze({ panel, coachId, total });
    });
    if (new Set(panels.map((entry) => entry.panel)).size !== panels.length) {
        throw new https_1.HttpsError("failed-precondition", "DUPLICATE_PANEL_SLOT");
    }
    if (new Set(panels.map((entry) => entry.coachId)).size !== panels.length) {
        throw new https_1.HttpsError("failed-precondition", "DUPLICATE_PANEL_COACH");
    }
    if (!panels.some((entry) => entry.panel === "A")
        || !panels.some((entry) => entry.panel === "B")) {
        throw new https_1.HttpsError("failed-precondition", "MISSING_REQUIRED_PANEL_SLOT");
    }
    const average = Number((panels.reduce((sum, entry) => sum + entry.total, 0)
        / panels.length).toFixed(1));
    return Object.freeze({
        average,
        result: average >= exports.TESTING_PASSING_SCORE ? "PASS" : "FAIL",
        panels: Object.freeze(panels),
    });
}
async function finalizeTestingSessionAuthoritatively(input) {
    const uid = requiredIdentity(input?.uid ?? input?.athleteId, "uid");
    const sessionId = requiredIdentity(input?.sessionId, "sessionId");
    const testType = requiredIdentity(input?.testType, "testType");
    const db = (0, firestore_1.getFirestore)();
    const finalizationId = (0, node_crypto_1.createHash)("sha256")
        .update(`${uid}|${sessionId}|${testType}`).digest("hex").slice(0, 32);
    const finalizationRef = db.doc(`athletes/${uid}/testingSessionFinalizations/${finalizationId}`);
    const existing = await finalizationRef.get();
    if (existing.exists)
        return { ...(existing.data()?.result || {}), idempotent: true };
    const logs = await db.collection(`athletes/${uid}/testingLogs`)
        .where("sessionId", "==", sessionId).get();
    const matching = logs.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((entry) => String(entry.testType ?? "") === testType);
    const panelResult = calculateAuthoritativePanelResult(matching);
    const transition = panelResult.result === "PASS"
        ? await (0, passAthleteTest_1.passAthleteTestAuthoritatively)(uid, panelResult.average)
        : await (0, freezeAthlete_1.freezeAthleteAuthoritatively)(uid, panelResult.average, `session:${sessionId}:${testType}`);
    const result = {
        ok: true, idempotent: false, uid, sessionId, testType,
        average: panelResult.average, result: panelResult.result,
        panels: panelResult.panels, transition,
    };
    return db.runTransaction(async (tx) => {
        const saved = await tx.get(finalizationRef);
        if (saved.exists)
            return { ...(saved.data()?.result || {}), idempotent: true };
        const athleteRef = db.doc(`athletes/${uid}`);
        tx.update(athleteRef, {
            "testing.baseCheckV1.testType": testType,
            "testing.baseCheckV1.sessionId": sessionId,
            "testing.baseCheckV1.decision": panelResult.result,
            "testing.baseCheckV1.finalResult": panelResult.result,
            "testing.baseCheckV1.avgScore": panelResult.average,
            "testing.baseCheckV1.coachCount": panelResult.panels.length,
            "testing.baseCheckV1.authoritative": true,
            "testing.baseCheckV1.finalizedAt": firestore_1.FieldValue.serverTimestamp(),
            "testing.lastDecision": panelResult.result,
            "testing.lastDecisionAt": firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.create(finalizationRef, {
            uid, sessionId, testType, result,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return result;
    });
}
exports.finalizeTestingSession = (0, https_1.onCall)(async (req) => finalizeTestingSessionAuthoritatively(req.data));
