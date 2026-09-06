"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCESS_INVITATION_TTL_MS = void 0;
exports.normalizeAccessEmail = normalizeAccessEmail;
exports.assertParentInvitationContext = assertParentInvitationContext;
exports.assertConsumableParentInvitation = assertConsumableParentInvitation;
exports.ACCESS_INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
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
