"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementXp = void 0;
// functions/src/modules/xp/incrementXp.ts
const https_1 = require("firebase-functions/v2/https");
const incrementXpCore_1 = require("./incrementXpCore");
exports.incrementXp = (0, https_1.onCall)(async (request) => {
    try {
        const data = request.data;
        const authUid = request.auth?.uid ?? null;
        return await (0, incrementXpCore_1.handleIncrementXp)(data, { authUid });
    }
    catch (err) {
        throw new https_1.HttpsError("invalid-argument", err?.message || "xp error");
    }
});
