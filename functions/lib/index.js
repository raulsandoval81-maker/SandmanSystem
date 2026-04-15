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
exports.onboardingConfirmStep1 = exports.consumeOnboardingToken = exports.approveAndActivate = exports.createAthleteFromIntakeCall = exports.approveIntakeCall = exports.logArenaHttp = exports.promoteTier = exports.xpHttp = exports.incrementXp = exports.testAthleteXp = exports.testXpWrite = exports.ping = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
// ---- Health / Debug
var ping_1 = require("./modules/ping");
Object.defineProperty(exports, "ping", { enumerable: true, get: function () { return ping_1.ping; } });
var testXpWrite_1 = require("./modules/testXpWrite");
Object.defineProperty(exports, "testXpWrite", { enumerable: true, get: function () { return testXpWrite_1.testXpWrite; } });
var testAthleteXp_1 = require("./modules/testAthleteXp");
Object.defineProperty(exports, "testAthleteXp", { enumerable: true, get: function () { return testAthleteXp_1.testAthleteXp; } });
// ---- XP Core
var incrementXp_1 = require("./modules/incrementXp"); // onCall (app)
Object.defineProperty(exports, "incrementXp", { enumerable: true, get: function () { return incrementXp_1.incrementXp; } });
var xpHttp_1 = require("./modules/xpHttp"); // onRequest (weekend)
Object.defineProperty(exports, "xpHttp", { enumerable: true, get: function () { return xpHttp_1.xpHttp; } });
var promoteTier_1 = require("./modules/promoteTier");
Object.defineProperty(exports, "promoteTier", { enumerable: true, get: function () { return promoteTier_1.promoteTier; } });
// ---- Arena (log-only in V1)
var logArenaHttp_1 = require("./modules/logArenaHttp");
Object.defineProperty(exports, "logArenaHttp", { enumerable: true, get: function () { return logArenaHttp_1.logArenaHttp; } });
// ---- Intake (TOKEN FLOW)
var approveIntakeCall_1 = require("./modules/approveIntakeCall");
Object.defineProperty(exports, "approveIntakeCall", { enumerable: true, get: function () { return approveIntakeCall_1.approveIntakeCall; } });
var createAthleteFromIntakeCall_1 = require("./modules/createAthleteFromIntakeCall");
Object.defineProperty(exports, "createAthleteFromIntakeCall", { enumerable: true, get: function () { return createAthleteFromIntakeCall_1.createAthleteFromIntakeCall; } });
var approveAndActivate_1 = require("./approveAndActivate");
Object.defineProperty(exports, "approveAndActivate", { enumerable: true, get: function () { return approveAndActivate_1.approveAndActivate; } });
// ---- Onboarding (single-use token)
var consumeOnboardingToken_1 = require("./modules/consumeOnboardingToken");
Object.defineProperty(exports, "consumeOnboardingToken", { enumerable: true, get: function () { return consumeOnboardingToken_1.consumeOnboardingToken; } });
var onboardingConfirmStep1_1 = require("./onboardingConfirmStep1");
Object.defineProperty(exports, "onboardingConfirmStep1", { enumerable: true, get: function () { return onboardingConfirmStep1_1.onboardingConfirmStep1; } });
