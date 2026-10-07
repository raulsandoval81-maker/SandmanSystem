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
function ageFromDob(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const birth = new Date(year, month - 1, day);
    if (birth.getFullYear() !== year ||
        birth.getMonth() !== month - 1 ||
        birth.getDate() !== day)
        return null;
    const now = new Date();
    let age = now.getFullYear() - year;
    const monthDiff = now.getMonth() - (month - 1);
    const dayDiff = now.getDate() - day;
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0))
        age -= 1;
    return age;
}
function athleteDob(athlete) {
    return String(athlete.dob ||
        athlete.profile?.dob ||
        athlete.athlete?.dob ||
        "").trim();
}
function pendingParentRelationshipId(athleteUid, email) {
    const emailKey = crypto
        .createHash("sha256")
        .update(email)
        .digest("hex")
        .slice(0, 16);
    return `pending_${athleteUid}_${emailKey}`;
}
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
        const athlete = athleteSnap.data() || {};
        (0, staffAuthorization_1.requireStaffLocation)(issuer, athlete.locationId, "This athlete is outside your authorized location scope.");
        if (String(athlete.authUid || "").trim()) {
            throw new https_1.HttpsError("failed-precondition", "Athlete access is already activated.");
        }
        const age = ageFromDob(athleteDob(athlete));
        const requiresParentApproval = age === null || age < 14;
        const parentApproved = req.data?.parentApproved === true;
        if (requiresParentApproval && !parentApproved) {
            throw new https_1.HttpsError("failed-precondition", "Athletes under age 14 require recorded Parent or guardian approval for direct Athlete access.");
        }
        const accessMode = requiresParentApproval ? "hybrid" : "self_managed";
        let context;
        try {
            context = (0, accessInvitationPolicy_1.assertAthleteInvitationContext)({
                role,
                email,
                athleteUid,
                accessMode,
                parentApproved: requiresParentApproval ? true : false,
            });
        }
        catch (error) {
            const reason = String(error?.message || "");
            if (reason === "PARENT_APPROVAL_REQUIRED") {
                throw new https_1.HttpsError("failed-precondition", "Parent or guardian approval is required.");
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
            ageAtIssue: age,
            exp,
            used: false,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            createdBy: issuer.uid,
            createdByRole: issuer.role,
            source: "management_athlete_access",
        });
        return {
            ok: true,
            role: "athlete",
            tokenId,
            exp,
            email,
            athleteUid,
            accessMode: context.accessMode,
            requiresParentApproval,
        };
    }
    if (role !== "parent") {
        throw new https_1.HttpsError("invalid-argument", "Only Parent and Athlete invitations are enabled.");
    }
    const athleteSnap = await db.doc(`athletes/${athleteUid}`).get();
    if (!athleteSnap.exists)
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    const athlete = athleteSnap.data() || {};
    (0, staffAuthorization_1.requireStaffLocation)(issuer, athlete.locationId, "This athlete is outside your authorized location scope.");
    const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteUid).get();
    let relationshipId = links.docs.find((candidate) => {
        const data = candidate.data() || {};
        return (0, accessInvitationPolicy_1.normalizeAccessEmail)(data.parentEmail) === email
            && ["pending", "active"].includes(String(data.status || "").toLowerCase());
    })?.id || "";
    /*
     * A new Parent may not have a Firebase Auth account yet. Older activation
     * logic only created parentAthleteLinks when parentUid already existed,
     * which made first-time Parent registration impossible. When Management
     * issues the invitation, the activated Athlete record is authoritative for
     * the approved Parent email, so create the pending relationship here if it
     * is missing. The invitation consumer will bind parentUid after registration.
     */
    if (!relationshipId) {
        const approvedParentEmail = (0, accessInvitationPolicy_1.normalizeAccessEmail)(athlete.parentEmail);
        if (!approvedParentEmail || approvedParentEmail !== email) {
            throw new https_1.HttpsError("failed-precondition", "Approved Parent relationship not found.");
        }
        const relationshipRef = db.doc(`parentAthleteLinks/${pendingParentRelationshipId(athleteUid, email)}`);
        await relationshipRef.set({
            parentUid: null,
            athleteUid,
            parentEmail: email,
            status: "pending",
            source: "management_parent_access",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        relationshipId = relationshipRef.id;
    }
    const context = (0, accessInvitationPolicy_1.assertParentInvitationContext)({
        role: "parent",
        email,
        athleteUid,
        relationshipId,
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
