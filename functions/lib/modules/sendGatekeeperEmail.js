"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendGatekeeperEmail = void 0;
const functions = __importStar(require("firebase-functions"));
const resend_1 = require("resend");
function clean(value) {
    return String(value ?? "").trim();
}
function isSupportedLocation(location) {
    return (location === "lompoc" ||
        location === "solvang");
}
function getLocationName(location) {
    const names = {
        lompoc: "Lompoc",
        solvang: "Solvang"
    };
    return names[location];
}
function getLocationAddress(location) {
    if (location === "lompoc") {
        return [
            "Lompoc High School Wrestling Room — Room IA-1",
            "515 W College Ave",
            "Lompoc, CA 93436"
        ].join("\n");
    }
    return [
        "320 Alisal Road",
        "Suite 106",
        "Solvang, CA"
    ].join("\n");
}
function formatAppointmentDate(value, lang) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return value;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Los_Angeles"
    }).format(date);
}
function formatAppointmentTime(value) {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
        return value;
    }
    let hour = Number(match[1]);
    const minute = match[2];
    if (!Number.isInteger(hour) ||
        hour < 0 ||
        hour > 23) {
        return value;
    }
    const period = hour >= 12
        ? "PM"
        : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${period}`;
}
function buildAppointmentEmail(lead) {
    const lang = lead.lang === "es"
        ? "es"
        : "en";
    const parentName = clean(lead.parentName) ||
        (lang === "es"
            ? "Padre, madre o tutor"
            : "Parent or Guardian");
    const athleteName = clean(lead.athleteName) ||
        (lang === "es"
            ? "Tu atleta"
            : "Your athlete");
    const appointmentDate = clean(lead.appointmentDate);
    const appointmentTime = clean(lead.appointmentTime);
    const appointmentLocation = clean(lead.appointmentLocation);
    const appointmentCoach = clean(lead.appointmentCoach);
    const appointmentNotes = clean(lead.appointmentNotes);
    if (!appointmentDate ||
        !appointmentTime ||
        !appointmentLocation ||
        !appointmentCoach) {
        throw new Error("Appointment date, time, location, or coach is missing.");
    }
    if (!isSupportedLocation(appointmentLocation)) {
        throw new Error(`Unsupported appointment location: ${appointmentLocation}`);
    }
    const formattedDate = formatAppointmentDate(appointmentDate, lang);
    const formattedTime = formatAppointmentTime(appointmentTime);
    const academyName = getLocationName(appointmentLocation);
    const academyAddress = getLocationAddress(appointmentLocation);
    if (lang === "es") {
        return {
            subject: "Sandman Combat — Tu Introducción a la Academia Está Programada",
            text: `Hola ${parentName}:

Tu Introducción a la Academia de Sandman Combat ha sido programada.

Atleta:
${athleteName}

Fecha:
${formattedDate}

Hora:
${formattedTime}

Coach:
${appointmentCoach}

Academia:
${academyName}

Dirección:
${academyAddress}

Por favor llega aproximadamente 10 minutos antes.

Durante la cita conoceremos tus metas, responderemos tus preguntas, explicaremos cómo funciona Sandman Combat y hablaremos sobre el próximo paso apropiado para tu atleta o familia.

${appointmentNotes ? `Notas del coach:\n${appointmentNotes}\n\n` : ""}Si esta cita ya no funciona para tu familia, responde a este correo electrónico para que podamos reprogramarla.

Combat = Character

— Sandman Combat Academy`
        };
    }
    return {
        subject: "Sandman Combat — Your Academy Introduction Is Scheduled",
        text: `Hello ${parentName},

Your Sandman Combat Academy Introduction has been scheduled.

Athlete:
${athleteName}

Date:
${formattedDate}

Time:
${formattedTime}

Coach:
${appointmentCoach}

Academy:
${academyName}

Address:
${academyAddress}

Please arrive approximately 10 minutes early.

During the appointment, we will learn about your goals, answer your questions, explain how Sandman Combat works, and discuss the appropriate next step for your athlete or family.

${appointmentNotes ? `Coach Notes:\n${appointmentNotes}\n\n` : ""}If this appointment no longer works for your family, please reply to this email so we can reschedule it.

Combat = Character

— Sandman Combat Academy`
    };
}
async function markConfirmationFailed(ref, message) {
    await ref.update({
        appointmentConfirmationStatus: "failed",
        appointmentConfirmationError: message,
        appointmentConfirmationFailedAt: new Date()
    });
}
exports.sendGatekeeperEmail = functions.firestore
    .document("interest_leads/{leadId}")
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const beforeStatus = clean(before.appointmentConfirmationStatus);
    const afterStatus = clean(after.appointmentConfirmationStatus);
    if (afterStatus !== "pending") {
        return;
    }
    if (beforeStatus === "pending") {
        return;
    }
    const leadId = clean(context.params.leadId);
    const parentEmail = clean(after.email).toLowerCase();
    if (!parentEmail) {
        console.error("[gatekeeper] Missing parent email:", leadId);
        await markConfirmationFailed(change.after.ref, "Missing parent email address.");
        return;
    }
    const resendKey = functions.config().resend?.key;
    if (!resendKey) {
        console.error("[gatekeeper] Missing Resend API key");
        await markConfirmationFailed(change.after.ref, "Missing Resend API key.");
        return;
    }
    try {
        const email = buildAppointmentEmail(after);
        const resend = new resend_1.Resend(resendKey);
        const result = await resend.emails.send({
            from: "Sandman Combat <join@sandmancombat.com>",
            to: parentEmail,
            subject: email.subject,
            text: email.text
        });
        if (result.error) {
            throw new Error(result.error.message ||
                "Resend rejected the appointment email.");
        }
        await change.after.ref.update({
            appointmentConfirmationStatus: "sent",
            appointmentConfirmationSentAt: new Date(),
            appointmentConfirmationError: "",
            appointmentEmailId: result.data?.id || ""
        });
        console.log("[gatekeeper] Appointment confirmation sent:", {
            leadId,
            parentEmail,
            appointmentDate: after.appointmentDate,
            appointmentTime: after.appointmentTime,
            appointmentLocation: after.appointmentLocation,
            appointmentCoach: after.appointmentCoach,
            emailId: result.data?.id || ""
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unable to send appointment confirmation.";
        console.error("[gatekeeper] Appointment email failed:", leadId, error);
        await markConfirmationFailed(change.after.ref, message);
    }
});
