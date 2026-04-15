// -------------------------------------------------------
//  Firebase Admin Init
// -------------------------------------------------------
import * as admin from "firebase-admin";
if (!admin.apps.length) {
  admin.initializeApp();
}

// -------------------------------------------------------
//  🔍 Health / System Ping
// -------------------------------------------------------
export { ping } from "./modules/ping";

// -------------------------------------------------------
//  🧭 Invites
// -------------------------------------------------------
export { createInvite } from "./modules/intake/createInvite";

// -------------------------------------------------------
//  📝 Intake (Parent Submissions)
// -------------------------------------------------------
export { submitIntake } from "./modules/intake/submitIntake";
export { submitIntakeDev } from "./modules/intake/submitIntakeDev";

// -------------------------------------------------------
//  🧱 Athletes (Minting / Activation)
// -------------------------------------------------------
export { createAthlete } from "./modules/intake/createAthlete";
export { activateAthlete } from "./modules/intake/activateAthlete";

// -------------------------------------------------------
//  📜 Waivers
// -------------------------------------------------------
export { saveWaiver } from "./modules/waiver/saveWaiver/saveWaiver";
export { saveWaiverDev } from "./modules/waiver/saveWaiver/saveWaiverDev";

// -------------------------------------------------------
//  ✅ Approvals
// -------------------------------------------------------
export { approveIntake } from "./modules/intake/approve";

// -------------------------------------------------------
//  ⚔️ XP Core
// -------------------------------------------------------
export { incrementXp } from "./modules/xp/incrementXp";
export { incrementXpHttp } from "./modules/xp/incrementXpHttp";

// -------------------------------------------------------
//  🧱 Attendance
// -------------------------------------------------------
export {
  incrementAttendance,
  incrementAttendanceHttp
} from "./incrementAttendance";

// -------------------------------------------------------
//  📝 Coach Notes
// -------------------------------------------------------
export { addCoachNote } from "./modules/notes/addCoachNote";

// -------------------------------------------------------
//  🏟️ Arena / Weekend
// -------------------------------------------------------
export { logArenaHttp } from "./modules/arena/logArenaHttp";
export { submitVolunteer } from "./volunteers/submitVolunteer";

// -------------------------------------------------------
//  📢 Para-Comms — Coach → Parents
// -------------------------------------------------------
export { postAnnouncement } from "./paraComms/postAnnouncement";

// -------------------------------------------------------
//  ✉️ Para-Comms — Parent Inbox
// -------------------------------------------------------
export { sendInboxEmail } from "./paraComms/sendInboxEmail";

// -------------------------------------------------------
//  📨 Para-Comms — Coach Replies (Future Stub)
// -------------------------------------------------------
//export { sendCoachReplyEmail } from "./paraComms/inboxReplyEmail";
