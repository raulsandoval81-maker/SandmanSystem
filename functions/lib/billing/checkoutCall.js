"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBillingCheckoutCall = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const checkout_1 = require("./checkout");
const stripeClient_1 = require("./stripeClient");
function cleanString(value) {
    return String(value ?? "").trim();
}
function cleanEmail(value) {
    return cleanString(value).toLowerCase();
}
function hasCoachAccess(token) {
    return (token.admin === true ||
        token.coach === true ||
        token.role === "admin" ||
        token.role === "coach");
}
exports.createBillingCheckoutCall = (0, https_1.onCall)({
    secrets: [stripeClient_1.STRIPE_SECRET_KEY],
}, async (req) => {
    if (!req.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in to begin billing checkout.");
    }
    const familyId = cleanString(req.data?.familyId);
    if (!familyId) {
        throw new https_1.HttpsError("invalid-argument", "A familyId is required.");
    }
    const db = (0, firestore_1.getFirestore)();
    const familyRef = db.collection("families").doc(familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists) {
        throw new https_1.HttpsError("failed-precondition", "Family setup is required before billing can begin.");
    }
    const family = familySnap.data() || {};
    const callerUid = req.auth.uid;
    const token = req.auth.token;
    const parentUids = Array.isArray(family.parentUids)
        ? family.parentUids.map(cleanString)
        : [];
    const primaryParentUid = cleanString(family.primaryParentUid);
    const callerIsParent = primaryParentUid === callerUid ||
        parentUids.includes(callerUid);
    const callerIsCoach = hasCoachAccess(token);
    if (!callerIsParent && !callerIsCoach) {
        throw new https_1.HttpsError("permission-denied", "You do not have access to this family billing account.");
    }
    const familyName = cleanString(family.familyName ||
        family.name ||
        family.primaryContact?.name);
    const email = cleanEmail(family.billingEmail ||
        family.primaryContact?.email ||
        family.email);
    const stripePriceId = cleanString(family.stripePriceId ||
        family.billing?.stripePriceId);
    const stripeCustomerId = cleanString(family.stripeCustomerId ||
        family.billing?.stripeCustomerId) || null;
    if (!familyName) {
        throw new https_1.HttpsError("failed-precondition", "The family record is missing a billing name.");
    }
    if (!email || !email.includes("@")) {
        throw new https_1.HttpsError("failed-precondition", "The family record is missing a valid billing email.");
    }
    if (!stripePriceId) {
        throw new https_1.HttpsError("failed-precondition", "A membership plan must be assigned before checkout.");
    }
    const publicBaseUrl = cleanString(process.env.SANDMAN_PUBLIC_BASE_URL) || "https://www.sandmancombat.com";
    try {
        const result = await (0, checkout_1.createSubscriptionCheckout)({
            familyId,
            familyName,
            email,
            priceId: stripePriceId,
            stripeCustomerId,
            successUrl: `${publicBaseUrl}/billing/success/`,
            cancelUrl: `${publicBaseUrl}/billing/cancel/`,
        });
        await familyRef.set({
            stripeCustomerId: result.stripeCustomerId,
            billing: {
                stripeCustomerId: result.stripeCustomerId,
                pendingCheckoutSessionId: result.checkoutSessionId,
                checkoutStartedAt: firestore_1.FieldValue.serverTimestamp(),
                checkoutStartedBy: callerUid,
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
            ok: true,
            familyId,
            checkoutSessionId: result.checkoutSessionId,
            checkoutUrl: result.checkoutUrl,
        };
    }
    catch (error) {
        console.error("[createBillingCheckoutCall] Checkout failed:", error);
        throw new https_1.HttpsError("internal", error instanceof Error
            ? error.message
            : "Unable to create billing checkout.");
    }
});
