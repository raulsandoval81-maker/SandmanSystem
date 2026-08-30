"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProposalDraft = void 0;
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
exports.updateProposalDraft = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to update a proposal.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const data = req.data || {};
    const proposalId = cleanString(data.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
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
    const coachName = nullableString(data.coach?.name ||
        staffAccess.fullName);
    const callerUid = req.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db
        .collection("proposals")
        .doc(proposalId);
    try {
        const result = await db.runTransaction(async (tx) => {
            const proposalSnap = await tx.get(proposalRef);
            if (!proposalSnap.exists) {
                throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
            }
            const existing = proposalSnap.data() || {};
            (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, existing.locationId);
            const currentStatus = cleanString(existing.status);
            if (currentStatus !== "DRAFT") {
                throw new https_1.HttpsError("failed-precondition", "Only DRAFT proposals may be edited.");
            }
            const existingProspect = existing.prospect &&
                typeof existing.prospect === "object"
                ? existing.prospect
                : {};
            const incomingProspect = data.prospect &&
                typeof data.prospect === "object"
                ? data.prospect
                : {};
            const prospect = {
                appointmentId: nullableString(incomingProspect.appointmentId) ??
                    nullableString(existingProspect.appointmentId),
                admissionsRequestId: nullableString(incomingProspect.admissionsRequestId) ??
                    nullableString(existingProspect.admissionsRequestId),
                familyName: nullableString(incomingProspect.familyName) ??
                    nullableString(existingProspect.familyName),
                primaryContactName: nullableString(incomingProspect.primaryContactName) ??
                    nullableString(existingProspect.primaryContactName),
                email: nullableString(cleanEmail(incomingProspect.email)) ??
                    nullableString(cleanEmail(existingProspect.email)),
                phone: nullableString(incomingProspect.phone) ??
                    nullableString(existingProspect.phone),
                city: nullableString(incomingProspect.city) ??
                    nullableString(existingProspect.city),
                state: nullableString(incomingProspect.state) ??
                    nullableString(existingProspect.state),
            };
            const existingAthletes = Array.isArray(existing.athletes)
                ? existing.athletes
                : [];
            const proposalAthletes = athletes.map((athlete, index) => {
                if (index !== 0 ||
                    !athlete ||
                    typeof athlete !== "object" ||
                    Array.isArray(athlete)) {
                    return athlete;
                }
                const incomingAthlete = athlete;
                const existingAthlete = existingAthletes[0] &&
                    typeof existingAthletes[0] === "object" &&
                    !Array.isArray(existingAthletes[0])
                    ? existingAthletes[0]
                    : {};
                return {
                    ...incomingAthlete,
                    dob: nullableString(incomingAthlete.dob ||
                        incomingAthlete.dateOfBirth ||
                        existingAthlete.dob ||
                        existingAthlete.dateOfBirth),
                };
            });
            const historyRef = proposalRef
                .collection("history")
                .doc();
            tx.update(proposalRef, {
                prospect,
                coach: {
                    uid: callerUid,
                    name: coachName,
                },
                athletes: proposalAthletes,
                pricing,
                agreement,
                internalNotes: nullableString(data.internalNotes),
                updatedBy: callerUid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.create(historyRef, {
                proposalId,
                event: "UPDATED",
                fromStatus: "DRAFT",
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
        console.error("[updateProposalDraft] Failed:", error);
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        throw new https_1.HttpsError("internal", "Unable to update the proposal draft.");
    }
});
