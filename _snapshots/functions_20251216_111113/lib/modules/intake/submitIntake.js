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
exports.submitIntake = void 0;
// functions/src/modules/intake/submitIntake.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.submitIntake = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    // v2: data is on request.data
    const data = request.data;
    if (!data || !data.athlete || !((_a = data.athlete.first) === null || _a === void 0 ? void 0 : _a.trim())) {
        throw new Error("athlete.first is required");
    }
    const docId = (data.token && data.token.trim()) || db.collection("intakes").doc().id;
    const waiverAccepted = !!((_b = data.waiver) === null || _b === void 0 ? void 0 : _b.accepted);
    await db
        .collection("intakes")
        .doc(docId)
        .set({
        token: (_c = data.token) !== null && _c !== void 0 ? _c : null,
        athlete: {
            first: data.athlete.first.trim(),
            last: ((_d = data.athlete.last) === null || _d === void 0 ? void 0 : _d.trim()) || null,
            dob: data.athlete.dob || null,
        },
        contact: (_e = data.contact) !== null && _e !== void 0 ? _e : {},
        emer: (_f = data.emer) !== null && _f !== void 0 ? _f : {},
        location: (_g = data.location) !== null && _g !== void 0 ? _g : {},
        medical: (_h = data.medical) !== null && _h !== void 0 ? _h : null,
        waiver: {
            status: waiverAccepted ? "accepted" : "pending",
            seen: !!((_j = data.waiver) === null || _j === void 0 ? void 0 : _j.seen),
            accepted: waiverAccepted,
            sign: ((_k = data.waiver) === null || _k === void 0 ? void 0 : _k.sign) || "",
            signDate: ((_l = data.waiver) === null || _l === void 0 ? void 0 : _l.signDate) || "",
            sigData: ((_m = data.waiver) === null || _m === void 0 ? void 0 : _m.sigData) || null,
        },
        status: "submitted",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, intakeId: docId, status: "submitted" };
});
