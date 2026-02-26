"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitIntake = void 0;
// functions/src/modules/intake/submitIntake.ts
const https_1 = require("firebase-functions/v2/https");
const admin_1 = require("../../infra/admin");
exports.submitIntake = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    if (!data || !data.athlete || !data.athlete.first?.trim()) {
        throw new Error("athlete.first is required");
    }
    // if they used an invite token, write to THAT doc
    const docId = (data.token && data.token.trim()) || admin_1.db.collection("intakes").doc().id;
    const waiverAccepted = !!data.waiver?.accepted;
    await admin_1.db
        .collection("intakes")
        .doc(docId)
        .set({
        token: data.token ?? null,
        athlete: {
            first: data.athlete.first.trim(),
            last: data.athlete.last?.trim() || null,
            dob: data.athlete.dob || null,
        },
        contact: data.contact ?? {},
        emer: data.emer ?? {},
        location: data.location ?? {},
        medical: data.medical ?? null,
        waiver: {
            status: waiverAccepted ? "accepted" : "pending",
            seen: !!data.waiver?.seen,
            accepted: waiverAccepted,
            sign: data.waiver?.sign || "",
            signDate: data.waiver?.signDate || "",
            sigData: data.waiver?.sigData || null,
        },
        status: "submitted",
        createdAt: admin_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, intakeId: docId, status: "submitted" };
});
