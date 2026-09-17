"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminOversightSummary = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const adminOversightPolicy_1 = require("./adminOversightPolicy");
const COLLECTIONS = [
    ["messages", "general_messages"],
    ["leads", "interest_leads"],
    ["admissionsRequests", "admissions_requests"],
    ["appointments", "admissions_appointments"],
    ["proposals", "proposals"],
    ["intakes", "intakes"],
    ["athletes", "athletes"],
    ["practices", "practiceSessions"],
    ["attendance", "attendance_sessions"],
    ["schedules", "paraSchedule"],
    ["scheduleDrafts", "paraScheduleDrafts"],
    ["staff", "staff"],
];
exports.getAdminOversightSummary = (0, https_1.onCall)(async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Admin authentication required.");
    await (0, staffAuthorization_1.requireActiveStaff)(request.auth.uid, ["admin"], "Active Admin access required.");
    const db = (0, firestore_1.getFirestore)();
    const snapshots = await Promise.all(COLLECTIONS.map(([, collection]) => db.collection(collection).get()));
    const sources = {};
    COLLECTIONS.forEach(([key], index) => {
        sources[key] = snapshots[index].docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
    });
    return (0, adminOversightPolicy_1.buildAdminOversightSummary)(sources);
});
