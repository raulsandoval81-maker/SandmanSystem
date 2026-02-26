"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementXp = void 0;
// functions/src/modules/xp/incrementXp.ts
const https_1 = require("firebase-functions/v2/https");
const incrementXpCore_1 = require("./incrementXpCore");
exports.incrementXp = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    try {
        const data = request.data;
        const authUid = (_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : null;
        return await (0, incrementXpCore_1.handleIncrementXp)(data, { authUid });
    }
    catch (err) {
        throw new https_1.HttpsError("invalid-argument", (err === null || err === void 0 ? void 0 : err.message) || "xp error");
    }
});
