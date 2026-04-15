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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ping = void 0;
// TEMP DEBUG: show who triggers functions.config()
const module_1 = __importDefault(require("module"));
const _load = module_1.default._load;
module_1.default._load = function (request, parent, isMain) {
    const loaded = _load.apply(this, arguments);
    // When firebase-functions v2 loads, it also requires v1/config internally.
    // If anything actually calls config(), print the stack.
    if (request === "firebase-functions") {
        return new Proxy(loaded, {
            get(target, prop) {
                if (prop === "config") {
                    return (...args) => {
                        console.error("\n🚨 functions.config() CALLED");
                        console.error("↳ parent:", parent?.filename || parent?.id || "(unknown)");
                        console.error(new Error("STACK").stack);
                        return target.config(...args);
                    };
                }
                return target[prop];
            },
        });
    }
    return loaded;
};
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
if (!admin.apps.length)
    admin.initializeApp();
exports.ping = (0, https_1.onRequest)((req, res) => {
    res.status(200).send("pong");
});
