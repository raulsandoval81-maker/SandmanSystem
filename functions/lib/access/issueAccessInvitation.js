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
exports.issueAccessInvitation = void 0;
const crypto = __importStar(require("crypto"));
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const accessInvitationPolicy_1 = require("./accessInvitationPolicy");
const db = (0, firestore_1.getFirestore)();
exports.issueAccessInvitation = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const issuer = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access required.");
    const role = String(req.data?.role || "").trim().toLowerCase();
    const athleteUid = String(req.data?.athleteUid || "").trim().toUpperCase();
    const email = (0, accessInvitationPolicy_1.normalizeAccessEmail)(req.data?.email);
    if (role === "athlete") {
        const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
        if (!athleteSnap.exists)
            throw new https_1.HttpsError("not-found", "Athlete not found.");
        if (String(athleteSnap.data()?.authUid || "").trim()) {
            throw new https_1.HttpsError("failed-precondition", "Athlete access is already activated.");
        }
        let context;
        try {
            context = (0, accessInvitationPolicy_1.assertAthleteInvitationContext)({
                role, email, athleteUid,
                accessMode: req.data?.accessMode,
                parentApproved: req.data?.parentApproved,
            });
        }
        catch (error) {
            const reason = String(error?.message || "");
            if (reason === "PARENT_APPROVAL_REQUIRED") {
                throw new https_1.HttpsError("failed-precondition", "Hybrid Athlete access requires recorded Parent approval.");
            }
            throw new https_1.HttpsError("invalid-argument", "Valid Athlete access details are required.");
        }
        const tokenId = crypto.randomBytes(32).toString("hex");
        const exp = Date.now() + accessInvitationPolicy_1.ACCESS_INVITATION_TTL_MS;
        await db.collection("accessInvitations").doc(tokenId).create({
            role: context.role,
            subjectId: context.athleteUid,
            athleteUid: context.athleteUid,
            email: context.email,
            accessMode: context.accessMode,
            parentApproved: context.parentApproved,
            parentApprovalRecordedBy: context.parentApproved ? issuer.uid : null,
            parentApprovalRecordedAt: context.parentApproved ? firestore_1.FieldValue.serverTimestamp() : null,
            exp,
            used: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdBy: issuer.uid,
            createdByRole: issuer.role,
            source: "management_athlete_access",
        });
        return { ok: true, role: "athlete", tokenId, exp, email, athleteUid, accessMode: context.accessMode };
    }
    if (role !== "parent") {
        throw new https_1.HttpsError("invalid-argument", "Only Parent and Athlete invitations are enabled.");
    }
    const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteUid).get();
    const relationship = links.docs.find((candidate) => {
        const data = candidate.data() || {};
        return (0, accessInvitationPolicy_1.normalizeAccessEmail)(data.parentEmail) === email
            && ["pending", "active"].includes(String(data.status || "").toLowerCase());
    });
    if (!relationship) {
        throw new https_1.HttpsError("failed-precondition", "Approved Parent relationship not found.");
    }
    const context = (0, accessInvitationPolicy_1.assertParentInvitationContext)({
        role: "parent", email, athleteUid, relationshipId: relationship.id,
    });
    const tokenId = crypto.randomBytes(32).toString("hex");
    const exp = Date.now() + accessInvitationPolicy_1.ACCESS_INVITATION_TTL_MS;
    await db.collection("accessInvitations").doc(tokenId).create({
        role: context.role,
        subjectId: context.relationshipId,
        relationshipId: context.relationshipId,
        athleteUid: context.athleteUid,
        email: context.email,
        exp,
        used: false,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        createdBy: issuer.uid,
        createdByRole: issuer.role,
        source: "management_parent_access",
    });
    return { ok: true, role: "parent", tokenId, exp, email, athleteUid };
});
