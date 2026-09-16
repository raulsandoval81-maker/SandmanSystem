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
exports.assertPassReadyToClose = assertPassReadyToClose;
exports.passIntelligenceSummary = passIntelligenceSummary;
const functions = __importStar(require("firebase-functions"));
const clean = (value) => String(value ?? "").trim();
function assertPassReadyToClose(message) {
    if (clean(message.topic) !== "request-pass")
        return;
    if (!message.passAttendanceConfirmedAt || clean(message.passPaymentStatus) !== "paid"
        || !clean(message.stripePaymentIntentId)) {
        throw new functions.https.HttpsError("failed-precondition", "Confirm attendance and wait for verified payment before closing this pass request.");
    }
}
function passIntelligenceSummary(message) {
    if (clean(message.topic) !== "request-pass")
        return {};
    return {
        passAttendanceConfirmedAt: message.passAttendanceConfirmedAt,
        passAttendanceConfirmedBy: clean(message.passAttendanceConfirmedBy) || null,
        passPaymentStatus: "paid",
        passAmountCents: message.passAmountCents ?? null,
        passCurrency: clean(message.passCurrency) || null,
        passPaidAt: message.passPaidAt || null,
        stripeCheckoutSessionId: clean(message.stripeCheckoutSessionId) || null,
        stripePaymentIntentId: clean(message.stripePaymentIntentId),
        ...(clean(message.stripeReceiptUrl) ? { stripeReceiptUrl: clean(message.stripeReceiptUrl) } : {}),
    };
}
