"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideOnboardingBinding = decideOnboardingBinding;
function decideOnboardingBinding(input) {
    if (input.existingAuthUid && input.existingAuthUid !== input.callerUid)
        throw new Error("DIFFERENT_AUTH_UID");
    if (input.step1Locked && input.existingAuthUid === input.callerUid) {
        return Object.freeze({ action: "idempotent", repaired: false });
    }
    if (!input.tokenId)
        throw new Error("MISSING_TOKEN");
    if (!input.tokenExists)
        throw new Error("TOKEN_NOT_FOUND");
    if (input.tokenAthleteUid.trim().toUpperCase() !== input.athleteId)
        throw new Error("TOKEN_ATHLETE_MISMATCH");
    if (input.tokenUsed)
        throw new Error("TOKEN_USED");
    if (!input.tokenExpiresAt || input.now > input.tokenExpiresAt)
        throw new Error("TOKEN_EXPIRED");
    return Object.freeze({ action: "bind", repaired: input.step1Locked && !input.existingAuthUid });
}
