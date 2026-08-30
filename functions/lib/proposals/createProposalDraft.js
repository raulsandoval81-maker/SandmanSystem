"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProposalDraft = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("./proposalAccess");
function cleanString(value) {
    return String(value ?? "").trim();
}
function cleanEmail(value) {
    return cleanString(value).toLowerCase();
}
function nullableString(value) {
    const cleaned = cleanString(value);
    return cleaned || null;
}
function pad6(value) {
    return String(value).padStart(6, "0");
}
exports.createProposalDraft = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to create a proposal.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const data = req.data || {};
    const appointmentId = nullableString(data.appointmentId);
    const admissionsRequestId = nullableString(data.admissionsRequestId);
    if (!appointmentId && !admissionsRequestId) {
        throw new https_1.HttpsError("invalid-argument", "An appointmentId or admissionsRequestId is required.");
    }
    const familyName = nullableString(data.prospect?.familyName ||
        data.familyName);
    const primaryContactName = nullableString(data.prospect?.primaryContactName ||
        data.primaryContactName);
    const email = nullableString(cleanEmail(data.prospect?.email ||
        data.email));
    const phone = nullableString(data.prospect?.phone ||
        data.phone);
    const coachName = nullableString(data.coach?.name ||
        staffAccess.fullName);
    const athletes = Array.isArray(data.athletes)
        ? data.athletes
        : [];
    const pricing = data.pricing &&
        typeof data.pricing === "object"
        ? data.pricing
        : {};
    const agreement = data.agreement &&
        typeof data.agreement === "object"
        ? data.agreement
        : {};
    const internalNotes = nullableString(data.internalNotes);
    const callerUid = req.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    // Location ownership and prospect identity/contact are resolved
    // server-side from the authoritative appointment. Do not trust
    // browser-supplied values for enrollment ownership data.
    let locationId = null;
    let appointmentProspect = {};
    if (appointmentId) {
        const appointmentSnap = await db
            .collection("admissions_appointments")
            .doc(appointmentId)
            .get();
        if (!appointmentSnap.exists) {
            throw new https_1.HttpsError("not-found", "The appointment for this proposal was not found.");
        }
        appointmentProspect =
            appointmentSnap.data() || {};
        locationId =
            nullableString(appointmentSnap.get("locationId"));
        if (!locationId) {
            throw new https_1.HttpsError("failed-precondition", "The appointment does not have a valid location.");
        }
    }
    if (!locationId) {
        throw new https_1.HttpsError("failed-precondition", "A proposal must be connected to an appointment with a valid location.");
    }
    (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, locationId);
    // Athlete identity data collected before Admissions should
    // survive into the Proposal. DOB belongs to the athlete,
    // not the prospect/contact record.
    const proposalAthletes = athletes.map((athlete, index) => {
        if (index !== 0 ||
            !athlete ||
            typeof athlete !== "object" ||
            Array.isArray(athlete)) {
            return athlete;
        }
        return {
            ...athlete,
            dob: nullableString(athlete.dob ||
                athlete.dateOfBirth ||
                appointmentProspect.dob ||
                appointmentProspect.dateOfBirth),
        };
    });
    const counterRef = db
        .collection("counters")
        .doc("proposals");
    try {
        const result = await db.runTransaction(async (tx) => {
            const counterSnap = await tx.get(counterRef);
            const current = counterSnap.exists
                ? Number(counterSnap.get("next") ||
                    1)
                : 1;
            if (!Number.isInteger(current) ||
                current < 1) {
                throw new https_1.HttpsError("failed-precondition", "The proposal counter is invalid.");
            }
            const proposalId = `P-${pad6(current)}`;
            const proposalRef = db
                .collection("proposals")
                .doc(proposalId);
            const historyRef = proposalRef
                .collection("history")
                .doc();
            const proposalData = {
                proposalId,
                status: "DRAFT",
                locationId,
                prospect: {
                    appointmentId,
                    admissionsRequestId,
                    familyName: familyName ||
                        nullableString(appointmentProspect.athleteName ||
                            appointmentProspect.participantName),
                    primaryContactName: primaryContactName ||
                        nullableString(appointmentProspect.parentName),
                    email: email ||
                        nullableString(cleanEmail(appointmentProspect.email)),
                    phone: phone ||
                        nullableString(appointmentProspect.phone),
                    city: nullableString(appointmentProspect.city),
                    state: nullableString(appointmentProspect.state),
                },
                coach: {
                    uid: callerUid,
                    name: coachName,
                },
                athletes: proposalAthletes,
                pricing,
                agreement,
                internalNotes,
                createdBy: callerUid,
                updatedBy: callerUid,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            tx.set(counterRef, {
                next: current + 1,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, {
                merge: true,
            });
            tx.create(proposalRef, proposalData);
            tx.create(historyRef, {
                proposalId,
                event: "CREATED",
                fromStatus: null,
                toStatus: "DRAFT",
                createdBy: callerUid,
                createdByName: coachName,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                proposalId,
                status: "DRAFT",
            };
        });
        return {
            ok: true,
            ...result,
        };
    }
    catch (error) {
        console.error("[createProposalDraft] Failed:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Unable to create the proposal draft.");
    }
});
