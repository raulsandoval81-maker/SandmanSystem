"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStaffGovernance = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const staffGovernancePolicy_1 = require("./staffGovernancePolicy");
exports.updateStaffGovernance = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Admin authentication required.");
    const actor = await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, ["admin"], "Active Admin access required.");
    const update = (0, staffGovernancePolicy_1.validateStaffGovernanceUpdate)(request.data);
    const db = (0, firestore_1.getFirestore)();
    const targetRef = db.doc(`staff/${update.staffUid}`);
    await db.runTransaction(async (tx) => {
        const targetSnap = await tx.get(targetRef);
        if (!targetSnap.exists)
            throw new https_1.HttpsError("not-found", "Staff record not found.");
        const current = targetSnap.data() || {};
        if ((0, staffGovernancePolicy_1.removesActiveAdmin)(current, update)) {
            const activeStaff = await tx.get(db.collection("staff").where("status", "==", "active"));
            const activeAdminCount = activeStaff.docs.filter((doc) => (0, staffAuthorization_1.normalizeStaffRole)(doc.data().role) === "admin").length;
            if (activeAdminCount <= 1) {
                throw new https_1.HttpsError("failed-precondition", "The last active Admin cannot be demoted or deactivated.");
            }
        }
        tx.update(targetRef, {
            role: update.role,
            status: update.status,
            locationIds: update.locationIds,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedBy: actor.uid,
            updatedByRole: "admin",
        });
    });
    return { ok: true, ...update };
});
