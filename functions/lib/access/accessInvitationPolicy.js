"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIRECT_ATHLETE_ACCESS_MODES = exports.ATHLETE_ACCESS_MODES = exports.ACCESS_INVITATION_TTL_MS = void 0;
exports.normalizeAccessEmail = normalizeAccessEmail;
exports.assertParentInvitationContext = assertParentInvitationContext;
exports.assertAthleteInvitationContext = assertAthleteInvitationContext;
exports.assertConsumableAthleteInvitation = assertConsumableAthleteInvitation;
exports.assertAthleteAccessTransition = assertAthleteAccessTransition;
exports.assertConsumableParentInvitation = assertConsumableParentInvitation;
exports.ACCESS_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
exports.ATHLETE_ACCESS_MODES = Object.freeze([
    "parent_managed", "hybrid", "self_managed",
]);
exports.DIRECT_ATHLETE_ACCESS_MODES = Object.freeze([
    "hybrid", "self_managed",
]);
function normalizeAccessEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}
function assertParentInvitationContext(input) {
    if (String(input.role || "") !== "parent")
        throw new Error("WRONG_ROLE");
    const email = normalizeAccessEmail(input.email);
    const athleteUid = String(input.athleteUid || "").trim().toUpperCase();
    const relationshipId = String(input.relationshipId || "").trim();
    if (!email || !email.includes("@"))
        throw new Error("INVALID_EMAIL");
    if (!athleteUid)
        throw new Error("MISSING_ATHLETE");
    if (!relationshipId)
        throw new Error("MISSING_RELATIONSHIP");
    return { role: "parent", email, athleteUid, relationshipId };
}
function assertAthleteInvitationContext(input) {
    if (String(input.role || "") !== "athlete")
        throw new Error("WRONG_ROLE");
    const email = normalizeAccessEmail(input.email);
    const athleteUid = String(input.athleteUid || "").trim().toUpperCase();
    const accessMode = String(input.accessMode || "").trim().toLowerCase();
    if (!email || !email.includes("@"))
        throw new Error("INVALID_EMAIL");
    if (!athleteUid)
        throw new Error("MISSING_ATHLETE");
    if (!exports.DIRECT_ATHLETE_ACCESS_MODES.includes(accessMode)) {
        throw new Error("DIRECT_ACCESS_NOT_ALLOWED");
    }
    if (accessMode === "hybrid" && input.parentApproved !== true) {
        throw new Error("PARENT_APPROVAL_REQUIRED");
    }
    return {
        role: "athlete",
        email,
        athleteUid,
        accessMode,
        parentApproved: accessMode === "hybrid" ? true : input.parentApproved === true,
    };
}
function assertConsumableAthleteInvitation(input) {
    if (!input.exists)
        throw new Error("INVITATION_NOT_FOUND");
    if (String(input.role || "") !== "athlete")
        throw new Error("WRONG_ROLE");
    if (input.used)
        throw new Error("INVITATION_USED");
    if (!input.exp || input.now > input.exp)
        throw new Error("INVITATION_EXPIRED");
    const email = normalizeAccessEmail(input.invitationEmail);
    if (!email || email !== normalizeAccessEmail(input.authEmail))
        throw new Error("EMAIL_MISMATCH");
    const athleteUid = String(input.invitationAthleteUid || "").trim().toUpperCase();
    if (!athleteUid || athleteUid !== String(input.actualAthleteUid || "").trim().toUpperCase()) {
        throw new Error("ATHLETE_MISMATCH");
    }
    const accessMode = String(input.accessMode || "").trim().toLowerCase();
    if (!exports.DIRECT_ATHLETE_ACCESS_MODES.includes(accessMode)) {
        throw new Error("DIRECT_ACCESS_NOT_ALLOWED");
    }
    if (accessMode === "hybrid" && input.parentApproved !== true) {
        throw new Error("PARENT_APPROVAL_REQUIRED");
    }
    const callerUid = String(input.callerUid || "").trim();
    const existingAuthUid = String(input.existingAthleteAuthUid || "").trim();
    if (existingAuthUid && existingAuthUid !== callerUid)
        throw new Error("DIFFERENT_ATHLETE_UID");
    const conflictingAthlete = input.callerAthleteIds
        .map((value) => String(value || "").trim().toUpperCase())
        .find((value) => value && value !== athleteUid);
    if (conflictingAthlete)
        throw new Error("CALLER_ALREADY_BOUND");
    return { email, athleteUid, callerUid, accessMode, parentApproved: input.parentApproved === true };
}
function assertAthleteAccessTransition(input) {
    const currentMode = String(input.currentMode || "").trim().toLowerCase();
    const targetMode = String(input.targetMode || "").trim().toLowerCase();
    if (!String(input.existingAuthUid || "").trim())
        throw new Error("DIRECT_ACCESS_NOT_ACTIVE");
    if (targetMode !== "self_managed")
        throw new Error("INVALID_TRANSITION_TARGET");
    if (currentMode === "self_managed") {
        return { currentMode: "self_managed", targetMode: "self_managed", already: true };
    }
    if (currentMode !== "hybrid")
        throw new Error("INVALID_ACCESS_TRANSITION");
    return { currentMode: "hybrid", targetMode: "self_managed", already: false };
}
function assertConsumableParentInvitation(input) {
    if (!input.exists)
        throw new Error("INVITATION_NOT_FOUND");
    if (String(input.role || "") !== "parent")
        throw new Error("WRONG_ROLE");
    if (input.used)
        throw new Error("INVITATION_USED");
    if (!input.exp || input.now > input.exp)
        throw new Error("INVITATION_EXPIRED");
    const email = normalizeAccessEmail(input.invitationEmail);
    if (!email || email !== normalizeAccessEmail(input.authEmail))
        throw new Error("EMAIL_MISMATCH");
    const athleteUid = String(input.invitationAthleteUid || "").trim().toUpperCase();
    if (!athleteUid || athleteUid !== String(input.relationshipAthleteUid || "").trim().toUpperCase()) {
        throw new Error("ATHLETE_MISMATCH");
    }
    if (String(input.invitationRelationshipId || "") !== String(input.actualRelationshipId || "")) {
        throw new Error("RELATIONSHIP_MISMATCH");
    }
    if (email !== normalizeAccessEmail(input.relationshipEmail))
        throw new Error("RELATIONSHIP_EMAIL_MISMATCH");
    if (!["pending", "active"].includes(String(input.relationshipStatus || "").toLowerCase())) {
        throw new Error("RELATIONSHIP_NOT_APPROVED");
    }
    const callerUid = String(input.callerUid || "").trim();
    for (const existingUid of [input.existingRelationshipParentUid, input.existingAthleteParentUid]) {
        const value = String(existingUid || "").trim();
        if (value && value !== callerUid)
            throw new Error("DIFFERENT_PARENT_UID");
    }
    return { email, athleteUid, callerUid };
}
