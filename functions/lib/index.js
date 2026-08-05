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
exports.createProposalCheckout = exports.lockProposal = exports.approveProposal = exports.submitProposalForReview = exports.updateProposalDraft = exports.createProposalDraft = exports.stripeBillingWebhook = exports.createBillingCheckoutCall = exports.retestAthlete = exports.sendGatekeeperEmail = exports.submitVolunteer = exports.submitContact = exports.onboardingConfirmStep1 = exports.consumeOnboardingToken = exports.addDisciplineCoachCall = exports.createCoachAthleteCall = exports.approveAndActivate = exports.createAthleteFromIntakeCall = exports.approveIntakeCall = exports.logArenaHttp = exports.getAthleteProfileFeed = exports.coachAction = exports.testProgressionEngine = exports.testCertificatePayloadEngine = exports.testPromotionEngine = exports.testTestingEngine = exports.testStripeEngine = exports.testAthleteNormalizer = exports.testAthleteLoader = exports.linkParentToAthlete = exports.sendTestDayPings = exports.saveCoachNote = exports.markParentInboxRead = exports.getParentInbox = exports.getMyAthlete = exports.sendTournamentPing = exports.scheduledDecaySweep = exports.testRecognitionQueue = exports.getTestingHistory = exports.startTesting = exports.scheduleTesting = exports.freezeAthlete = exports.promoteTier = exports.xpHttp = exports.incrementXp = exports.testAthleteXp = exports.testXpWrite = exports.ping = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
/* =========================
   HEALTH / DEBUG
========================= */
var ping_1 = require("./modules/ping");
Object.defineProperty(exports, "ping", { enumerable: true, get: function () { return ping_1.ping; } });
var testXpWrite_1 = require("./modules/testXpWrite");
Object.defineProperty(exports, "testXpWrite", { enumerable: true, get: function () { return testXpWrite_1.testXpWrite; } });
var testAthleteXp_1 = require("./modules/testAthleteXp");
Object.defineProperty(exports, "testAthleteXp", { enumerable: true, get: function () { return testAthleteXp_1.testAthleteXp; } });
/* =========================
   XP SYSTEM
========================= */
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
var testRecognitionQueue_1 = require("./modules/testRecognitionQueue");
Object.defineProperty(exports, "testRecognitionQueue", { enumerable: true, get: function () { return testRecognitionQueue_1.testRecognitionQueue; } });
var scheduledDecaySweep_1 = require("./modules/decay/scheduledDecaySweep");
Object.defineProperty(exports, "scheduledDecaySweep", { enumerable: true, get: function () { return scheduledDecaySweep_1.scheduledDecaySweep; } });
/* =========================
   PARENT PORTAL
========================= */
var sendTournamentPing_1 = require("./modules/parent/sendTournamentPing");
Object.defineProperty(exports, "sendTournamentPing", { enumerable: true, get: function () { return sendTournamentPing_1.sendTournamentPing; } });
var getMyAthlete_1 = require("./modules/parent/getMyAthlete");
Object.defineProperty(exports, "getMyAthlete", { enumerable: true, get: function () { return getMyAthlete_1.getMyAthlete; } });
var getParentInbox_1 = require("./modules/parent/getParentInbox");
Object.defineProperty(exports, "getParentInbox", { enumerable: true, get: function () { return getParentInbox_1.getParentInbox; } });
var markParentInboxRead_1 = require("./modules/parent/markParentInboxRead");
Object.defineProperty(exports, "markParentInboxRead", { enumerable: true, get: function () { return markParentInboxRead_1.markParentInboxRead; } });
var saveCoachNote_1 = require("./modules/parent/saveCoachNote");
Object.defineProperty(exports, "saveCoachNote", { enumerable: true, get: function () { return saveCoachNote_1.saveCoachNote; } });
var sendTestDayPings_1 = require("./modules/parent/sendTestDayPings");
Object.defineProperty(exports, "sendTestDayPings", { enumerable: true, get: function () { return sendTestDayPings_1.sendTestDayPings; } });
var linkParentToAthlete_1 = require("./modules/parent/linkParentToAthlete");
Object.defineProperty(exports, "linkParentToAthlete", { enumerable: true, get: function () { return linkParentToAthlete_1.linkParentToAthlete; } });
/*
  createParentSignal()
  is an internal helper.

  Do NOT export unless you intend
  to call it directly from Firebase.
*/
/* =========================
   ENGINE TESTING
========================= */
var testAthleteLoader_1 = require("./modules/testAthleteLoader");
Object.defineProperty(exports, "testAthleteLoader", { enumerable: true, get: function () { return testAthleteLoader_1.testAthleteLoader; } });
var testAthleteNormalizer_1 = require("./modules/testAthleteNormalizer");
Object.defineProperty(exports, "testAthleteNormalizer", { enumerable: true, get: function () { return testAthleteNormalizer_1.testAthleteNormalizer; } });
var testStripeEngine_1 = require("./modules/testStripeEngine");
Object.defineProperty(exports, "testStripeEngine", { enumerable: true, get: function () { return testStripeEngine_1.testStripeEngine; } });
var testTestingEngine_1 = require("./modules/testTestingEngine");
Object.defineProperty(exports, "testTestingEngine", { enumerable: true, get: function () { return testTestingEngine_1.testTestingEngine; } });
var testPromotionEngine_1 = require("./modules/testPromotionEngine");
Object.defineProperty(exports, "testPromotionEngine", { enumerable: true, get: function () { return testPromotionEngine_1.testPromotionEngine; } });
var testCertificatePayloadEngine_1 = require("./modules/testCertificatePayloadEngine");
Object.defineProperty(exports, "testCertificatePayloadEngine", { enumerable: true, get: function () { return testCertificatePayloadEngine_1.testCertificatePayloadEngine; } });
var testProgressionEngine_1 = require("./modules/testProgressionEngine");
Object.defineProperty(exports, "testProgressionEngine", { enumerable: true, get: function () { return testProgressionEngine_1.testProgressionEngine; } });
var coachAction_1 = require("./modules/coachAction");
Object.defineProperty(exports, "coachAction", { enumerable: true, get: function () { return coachAction_1.coachAction; } });
/* =========================
 ATHLETE
========================= */
var getAthleteProfileFeed_1 = require("./modules/athlete/getAthleteProfileFeed");
Object.defineProperty(exports, "getAthleteProfileFeed", { enumerable: true, get: function () { return getAthleteProfileFeed_1.getAthleteProfileFeed; } });
/* =========================
   ARENA
========================= */
var logArenaHttp_1 = require("./modules/logArenaHttp");
Object.defineProperty(exports, "logArenaHttp", { enumerable: true, get: function () { return logArenaHttp_1.logArenaHttp; } });
/* =========================
   INTAKE
========================= */
var approveIntakeCall_1 = require("./modules/approveIntakeCall");
Object.defineProperty(exports, "approveIntakeCall", { enumerable: true, get: function () { return approveIntakeCall_1.approveIntakeCall; } });
var createAthleteFromIntakeCall_1 = require("./modules/createAthleteFromIntakeCall");
Object.defineProperty(exports, "createAthleteFromIntakeCall", { enumerable: true, get: function () { return createAthleteFromIntakeCall_1.createAthleteFromIntakeCall; } });
var approveAndActivate_1 = require("./approveAndActivate");
Object.defineProperty(exports, "approveAndActivate", { enumerable: true, get: function () { return approveAndActivate_1.approveAndActivate; } });
var createCoachAthleteCall_1 = require("./modules/createCoachAthleteCall");
Object.defineProperty(exports, "createCoachAthleteCall", { enumerable: true, get: function () { return createCoachAthleteCall_1.createCoachAthleteCall; } });
var addDisciplineCoachCall_1 = require("./modules/addDisciplineCoachCall");
Object.defineProperty(exports, "addDisciplineCoachCall", { enumerable: true, get: function () { return addDisciplineCoachCall_1.addDisciplineCoachCall; } });
/* =========================
   ONBOARDING
========================= */
var consumeOnboardingToken_1 = require("./modules/consumeOnboardingToken");
Object.defineProperty(exports, "consumeOnboardingToken", { enumerable: true, get: function () { return consumeOnboardingToken_1.consumeOnboardingToken; } });
var onboardingConfirmStep1_1 = require("./onboardingConfirmStep1");
Object.defineProperty(exports, "onboardingConfirmStep1", { enumerable: true, get: function () { return onboardingConfirmStep1_1.onboardingConfirmStep1; } });
/* =========================
   COMMUNICATIONS
========================= */
var forms_1 = require("./handlers/forms");
Object.defineProperty(exports, "submitContact", { enumerable: true, get: function () { return forms_1.submitContact; } });
Object.defineProperty(exports, "submitVolunteer", { enumerable: true, get: function () { return forms_1.submitVolunteer; } });
var sendGatekeeperEmail_1 = require("./modules/gatekeeper/sendGatekeeperEmail");
Object.defineProperty(exports, "sendGatekeeperEmail", { enumerable: true, get: function () { return sendGatekeeperEmail_1.sendGatekeeperEmail; } });
var retestAthlete_1 = require("./modules/retestAthlete");
Object.defineProperty(exports, "retestAthlete", { enumerable: true, get: function () { return retestAthlete_1.retestAthlete; } });
/* =========================
   BILLING
========================= */
var checkoutCall_1 = require("./billing/checkoutCall");
Object.defineProperty(exports, "createBillingCheckoutCall", { enumerable: true, get: function () { return checkoutCall_1.createBillingCheckoutCall; } });
var webhook_1 = require("./billing/webhook");
Object.defineProperty(exports, "stripeBillingWebhook", { enumerable: true, get: function () { return webhook_1.stripeBillingWebhook; } });
/* =========================
   PROPOSALS
========================= */
var createProposalDraft_1 = require("./proposals/createProposalDraft");
Object.defineProperty(exports, "createProposalDraft", { enumerable: true, get: function () { return createProposalDraft_1.createProposalDraft; } });
var updateProposalDraft_1 = require("./proposals/updateProposalDraft");
Object.defineProperty(exports, "updateProposalDraft", { enumerable: true, get: function () { return updateProposalDraft_1.updateProposalDraft; } });
var submitProposalForReview_1 = require("./proposals/submitProposalForReview");
Object.defineProperty(exports, "submitProposalForReview", { enumerable: true, get: function () { return submitProposalForReview_1.submitProposalForReview; } });
var approveProposal_1 = require("./proposals/approveProposal");
Object.defineProperty(exports, "approveProposal", { enumerable: true, get: function () { return approveProposal_1.approveProposal; } });
var lockProposal_1 = require("./proposals/lockProposal");
Object.defineProperty(exports, "lockProposal", { enumerable: true, get: function () { return lockProposal_1.lockProposal; } });
var createProposalCheckout_1 = require("./proposals/createProposalCheckout");
Object.defineProperty(exports, "createProposalCheckout", { enumerable: true, get: function () { return createProposalCheckout_1.createProposalCheckout; } });
