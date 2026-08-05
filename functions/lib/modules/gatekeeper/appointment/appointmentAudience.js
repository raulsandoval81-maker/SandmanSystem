"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAppointmentAudience = resolveAppointmentAudience;
const appointmentFormatting_1 = require("./appointmentFormatting");
function resolveAppointmentAudience(lead, lang) {
    const role = lead.registrantRole ===
        "adult-athlete"
        ? "adult-athlete"
        : "parent-guardian";
    const registrantName = (0, appointmentFormatting_1.clean)(lead.registrantName ||
        lead.contactName ||
        lead.parentName) ||
        (lang === "es"
            ? "Participante"
            : "Participant");
    const participantName = (0, appointmentFormatting_1.clean)(lead.participantName ||
        lead.athleteName ||
        registrantName);
    const isAdultAthlete = role === "adult-athlete";
    const greetingName = registrantName;
    const participantLabel = participantName ||
        (isAdultAthlete
            ? (lang === "es"
                ? "Tú"
                : "You")
            : (lang === "es"
                ? "Tu atleta"
                : "Your athlete"));
    return {
        role,
        registrantName,
        participantName: participantName ||
            participantLabel,
        greetingName,
        participantLabel,
        isAdultAthlete
    };
}
