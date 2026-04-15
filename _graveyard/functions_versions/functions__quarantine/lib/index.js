"use strict";
/* eslint-disable @typescript-eslint/no-var-requires */
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
exports.submitIntake = exports.ping = void 0;
const Module = require("module");
const _load = Module._load;
function wrapConfigIfPresent(loaded, parent, request) {
    // If this loaded module has a config() function, intercept it.
    if (loaded && typeof loaded.config === "function") {
        const original = loaded.config.bind(loaded);
        loaded.config = (...args) => {
            console.error("\n🚨 functions.config() CALL INTERCEPTED");
            console.error("request:", request);
            console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
            console.error(new Error("STACK").stack);
            // IMPORTANT: don't crash the worker while debugging
            // Return empty config so emulator keeps running.
            return {};
            // If you ever want to prove it would crash, uncomment:
            // return original(...args);
        };
    }
    return loaded;
}
Module._load = function (request, parent, isMain) {
    // Scream if any v1 config module is loaded
    const looksLikeV1Config = request.includes("firebase-functions/lib/v1") ||
        request.includes("firebase-functions/v1") ||
        request.includes("/v1/config") ||
        request.includes("lib/v1/config");
    if (looksLikeV1Config) {
        console.error("\n🚨 V1 firebase-functions module loaded:", request);
        console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
        console.error(new Error("STACK").stack);
    }
    const loaded = _load.apply(this, arguments);
    // Wrap ANY firebase-functions* entrypoint (not just exact match)
    if (typeof request === "string" && request.startsWith("firebase-functions")) {
        return wrapConfigIfPresent(loaded, parent, request);
    }
    return loaded;
};
process.on("uncaughtException", (e) => {
    console.error("🔥 uncaughtException:", e?.stack || e);
});
process.on("unhandledRejection", (e) => {
    console.error("🔥 unhandledRejection:", e?.stack || e);
});
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length)
    admin.initializeApp();
var ping_1 = require("./modules/ping");
Object.defineProperty(exports, "ping", { enumerable: true, get: function () { return ping_1.ping; } });
var submitIntake_1 = require("./modules/intake/submitIntake");
Object.defineProperty(exports, "submitIntake", { enumerable: true, get: function () { return submitIntake_1.submitIntake; } });
