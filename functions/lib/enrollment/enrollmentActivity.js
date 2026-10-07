"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnrollmentPlacementActivity = exports.recordEnrollmentAthleteActivated = exports.recordEnrollmentIntakeSubmitted = exports.recordEnrollmentIntakeInvite = void 0;
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const db = (0, firestore_1.getFirestore)();
function clean(value) {
    return String(value ?? "").trim();
}
function timestampMillis(value) {
    if (value &&
        typeof value.toMillis === "function") {
        return value.toMillis();
    }
    return null;
}
function deterministicPart(value) {
    return clean(value)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 120);
}
function isOperationalPaidProposal(proposal) {
    const status = clean(proposal.status).toUpperCase();
    const paymentStatus = clean(proposal.paymentStatus).toLowerCase();
    const checkoutSessionId = clean(proposal.stripeCheckoutSessionId);
    const hasPaidAt = Boolean(proposal.paidAt);
    const isLiveSession = proposal.stripeLivemode === true ||
        checkoutSessionId.startsWith("cs_live_");
    return (status === "PAID" &&
        paymentStatus === "paid" &&
        hasPaidAt &&
        Boolean(checkoutSessionId) &&
        !checkoutSessionId.startsWith("cs_test_") &&
        isLiveSession);
}
async function writeProposalHistoryEvent({ proposalId, historyId, data, requirePaid = false }) {
    const proposalRef = db.doc(`proposals/${proposalId}`);
    const historyRef = proposalRef
        .collection("history")
        .doc(historyId);
    await db.runTransaction(async (tx) => {
        const proposalSnap = await tx.get(proposalRef);
        if (!proposalSnap.exists) {
            console.warn("[enrollmentActivity] proposal missing", proposalId, historyId);
            return;
        }
        const proposal = proposalSnap.data() || {};
        if (requirePaid &&
            !isOperationalPaidProposal(proposal)) {
            console.warn("[enrollmentActivity] ignored non-operational paid proposal", proposalId, historyId);
            return;
        }
        const historySnap = await tx.get(historyRef);
        if (historySnap.exists)
            return;
        tx.create(historyRef, {
            proposalId,
            ...data,
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
    });
}
exports.recordEnrollmentIntakeInvite = (0, firestore_2.onDocumentCreated)("intakeTokens/{tokenId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const token = snapshot.data() || {};
    const proposalId = clean(token.proposalId);
    const mode = clean(token.mode || "new_athlete").toLowerCase();
    const source = clean(token.source).toLowerCase();
    if (!proposalId ||
        mode !== "new_athlete" ||
        source !== "management_enrollment") {
        return;
    }
    const tokenId = clean(event.params.tokenId);
    const historyId = `intake_invite_${deterministicPart(tokenId)}`;
    await writeProposalHistoryEvent({
        proposalId,
        historyId,
        requirePaid: true,
        data: {
            event: "INTAKE_INVITE_CREATED",
            fromStatus: "PAID",
            toStatus: "PAID",
            createdBy: "enrollment-system",
            createdByName: "Enrollment System",
            intakeTokenId: tokenId,
            intakeAudience: clean(token.intakeAudience) || null,
            locationId: clean(token.locationId) || null,
            source: "intake_token_created",
            occurredAt: token.createdAt || null
        }
    });
});
exports.recordEnrollmentIntakeSubmitted = (0, firestore_2.onDocumentWritten)("intakes/{intakeId}", async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap || !afterSnap.exists) {
        return;
    }
    const beforeSnap = event.data?.before;
    const before = beforeSnap?.exists
        ? beforeSnap.data() || {}
        : {};
    const after = afterSnap.data() || {};
    const beforeStatus = clean(before.status).toLowerCase();
    const afterStatus = clean(after.status).toLowerCase();
    if (afterStatus !== "submitted" ||
        beforeStatus === "submitted") {
        return;
    }
    const mode = clean(after.mode || "new_athlete").toLowerCase();
    const proposalId = clean(after.proposalId);
    if (mode !== "new_athlete" ||
        !proposalId) {
        return;
    }
    const intakeId = clean(event.params.intakeId);
    const historyId = `intake_submitted_${deterministicPart(intakeId)}`;
    const intakeAudience = clean(after.intakeAudience ||
        (after.source === "intake-athlete-ui"
            ? "adult_athlete"
            : "parent_guardian"));
    await writeProposalHistoryEvent({
        proposalId,
        historyId,
        requirePaid: true,
        data: {
            event: "INTAKE_SUBMITTED",
            fromStatus: "PAID",
            toStatus: "PAID",
            createdBy: clean(after.ownerUid) || "family",
            createdByName: intakeAudience === "adult_athlete"
                ? "Adult Athlete"
                : "Parent / Guardian",
            intakeId,
            intakeAudience: intakeAudience || null,
            source: clean(after.source) || "intake_submission",
            occurredAt: after.createdAt || null
        }
    });
});
exports.recordEnrollmentAthleteActivated = (0, firestore_2.onDocumentUpdated)("intakes/{intakeId}", async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const beforeStatus = clean(before.status).toLowerCase();
    const afterStatus = clean(after.status).toLowerCase();
    const beforeUid = clean(before.approvedUid);
    const athleteUid = clean(after.approvedUid);
    if (afterStatus !== "approved" ||
        after.minted !== true ||
        !athleteUid ||
        (beforeStatus === "approved" &&
            beforeUid === athleteUid)) {
        return;
    }
    const mode = clean(after.mode || "new_athlete").toLowerCase();
    const proposalId = clean(after.proposalId);
    if (mode !== "new_athlete" ||
        !proposalId) {
        return;
    }
    const intakeId = clean(event.params.intakeId);
    const historyId = `athlete_activated_${deterministicPart(intakeId)}_${deterministicPart(athleteUid)}`;
    const proposalRef = db.doc(`proposals/${proposalId}`);
    const historyRef = proposalRef
        .collection("history")
        .doc(historyId);
    const connectLeadId = clean(after.connectLeadId);
    const leadRef = connectLeadId
        ? db.doc(`interest_leads/${connectLeadId}`)
        : null;
    await db.runTransaction(async (tx) => {
        const proposalSnap = await tx.get(proposalRef);
        const historySnap = await tx.get(historyRef);
        const leadSnap = leadRef
            ? await tx.get(leadRef)
            : null;
        if (!proposalSnap.exists) {
            console.warn("[enrollmentActivity] activation proposal missing", proposalId, intakeId);
            return;
        }
        const proposal = proposalSnap.data() || {};
        if (!isOperationalPaidProposal(proposal)) {
            console.warn("[enrollmentActivity] activation ignored for non-operational paid proposal", proposalId, intakeId);
            return;
        }
        if (!historySnap.exists) {
            tx.create(historyRef, {
                proposalId,
                event: "ATHLETE_ACTIVATED",
                fromStatus: "PAID",
                toStatus: "PAID",
                createdBy: clean(after.managementCorrections?.dob?.correctedBy) || "management",
                createdByName: "Management",
                intakeId,
                athleteUid,
                locationId: clean(after.locationId) || null,
                source: "intake_approved",
                occurredAt: after.approvedAt || null,
                createdAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        if (leadRef &&
            leadSnap?.exists) {
            tx.set(leadRef, {
                status: "converted",
                athleteUid,
                enrolledAt: after.approvedAt ||
                    firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    });
});
exports.getEnrollmentPlacementActivity = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "Management sign-in required.");
    }
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Management access required.");
    const proposalId = clean(req.data?.proposalId);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    const proposalSnap = await db
        .doc(`proposals/${proposalId}`)
        .get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", "Proposal not found.");
    }
    const proposal = proposalSnap.data() || {};
    (0, staffAuthorization_1.requireStaffLocation)(actor, proposal.locationId, "This enrollment is outside your assigned location.");
    const intakeSnap = await db
        .collection("intakes")
        .where("proposalId", "==", proposalId)
        .get();
    const approvedIntakes = intakeSnap.docs
        .map((doc) => ({
        id: doc.id,
        data: doc.data() || {}
    }))
        .filter(({ data }) => clean(data.mode || "new_athlete").toLowerCase() === "new_athlete" &&
        clean(data.status).toLowerCase() === "approved" &&
        data.minted === true &&
        Boolean(clean(data.approvedUid)))
        .sort((a, b) => (timestampMillis(b.data.approvedAt) || 0) -
        (timestampMillis(a.data.approvedAt) || 0));
    const approved = approvedIntakes[0] || null;
    if (!approved) {
        return {
            ok: true,
            athleteUid: null,
            intakeId: null,
            caseLink: "none",
            activity: []
        };
    }
    const athleteUid = clean(approved.data.approvedUid);
    const intakeId = approved.id;
    const pinSnap = await db
        .collection("athleteAssessmentPins")
        .where("athleteUid", "==", athleteUid)
        .get();
    const pinRecords = pinSnap.docs.map((pinDoc) => ({
        id: pinDoc.id,
        data: pinDoc.data() || {}
    }));
    // Prefer exact case provenance. Historical pins may contain only one side
    // of the enrollment link; accept those only when every populated case field
    // agrees with the current proposal/intake. Fully unlinked legacy pins remain
    // the last-resort compatibility path. Explicit conflicts are never selected.
    const exactPins = pinRecords.filter(({ data }) => clean(data.proposalId) === proposalId &&
        clean(data.intakeId) === intakeId);
    const compatiblePartialPins = pinRecords.filter(({ data }) => {
        const pinProposalId = clean(data.proposalId);
        const pinIntakeId = clean(data.intakeId);
        const hasSomeCaseProvenance = Boolean(pinProposalId || pinIntakeId);
        const proposalMatches = !pinProposalId || pinProposalId === proposalId;
        const intakeMatches = !pinIntakeId || pinIntakeId === intakeId;
        return (hasSomeCaseProvenance &&
            proposalMatches &&
            intakeMatches &&
            !(pinProposalId === proposalId && pinIntakeId === intakeId));
    });
    const legacyPins = pinRecords.filter(({ data }) => !clean(data.proposalId) &&
        !clean(data.intakeId));
    const selectedPins = exactPins.length
        ? exactPins
        : compatiblePartialPins.length
            ? compatiblePartialPins
            : legacyPins;
    const caseLink = exactPins.length
        ? "exact"
        : compatiblePartialPins.length
            ? "partial_fallback"
            : legacyPins.length
                ? "legacy_fallback"
                : "none";
    const activity = [];
    for (const pinRecord of selectedPins) {
        const pin = pinRecord.data;
        const discipline = clean(pin.disciplineId || pin.discipline) || null;
        const base = {
            pinId: pinRecord.id,
            proposalId: clean(pin.proposalId) ||
                (caseLink !== "exact" ? proposalId : null),
            intakeId: clean(pin.intakeId) ||
                (caseLink !== "exact" ? intakeId : null),
            discipline,
            caseLink
        };
        const sentAt = timestampMillis(pin.sentToCoachAt);
        if (sentAt) {
            activity.push({
                ...base,
                event: "COACH_ASSESSMENT_SENT",
                occurredAt: sentAt
            });
        }
        const returnedAt = timestampMillis(pin.coachReturnedAt);
        if (returnedAt) {
            activity.push({
                ...base,
                event: "COACH_ASSESSMENT_RETURNED",
                occurredAt: returnedAt
            });
        }
        const validationAt = timestampMillis(pin.experienceRecognitionReviewedAt);
        if (validationAt) {
            activity.push({
                ...base,
                event: "EXPERIENCE_VALIDATED",
                outcome: clean(pin.experienceRecognitionStatus)
                    .toUpperCase() || null,
                occurredAt: validationAt
            });
        }
        const placementAt = timestampMillis(pin.placementRecordedAt);
        if (placementAt) {
            activity.push({
                ...base,
                event: "PLACEMENT_RECORDED",
                occurredAt: placementAt
            });
        }
    }
    activity.sort((a, b) => Number(a.occurredAt || 0) -
        Number(b.occurredAt || 0));
    return {
        ok: true,
        athleteUid,
        intakeId,
        caseLink,
        activity
    };
});
