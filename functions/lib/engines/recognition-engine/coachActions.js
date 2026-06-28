"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCoachActions = buildCoachActions;
/**
 * COMMAND LAYER:
 * Converts athlete stage → coach actions (buttons in UI)
 */
function buildCoachActions(stage) {
    switch (stage) {
        // 🟠 READINESS ZONE
        case "TEMPLE":
            return [
                { type: "MARK_READY", label: "Mark Ready", severity: "info" },
                { type: "SCHEDULE_TEST", label: "Schedule Test", severity: "info" },
                { type: "HOLD", label: "Hold Athlete", severity: "warning" }
            ];
        // 🟡 TEST PREP
        case "TEST_ELIGIBLE":
            return [
                { type: "SCHEDULE_TEST", label: "Schedule Test", severity: "info" },
                { type: "HOLD", label: "Hold Athlete", severity: "warning" }
            ];
        // 🔵 TEST IS SCHEDULED
        case "TEST_SCHEDULED":
            return [
                { type: "START_TEST", label: "Start Test", severity: "info" },
                { type: "FREEZE", label: "Freeze Athlete", severity: "warning" }
            ];
        // 🧪 ACTIVE TESTING
        case "TESTING":
            return [
                { type: "RETEST", label: "Retest (7-day rule)", severity: "critical" },
                { type: "FREEZE", label: "Freeze Athlete", severity: "warning" }
            ];
        // ⬆ PROMOTION READY
        case "PROMOTION":
            return [
                { type: "APPROVE_PROMOTION", label: "Approve Promotion", severity: "info" },
                { type: "DELAY_PROMOTION", label: "Delay Promotion", severity: "warning" }
            ];
        // 🏆 CEREMONY READY
        case "CEREMONY":
            return [
                { type: "TRIGGER_CEREMONY", label: "Trigger Ceremony", severity: "info" }
            ];
        // 💤 SAFE STATES
        case "COOLDOWN":
        case "DONE":
        case "STRIPE_PROGRESS":
            return [];
        default:
            return [];
    }
}
