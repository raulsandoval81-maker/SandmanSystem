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
exports.sendInboxEmail = exports.postAnnouncement = exports.submitVolunteer = exports.logArenaHttp = exports.addCoachNote = exports.incrementAttendanceHttp = exports.incrementAttendance = exports.incrementXpHttp = exports.incrementXp = exports.approveIntake = exports.saveWaiverDev = exports.saveWaiver = exports.activateAthlete = exports.createAthlete = exports.submitIntakeDev = exports.submitIntake = exports.createInvite = exports.ping = void 0;
// -------------------------------------------------------
//  Firebase Admin Init
// -------------------------------------------------------
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
// -------------------------------------------------------
//  🔍 Health / System Ping
// -------------------------------------------------------
var ping_1 = require("./modules/ping");
Object.defineProperty(exports, "ping", { enumerable: true, get: function () { return ping_1.ping; } });
// -------------------------------------------------------
//  🧭 Invites
// -------------------------------------------------------
var createInvite_1 = require("./modules/intake/createInvite");
Object.defineProperty(exports, "createInvite", { enumerable: true, get: function () { return createInvite_1.createInvite; } });
// -------------------------------------------------------
//  📝 Intake (Parent Submissions)
// -------------------------------------------------------
var submitIntake_1 = require("./modules/intake/submitIntake");
Object.defineProperty(exports, "submitIntake", { enumerable: true, get: function () { return submitIntake_1.submitIntake; } });
var submitIntakeDev_1 = require("./modules/intake/submitIntakeDev");
Object.defineProperty(exports, "submitIntakeDev", { enumerable: true, get: function () { return submitIntakeDev_1.submitIntakeDev; } });
// -------------------------------------------------------
//  🧱 Athletes (Minting / Activation)
// -------------------------------------------------------
var createAthlete_1 = require("./modules/intake/createAthlete");
Object.defineProperty(exports, "createAthlete", { enumerable: true, get: function () { return createAthlete_1.createAthlete; } });
var activateAthlete_1 = require("./modules/intake/activateAthlete");
Object.defineProperty(exports, "activateAthlete", { enumerable: true, get: function () { return activateAthlete_1.activateAthlete; } });
// -------------------------------------------------------
//  📜 Waivers
// -------------------------------------------------------
var saveWaiver_1 = require("./modules/waiver/saveWaiver/saveWaiver");
Object.defineProperty(exports, "saveWaiver", { enumerable: true, get: function () { return saveWaiver_1.saveWaiver; } });
var saveWaiverDev_1 = require("./modules/waiver/saveWaiver/saveWaiverDev");
Object.defineProperty(exports, "saveWaiverDev", { enumerable: true, get: function () { return saveWaiverDev_1.saveWaiverDev; } });
// -------------------------------------------------------
//  ✅ Approvals
// -------------------------------------------------------
var approve_1 = require("./modules/intake/approve");
Object.defineProperty(exports, "approveIntake", { enumerable: true, get: function () { return approve_1.approveIntake; } });
// -------------------------------------------------------
//  ⚔️ XP Core
// -------------------------------------------------------
var incrementXp_1 = require("./modules/xp/incrementXp");
Object.defineProperty(exports, "incrementXp", { enumerable: true, get: function () { return incrementXp_1.incrementXp; } });
var incrementXpHttp_1 = require("./modules/xp/incrementXpHttp");
Object.defineProperty(exports, "incrementXpHttp", { enumerable: true, get: function () { return incrementXpHttp_1.incrementXpHttp; } });
// -------------------------------------------------------
//  🧱 Attendance
// -------------------------------------------------------
var incrementAttendance_1 = require("./incrementAttendance");
Object.defineProperty(exports, "incrementAttendance", { enumerable: true, get: function () { return incrementAttendance_1.incrementAttendance; } });
Object.defineProperty(exports, "incrementAttendanceHttp", { enumerable: true, get: function () { return incrementAttendance_1.incrementAttendanceHttp; } });
// -------------------------------------------------------
//  📝 Coach Notes
// -------------------------------------------------------
var addCoachNote_1 = require("./modules/notes/addCoachNote");
Object.defineProperty(exports, "addCoachNote", { enumerable: true, get: function () { return addCoachNote_1.addCoachNote; } });
// -------------------------------------------------------
//  🏟️ Arena / Weekend
// -------------------------------------------------------
var logArenaHttp_1 = require("./modules/arena/logArenaHttp");
Object.defineProperty(exports, "logArenaHttp", { enumerable: true, get: function () { return logArenaHttp_1.logArenaHttp; } });
var submitVolunteer_1 = require("./volunteers/submitVolunteer");
Object.defineProperty(exports, "submitVolunteer", { enumerable: true, get: function () { return submitVolunteer_1.submitVolunteer; } });
// -------------------------------------------------------
//  📢 Para-Comms — Coach → Parents
// -------------------------------------------------------
var postAnnouncement_1 = require("./paraComms/postAnnouncement");
Object.defineProperty(exports, "postAnnouncement", { enumerable: true, get: function () { return postAnnouncement_1.postAnnouncement; } });
// -------------------------------------------------------
//  ✉️ Para-Comms — Parent Inbox
// -------------------------------------------------------
var sendInboxEmail_1 = require("./paraComms/sendInboxEmail");
Object.defineProperty(exports, "sendInboxEmail", { enumerable: true, get: function () { return sendInboxEmail_1.sendInboxEmail; } });
// -------------------------------------------------------
//  📨 Para-Comms — Coach Replies (Future Stub)
// -------------------------------------------------------
//export { sendCoachReplyEmail } from "./paraComms/inboxReplyEmail";
