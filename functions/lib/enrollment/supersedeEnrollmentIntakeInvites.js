"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supersedeEnrollmentIntakeInvites = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const proposalAccess_1 = require("../proposals/proposalAccess");
function clean(value) {
    return String(value ?? "").trim();
}
function normalizeAudience(value) {
    return clean(value)
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}
exports.supersedeEnrollmentIntakeInvites = (0, https_1.onCall)(async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to update enrollment intake handoffs.");
    }
    const proposalId = clean(req.data?.proposalId);
    const audience = normalizeAudience(req.data?.intakeAudience);
    if (!proposalId) {
        throw new https_1.HttpsError("invalid-argument", "proposalId is required.");
    }
    if (audience !== "adult_athlete" &&
        audience !== "parent_guardian") {
        throw new https_1.HttpsError("invalid-argument", "A valid intakeAudience is required.");
    }
    const staffAccess = await (0, proposalAccess_1.requireProposalStaffAccess)(req.auth.uid);
    const db = (0, firestore_1.getFirestore)();
    const proposalRef = db.collection("proposals")
        .doc(proposalId);
    const proposalSnap = await proposalRef.get();
    if (!proposalSnap.exists) {
        throw new https_1.HttpsError("not-found", `Proposal ${proposalId} was not found.`);
    }
    const proposal = proposalSnap.data() || {};
    (0, proposalAccess_1.requireProposalLocationAccess)(staffAccess, proposal.locationId);
    if (clean(proposal.status).toUpperCase() !==
        "PAID") {
        throw new https_1.HttpsError("failed-precondition", "Only paid proposals may update intake handoffs.");
    }
    const oppositeAudience = audience === "adult_athlete"
        ? "parent_guardian"
        : "adult_athlete";
    const historySnapshot = await proposalRef
        .collection("history")
        .get();
    const tokenIds = [...new Set(historySnapshot.docs
            .map((historyDoc) => historyDoc.data() || {})
            .filter((record) => clean(record.event)
            .toUpperCase() ===
            "INTAKE_INVITE_CREATED" &&
            normalizeAudience(record.intakeAudience) === oppositeAudience &&
            clean(record.intakeTokenId))
            .map((record) => clean(record.intakeTokenId)))];
    let supersededCount = 0;
    for (const tokenId of tokenIds) {
        const tokenRef = db.collection("intakeTokens")
            .doc(tokenId);
        await db.runTransaction(async (tx) => {
            const tokenSnap = await tx.get(tokenRef);
            if (!tokenSnap.exists) {
                return;
            }
            const token = tokenSnap.data() || {};
            if (clean(token.proposalId) !==
                proposalId ||
                normalizeAudience(token.intakeAudience) !== oppositeAudience ||
                clean(token.source)
                    .toLowerCase() !==
                    "management_enrollment" ||
                token.used === true) {
                return;
            }
            tx.set(tokenRef, {
                used: true,
                status: "superseded",
                supersededAt: firestore_1.FieldValue.serverTimestamp(),
                supersededByAudience: audience,
                supersededBy: req.auth.uid,
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            supersededCount += 1;
        });
    }
    const rawPrefill = req.data?.prefill &&
        typeof req.data.prefill === "object" &&
        !Array.isArray(req.data.prefill)
        ? req.data.prefill
        : {};
    const prefill = Object.fromEntries(Object.entries(rawPrefill)
        .map(([key, value]) => [
        key,
        clean(value),
    ])
        .filter(([, value]) => Boolean(value)));
    const connectLeadId = clean(req.data?.connectLeadId) || null;
    const tokenId = (0, node_crypto_1.randomBytes)(8)
        .toString("hex");
    const tokenRef = db.collection("intakeTokens")
        .doc(tokenId);
    const exp = Date.now() +
        48 * 60 * 60 * 1000;
    await tokenRef.set({
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        exp,
        used: false,
        status: "invited",
        mode: "new_athlete",
        intakeAudience: audience,
        intakeRoute: audience === "adult_athlete"
            ? "athlete"
            : "parent",
        existingAthleteUid: "",
        forTrack: null,
        forLane: null,
        requestedTrackCode: null,
        requestedDiscipline: null,
        existingAthleteName: null,
        proposalId,
        connectLeadId,
        locationId: clean(proposal.locationId),
        prefill,
        source: "management_enrollment",
        workflowVersion: "intake-v2",
        createdBy: req.auth.uid,
    });
    return {
        ok: true,
        proposalId,
        intakeAudience: audience,
        supersededCount,
        tokenId,
        exp,
    };
});
