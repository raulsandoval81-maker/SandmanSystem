"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESEND_API_KEY = void 0;
exports.getResendClient = getResendClient;
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
exports.RESEND_API_KEY = (0, params_1.defineSecret)("RESEND_API_KEY");
function getResendClient() {
    const key = exports.RESEND_API_KEY.value();
    if (!key) {
        throw new Error("Missing RESEND_API_KEY secret");
    }
    return new resend_1.Resend(key);
}
