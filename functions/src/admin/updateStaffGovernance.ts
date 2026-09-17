import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { normalizeStaffRole, requireActiveStaff } from "../services/staffAuthorization";
import { removesActiveAdmin, validateStaffGovernanceUpdate } from "./staffGovernancePolicy";

export const updateStaffGovernance = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, ["admin"], "Active Admin access required.");
  const update = validateStaffGovernanceUpdate(request.data);
  const db = getFirestore();
  const targetRef = db.doc(`staff/${update.staffUid}`);

  await db.runTransaction(async (tx) => {
    const targetSnap = await tx.get(targetRef);
    if (!targetSnap.exists) throw new HttpsError("not-found", "Staff record not found.");
    const current = targetSnap.data() || {};

    if (removesActiveAdmin(current, update)) {
      const activeStaff = await tx.get(db.collection("staff").where("status", "==", "active"));
      const activeAdminCount = activeStaff.docs.filter((doc) =>
        normalizeStaffRole(doc.data().role) === "admin"
      ).length;
      if (activeAdminCount <= 1) {
        throw new HttpsError("failed-precondition", "The last active Admin cannot be demoted or deactivated.");
      }
    }

    tx.update(targetRef, {
      role: update.role,
      status: update.status,
      locationIds: update.locationIds,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      updatedByRole: "admin",
    });
  });

  return { ok: true, ...update };
});
