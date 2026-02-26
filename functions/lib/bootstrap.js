"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
if (!firebase_admin_1.default.apps.length) {
    firebase_admin_1.default.initializeApp();
}
exports.db = (0, firestore_1.getFirestore)();
// Log once per cold start (safe)
if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("🔥 Using Firestore Emulator:", process.env.FIRESTORE_EMULATOR_HOST);
}
