"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.closePracticeSession = exports.savePracticeSessionMemory = exports.getPracticeSession = exports.openPracticeSession = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const crossTrainingPolicy_1 = require("../schedules/crossTrainingPolicy");
const PRACTICE_STAFF_ROLES = staffAuthorization_1.COACH_STAFF_ROLES;
const EXECUTION_MODES = new Set(["manual", "hybrid", "quick", "checked-in"]);
const MEMORY_OPERATIONS = new Set(["plan", "worked", "reflection"]);
function requiredString(value, field) {
    const normalized = String(value ?? "").trim();
    if (!normalized)
        throw new https_1.HttpsError("invalid-argument", `${field} is required.`);
    return normalized;
}
function requirePracticeLocation(actor, locationId) {
    if (["admin", "system_admin"].includes(actor.role))
        return;
    if (!(0, crossTrainingPolicy_1.staffLocationIds)(actor.staff).includes(locationId)) {
        throw new https_1.HttpsError("permission-denied", "Practice location is outside the staff member's authorized scope.");
    }
}
function compactString(value, max = 240) {
    return String(value ?? "").trim().slice(0, max);
}
function compactCards(value, blockId = "") {
    if (!Array.isArray(value))
        return [];
    return value.slice(0, 80).map((item, index) => {
        const title = compactString(item?.title, 160);
        const href = compactString(item?.href, 500);
        const skillId = compactString(item?.skillId || item?.skill, 120);
        const familyId = compactString(item?.familyId || item?.family, 120);
        const cardId = compactString(item?.cardId || item?.id || href || skillId || familyId || title || `${blockId}-${index}`, 500);
        if (!cardId)
            throw new https_1.HttpsError("invalid-argument", "Every session-memory card requires an identity.");
        return { cardId, blockId: compactString(item?.blockId || blockId, 120), title, href, skillId, familyId };
    });
}
function compactBlocks(value) {
    if (!Array.isArray(value))
        return [];
    return value.slice(0, 20).map((item, index) => {
        const blockId = compactString(item?.blockId || item?.id || item?.slot || `block-${index}`, 120);
        if (!blockId)
            throw new https_1.HttpsError("invalid-argument", "Every session-memory block requires an identity.");
        return {
            blockId,
            title: compactString(item?.title || item?.label || item?.slot, 160),
            minutes: Math.max(0, Math.min(240, Number(item?.minutes || 0))),
            cardIds: compactCards(item?.cards, blockId).map((card) => card.cardId),
        };
    });
}
function requirePracticeOwner(actor, practice) {
    requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
    if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) !== "admin" && String(practice.coachUid || "") !== actor.uid) {
        throw new https_1.HttpsError("permission-denied", "Only the Coach who opened this practice may update its session memory.");
    }
}
exports.openPracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const input = request.data || {};
    const liveSessionId = requiredString(input.liveSessionId, "liveSessionId");
    const roomId = requiredString(input.roomId, "roomId");
    const locationId = requiredString(input.locationId || input.academyId, "locationId");
    requirePracticeLocation(actor, locationId);
    const discipline = requiredString(input.discipline, "discipline").toLowerCase();
    const requestedPracticeId = String(input.practiceId || "").trim();
    if (requestedPracticeId.includes("/"))
        throw new https_1.HttpsError("invalid-argument", "practiceId is invalid.");
    const executionModeInput = String(input.executionMode || "").trim().toLowerCase();
    if (executionModeInput && !EXECUTION_MODES.has(executionModeInput)) {
        throw new https_1.HttpsError("invalid-argument", "executionMode is invalid.");
    }
    const db = (0, firestore_1.getFirestore)();
    const practiceRef = requestedPracticeId
        ? db.doc(`practiceSessions/${requestedPracticeId}`)
        : db.collection("practiceSessions").doc();
    const now = firestore_1.FieldValue.serverTimestamp();
    let idempotent = false;
    await db.runTransaction(async (tx) => {
        const existing = await tx.get(practiceRef);
        const current = existing.data() || {};
        if (requestedPracticeId && !existing.exists) {
            throw new https_1.HttpsError("not-found", "The supplied practiceId does not exist.");
        }
        if (existing.exists) {
            idempotent = true;
            requirePracticeLocation(actor, requiredString(current.locationId || current.academyId, "practice locationId"));
            if ((0, staffAuthorization_1.normalizeStaffRole)(actor.role) !== "admin" && String(current.coachUid || "") !== actor.uid) {
                throw new https_1.HttpsError("permission-denied", "Only the Coach who opened this practice may resume it.");
            }
            if (String(current.status || "").toLowerCase() !== "active") {
                throw new https_1.HttpsError("failed-precondition", "This practice is no longer active.");
            }
            if (String(current.locationId || current.academyId || "") !== locationId) {
                throw new https_1.HttpsError("failed-precondition", "Practice location cannot change while resuming.");
            }
            if (String(current.roomId || "") !== roomId) {
                throw new https_1.HttpsError("failed-precondition", "Practice room cannot change while resuming.");
            }
            if (String(current.liveSessionId || "") !== liveSessionId) {
                throw new https_1.HttpsError("failed-precondition", "Practice live-session identity cannot change while resuming.");
            }
            // Once athletes are checked in, the participation record owns the session
            // context. A resume may refresh planning details, but must not silently move
            // those athletes to a different discipline, journey, program, or focus tier.
            const attendanceSnap = await tx.get(db.doc(`attendance_sessions/${practiceRef.id}`));
            const attendance = attendanceSnap.data() || {};
            const hasParticipants = Number(attendance.checkedInCount || 0) > 0
                || (Array.isArray(attendance.checkedInIds) && attendance.checkedInIds.length > 0)
                || (Array.isArray(attendance.checkedIn) && attendance.checkedIn.length > 0);
            if (hasParticipants) {
                const stableContext = [
                    ["discipline", String(current.discipline || "").toLowerCase(), discipline],
                    ["journey", String(current.journey || ""), String(input.journey || "").trim()],
                    ["program", String(current.program || ""), String(input.program || "").trim()],
                    ["tier", String(current.tier || ""), String(input.tier || "").trim()],
                ];
                const changed = stableContext.find(([, before, after]) => before !== after);
                if (changed) {
                    throw new https_1.HttpsError("failed-precondition", `Practice ${changed[0]} cannot change after check-in begins.`);
                }
            }
        }
        const executionMode = executionModeInput || String(current.executionMode || "").trim().toLowerCase();
        const practice = {
            practiceId: practiceRef.id,
            liveSessionId,
            locationId,
            academyId: locationId,
            roomId,
            coachUid: existing.exists ? String(current.coachUid || actor.uid) : actor.uid,
            coachRole: existing.exists ? String(current.coachRole || actor.role) : actor.role,
            status: "active",
            discipline,
            journey: String(input.journey || "").trim(),
            program: String(input.program || "").trim(),
            track: String(input.track || "").trim(),
            tier: String(input.tier || "").trim(),
            schema: String(input.schema || "").trim(),
            durationMinutes: Math.max(0, Number(input.durationMinutes || 0)),
            ...(executionMode ? { executionMode } : {}),
            ...(existing.exists ? {} : { openedAt: now }),
            updatedAt: now,
            source: "session-builder",
        };
        if (existing.exists)
            tx.set(practiceRef, practice, { merge: true });
        else
            tx.create(practiceRef, practice);
        tx.set(db.doc(`liveSessions/${liveSessionId}`), {
            practiceId: practiceRef.id,
            liveSessionId,
            locationId,
            academyId: locationId,
            roomId,
            coachUid: practice.coachUid,
            status: "ready",
            discipline,
            journey: practice.journey,
            ...(executionMode ? { executionMode } : {}),
            updatedAt: now,
        }, { merge: true });
    });
    return { ok: true, practiceId: practiceRef.id, liveSessionId, status: "active", idempotent };
});
exports.getPracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const practiceId = requiredString(request.data?.practiceId, "practiceId");
    const snap = await (0, firestore_1.getFirestore)().doc(`practiceSessions/${practiceId}`).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Practice not found.");
    requirePracticeLocation(actor, requiredString(snap.data()?.locationId || snap.data()?.academyId, "practice locationId"));
    return { ok: true, practiceId: snap.id, practice: snap.data() || {} };
});
exports.savePracticeSessionMemory = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or Admin access required.");
    const input = request.data || {};
    const practiceId = requiredString(input.practiceId, "practiceId");
    if (practiceId.includes("/"))
        throw new https_1.HttpsError("invalid-argument", "practiceId is invalid.");
    const operation = compactString(input.operation, 40).toLowerCase();
    if (!MEMORY_OPERATIONS.has(operation)) {
        throw new https_1.HttpsError("invalid-argument", "Unsupported session-memory operation.");
    }
    const db = (0, firestore_1.getFirestore)();
    const ref = db.doc(`practiceSessions/${practiceId}`);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Practice not found.");
        const practice = snap.data() || {};
        requirePracticeOwner(actor, practice);
        const status = String(practice.status || "").toLowerCase();
        if (operation !== "reflection" && status !== "active") {
            throw new https_1.HttpsError("failed-precondition", "Closed practices cannot change plan or worked memory.");
        }
        if (operation === "reflection" && !["active", "closed"].includes(status)) {
            throw new https_1.HttpsError("failed-precondition", "Practice reflection cannot be saved in this state.");
        }
        const now = firestore_1.FieldValue.serverTimestamp();
        if (operation === "plan") {
            const plannedBlocks = compactBlocks(input.plannedBlocks);
            const plannedCards = compactCards(input.plannedCards);
            tx.update(ref, {
                "sessionMemory.planVersion": Math.max(1, Number(input.planVersion || 1)),
                "sessionMemory.plannedBlocks": plannedBlocks,
                "sessionMemory.plannedCards": plannedCards,
                "sessionMemory.planSavedAt": now,
                "sessionMemory.planSavedBy": actor.uid,
                updatedAt: now,
            });
            return;
        }
        if (operation === "worked") {
            const memory = practice.sessionMemory || {};
            const completedAt = firestore_1.Timestamp.now();
            const priorBlocks = Array.isArray(memory.workedBlocks) ? memory.workedBlocks : [];
            const priorCards = Array.isArray(memory.workedCards) ? memory.workedCards : [];
            const incomingBlocks = compactBlocks(input.workedBlocks);
            const incomingCards = compactCards(input.workedCards);
            const blockMap = new Map(priorBlocks.map((block) => [String(block.blockId || ""), block]));
            incomingBlocks.forEach((block) => blockMap.set(block.blockId, { ...block, completedAt }));
            const cardMap = new Map(priorCards.map((card) => [String(card.cardId || ""), card]));
            incomingCards.forEach((card) => cardMap.set(card.cardId, { ...card, completedAt }));
            const patch = {
                "sessionMemory.workedBlocks": [...blockMap.values()].slice(0, 20),
                "sessionMemory.workedCards": [...cardMap.values()].slice(0, 80),
                "sessionMemory.executionUpdatedAt": now,
                updatedAt: now,
            };
            if (input.executionStarted === true && !memory.executionStartedAt) {
                patch["sessionMemory.executionStartedAt"] = now;
            }
            if (input.executionCompleted === true) {
                patch["sessionMemory.executionCompletedAt"] = now;
            }
            tx.update(ref, patch);
            return;
        }
        tx.update(ref, {
            "sessionMemory.reflection": {
                fearRating: compactString(input.reflection?.fearRating, 10),
                worked: compactString(input.reflection?.worked, 4000),
                needsWork: compactString(input.reflection?.needsWork, 4000),
                standout: compactString(input.reflection?.standout, 4000),
                savedAt: now,
                coachUid: actor.uid,
            },
            updatedAt: now,
        });
    });
    return { ok: true, practiceId, operation };
});
exports.closePracticeSession = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Staff authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, PRACTICE_STAFF_ROLES, "Active Coach or staff access required.");
    const practiceId = requiredString(request.data?.practiceId, "practiceId");
    const attendanceSessionId = requiredString(request.data?.attendanceSessionId, "attendanceSessionId");
    const db = (0, firestore_1.getFirestore)();
    let idempotent = false;
    await db.runTransaction(async (tx) => {
        const ref = db.doc(`practiceSessions/${practiceId}`);
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError("not-found", "Practice not found.");
        const practice = snap.data() || {};
        requirePracticeLocation(actor, requiredString(practice.locationId || practice.academyId, "practice locationId"));
        const liveSessionId = String(practice.liveSessionId || "").trim();
        const liveRef = liveSessionId ? db.doc(`liveSessions/${liveSessionId}`) : null;
        const liveSnap = liveRef ? await tx.get(liveRef) : null;
        if (String(practice.status || "").toLowerCase() === "closed") {
            idempotent = true;
            return;
        }
        const now = firestore_1.FieldValue.serverTimestamp();
        tx.update(ref, {
            status: "closed",
            attendanceSessionId,
            closedAt: now,
            closedBy: actor.uid,
            closedByRole: actor.role,
            updatedAt: now,
        });
        if (liveRef && String(liveSnap?.data()?.practiceId || "") === practiceId) {
            tx.set(liveRef, {
                practiceId,
                status: "closed",
                closedAt: now,
                updatedAt: now,
            }, { merge: true });
        }
    });
    return { ok: true, practiceId, status: "closed", idempotent };
});
