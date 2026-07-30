"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STRIPE_WEBHOOK_SECRET = exports.STRIPE_SECRET_KEY = void 0;
exports.getStripe = getStripe;
const stripe_1 = __importDefault(require("stripe"));
const params_1 = require("firebase-functions/params");
exports.STRIPE_SECRET_KEY = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
exports.STRIPE_WEBHOOK_SECRET = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
let stripe = null;
function getStripe() {
    if (!stripe) {
        const key = exports.STRIPE_SECRET_KEY.value();
        if (!key) {
            throw new Error("Missing STRIPE_SECRET_KEY");
        }
        stripe = new stripe_1.default(key);
    }
    return stripe;
}
