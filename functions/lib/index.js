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
exports.sendGatekeeperEmail = exports.submitVolunteer = exports.submitContact = exports.onboardingConfirmStep1 = exports.consumeOnboardingToken = exports.approveAndActivate = exports.createAthleteFromIntakeCall = exports.approveIntakeCall = exports.logArenaHttp = exports.markParentInboxRead = exports.getParentInbox = exports.getTestingHistory = exports.startTesting = exports.scheduleTesting = exports.freezeAthlete = exports.promoteTier = exports.xpHttp = exports.incrementXp = exports.testAthleteXp = exports.testXpWrite = exports.ping = void 0;
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
var incrementXp_1 = require("./modules/incrementXp");
Object.defineProperty(exports, "incrementXp", { enumerable: true, get: function () { return incrementXp_1.incrementXp; } });
var xpHttp_1 = require("./modules/xpHttp");
Object.defineProperty(exports, "xpHttp", { enumerable: true, get: function () { return xpHttp_1.xpHttp; } });
var promoteTier_1 = require("./modules/promoteTier");
Object.defineProperty(exports, "promoteTier", { enumerable: true, get: function () { return promoteTier_1.promoteTier; } });
var freezeAthlete_1 = require("./modules/freezeAthlete");
Object.defineProperty(exports, "freezeAthlete", { enumerable: true, get: function () { return freezeAthlete_1.freezeAthlete; } });
var scheduleTesting_1 = require("./modules/scheduleTesting");
Object.defineProperty(exports, "scheduleTesting", { enumerable: true, get: function () { return scheduleTesting_1.scheduleTesting; } });
var startTesting_1 = require("./modules/startTesting");
Object.defineProperty(exports, "startTesting", { enumerable: true, get: function () { return startTesting_1.startTesting; } });
var getTestingHistory_1 = require("./modules/getTestingHistory");
Object.defineProperty(exports, "getTestingHistory", { enumerable: true, get: function () { return getTestingHistory_1.getTestingHistory; } });
var getParentInbox_1 = require("./modules/parent/getParentInbox");
Object.defineProperty(exports, "getParentInbox", { enumerable: true, get: function () { return getParentInbox_1.getParentInbox; } });
var markParentInboxRead_1 = require("./modules/parent/markParentInboxRead");
Object.defineProperty(exports, "markParentInboxRead", { enumerable: true, get: function () { return markParentInboxRead_1.markParentInboxRead; } });
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
// ---- Communications (forms / intake)
var forms_1 = require("./handlers/forms");
Object.defineProperty(exports, "submitContact", { enumerable: true, get: function () { return forms_1.submitContact; } });
Object.defineProperty(exports, "submitVolunteer", { enumerable: true, get: function () { return forms_1.submitVolunteer; } });
var sendGatekeeperEmail_1 = require("./modules/sendGatekeeperEmail");
Object.defineProperty(exports, "sendGatekeeperEmail", { enumerable: true, get: function () { return sendGatekeeperEmail_1.sendGatekeeperEmail; } });
