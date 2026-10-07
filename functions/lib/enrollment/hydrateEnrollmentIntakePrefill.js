"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hydrateEnrollmentIntakePrefill = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
function firstValue(...values) {
    for (const value of values) {
        const text = clean(value);
        if (text)
            return text;
    }
    return null;
}
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function firstAthlete(value) {
    return Array.isArray(value) && value[0] && typeof value[0] === "object"
        ? value[0]
        : {};
}
function isOperationalPaidProposal(proposal) {
    const status = clean(proposal.status).toUpperCase();
    const paymentStatus = clean(proposal.paymentStatus).toLowerCase();
    const checkoutSessionId = clean(proposal.stripeCheckoutSessionId);
    const isLive = proposal.stripeLivemode === true ||
        checkoutSessionId.startsWith("cs_live_");
    return (status === "PAID" &&
        paymentStatus === "paid" &&
        Boolean(proposal.paidAt) &&
        Boolean(checkoutSessionId) &&
        !checkoutSessionId.startsWith("cs_test_") &&
        isLive);
}
exports.hydrateEnrollmentIntakePrefill = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Secure intake session required.");
    }
    const tokenId = clean(req.data?.tokenId).toLowerCase();
    if (!/^[a-z0-9]{6,32}$/.test(tokenId)) {
        throw new https_1.HttpsError("invalid-argument", "A valid intake token is required.");
    }
    const tokenRef = db.doc(`intakeTokens/${tokenId}`);
    const tokenSnap = await tokenRef.get();
    if (!tokenSnap.exists) {
        throw new https_1.HttpsError("not-found", "Intake invite not found.");
    }
    const token = tokenSnap.data() || {};
    const exp = typeof token.exp === "number" ? token.exp : null;
    if (token.used === true) {
        throw new https_1.HttpsError("failed-precondition", "Intake invite already used.");
    }
    if (exp && exp < Date.now()) {
        throw new https_1.HttpsError("failed-precondition", "Intake invite expired.");
    }
    if (clean(token.mode || "new_athlete").toLowerCase() !== "new_athlete" ||
        clean(token.source).toLowerCase() !== "management_enrollment") {
        throw new https_1.HttpsError("failed-precondition", "Unsupported intake invite.");
    }
    const proposalId = clean(token.proposalId);
    const locationId = clean(token.locationId);
    if (!proposalId || !locationId) {
        throw new https_1.HttpsError("failed-precondition", "Invite is missing enrollment ownership.");
    }
    const proposalSnap = await db.doc(`proposals/${proposalId}`).get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", "Paid enrollment proposal not found.");
    }
    const proposal = proposalSnap.data() || {};
    if (!isOperationalPaidProposal(proposal)) {
        throw new https_1.HttpsError("failed-precondition", "Enrollment proposal is not operationally paid.");
    }
    if (clean(proposal.locationId) !== locationId) {
        throw new https_1.HttpsError("failed-precondition", "Invite location does not match the paid proposal.");
    }
    const locked = asRecord(proposal.lockedSnapshot);
    const liveProspect = asRecord(proposal.prospect);
    const lockedProspect = asRecord(locked.prospect);
    const liveAthlete = firstAthlete(proposal.athletes);
    const lockedAthlete = firstAthlete(locked.athletes);
    const liveContact = asRecord(proposal.contact || proposal.parent);
    const lockedContact = asRecord(locked.contact || locked.parent);
    const appointmentId = firstValue(lockedProspect.appointmentId, liveProspect.appointmentId, proposal.appointmentId);
    let appointment = {};
    let lead = {};
    if (appointmentId) {
        const appointmentSnap = await db
            .doc(`admissions_appointments/${appointmentId}`)
            .get();
        if (appointmentSnap.exists) {
            appointment = appointmentSnap.data() || {};
            const leadId = firstValue(appointment.leadId, lockedProspect.leadId, liveProspect.leadId, proposal.leadId, proposal.connectLeadId);
            if (leadId) {
                const leadSnap = await db.doc(`interest_leads/${leadId}`).get();
                if (leadSnap.exists)
                    lead = leadSnap.data() || {};
            }
        }
    }
    const existingPrefill = asRecord(token.prefill);
    const audience = clean(token.intakeAudience).toLowerCase();
    const athleteName = firstValue(lockedAthlete.name, lockedAthlete.fullName, lockedAthlete.athleteName, [lockedAthlete.first, lockedAthlete.last].filter(Boolean).join(" "), liveAthlete.name, liveAthlete.fullName, liveAthlete.athleteName, [liveAthlete.first, liveAthlete.last].filter(Boolean).join(" "), lockedProspect.athleteName, liveProspect.athleteName, appointment.athleteName, lead.athleteName, lead.participantName, existingPrefill.athleteName);
    const hydratedPrefill = Object.fromEntries(Object.entries({
        ...existingPrefill,
        athleteName,
        dob: firstValue(lockedAthlete.dob, lockedAthlete.dateOfBirth, liveAthlete.dob, liveAthlete.dateOfBirth, lockedProspect.dob, lockedProspect.dateOfBirth, liveProspect.dob, liveProspect.dateOfBirth, appointment.dob, appointment.dateOfBirth, lead.dob, lead.dateOfBirth, existingPrefill.dob),
        city: firstValue(lockedProspect.city, liveProspect.city, lockedContact.city, liveContact.city, appointment.city, lead.city, existingPrefill.city),
        state: firstValue(lockedProspect.state, liveProspect.state, lockedContact.state, liveContact.state, appointment.state, lead.state, existingPrefill.state),
        email: firstValue(lockedProspect.email, lockedProspect.parentEmail, lockedProspect.primaryContactEmail, liveProspect.email, liveProspect.parentEmail, liveProspect.primaryContactEmail, lockedContact.email, lockedContact.parentEmail, liveContact.email, liveContact.parentEmail, appointment.email, lead.email, lead.parentEmail, existingPrefill.email),
        phone: firstValue(lockedProspect.phone, lockedProspect.parentPhone, lockedProspect.primaryContactPhone, liveProspect.phone, liveProspect.parentPhone, liveProspect.primaryContactPhone, lockedContact.phone, lockedContact.parentPhone, liveContact.phone, liveContact.parentPhone, appointment.phone, lead.phone, lead.parentPhone, existingPrefill.phone),
        parentName: audience === "parent_guardian"
            ? firstValue(lockedProspect.primaryContactName, lockedProspect.parentName, liveProspect.primaryContactName, liveProspect.parentName, lockedContact.name, lockedContact.parentName, liveContact.name, liveContact.parentName, appointment.parentName, lead.parentName, lead.guardianName, existingPrefill.parentName)
            : existingPrefill.parentName || null,
        languagePreference: firstValue(lockedProspect.languagePreference, lockedProspect.preferredLanguage, liveProspect.languagePreference, liveProspect.preferredLanguage, lockedContact.languagePreference, liveContact.languagePreference, appointment.languagePreference, appointment.preferredLanguage, lead.languagePreference, lead.preferredLanguage, existingPrefill.languagePreference),
    }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
    await tokenRef.set({
        prefill: hydratedPrefill,
        prefillHydratedAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        ok: true,
        tokenId,
        prefill: hydratedPrefill,
    };
});
