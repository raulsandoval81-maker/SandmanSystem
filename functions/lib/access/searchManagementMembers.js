"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchManagementMembers = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const staffAuthorization_1 = require("../services/staffAuthorization");
const managementMemberPolicy_1 = require("./managementMemberPolicy");
const db = (0, firestore_1.getFirestore)();
exports.searchManagementMembers = (0, https_1.onCall)(async (req) => {
    if (!req.auth)
        throw new https_1.HttpsError("unauthenticated", "Sign-in required.");
    const authorized = await (0, staffAuthorization_1.requireActiveStaff)(req.auth.uid, staffAuthorization_1.MANAGEMENT_STAFF_ROLES, "Active Management access required.");
    const search = (0, managementMemberPolicy_1.cleanMemberValue)(req.data?.search);
    if (search.length < 2 || search.length > 100) {
        throw new https_1.HttpsError("invalid-argument", "Enter at least two characters of an Athlete ID or name.");
    }
    const scope = (0, managementMemberPolicy_1.managementLocationScope)(authorized.staff, authorized.role);
    if (Array.isArray(scope) && !scope.length)
        return { ok: true, members: [] };
    const candidates = new Map();
    const direct = await db.doc(`athletes/${search.toUpperCase()}`).get();
    if (direct.exists)
        candidates.set(direct.id, direct.data() || {});
    if (scope === null) {
        const snapshot = await db.collection("athletes").limit(500).get();
        for (const doc of snapshot.docs)
            candidates.set(doc.id, doc.data() || {});
    }
    else {
        for (const locationId of scope) {
            const snapshot = await db.collection("athletes").where("locationId", "==", locationId).limit(250).get();
            for (const doc of snapshot.docs)
                candidates.set(doc.id, doc.data() || {});
        }
    }
    const allowed = [...candidates.entries()].filter(([, athlete]) => scope === null || scope.includes((0, managementMemberPolicy_1.cleanMemberValue)(athlete.locationId || athlete.team?.locationId)));
    const members = [];
    for (const [athleteId, athlete] of allowed) {
        const links = await db.collection("parentAthleteLinks").where("athleteUid", "==", athleteId).limit(10).get();
        const member = (0, managementMemberPolicy_1.mapManagementMember)(athleteId, athlete, links.docs.map((doc) => doc.data() || {}));
        if ((0, managementMemberPolicy_1.memberMatchesSearch)(member, search))
            members.push(member);
        if (members.length >= 10)
            break;
    }
    return { ok: true, members };
});
