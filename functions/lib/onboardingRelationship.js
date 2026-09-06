"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboardingRelationshipFields = onboardingRelationshipFields;
function onboardingRelationshipFields(value) {
    const intakeAudience = String(value || "")
        .trim()
        .toLowerCase();
    if (intakeAudience !== "parent_guardian" &&
        intakeAudience !== "adult_athlete") {
        return {};
    }
    return {
        intakeAudience,
    };
}
