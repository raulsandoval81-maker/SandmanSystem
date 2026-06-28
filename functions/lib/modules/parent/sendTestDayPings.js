"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestDayPings = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const createParentSignal_1 = require("./createParentSignal");
function todayPacific() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${d}`;
}
exports.sendTestDayPings = (0, scheduler_1.onSchedule)({
    schedule: "0 6 * * *",
    timeZone: "America/Los_Angeles",
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    const today = todayPacific();
    const snap = await db
        .collection("athletes")
        .where("testing.state", "==", "READY")
        .where("testing.scheduledDate", "==", today)
        .get();
    let sent = 0;
    for (const docSnap of snap.docs) {
        const athlete = docSnap.data() || {};
        const uid = docSnap.id;
        const sourceId = `TEST_DAY_${uid}_${today}`;
        const existing = await db
            .collection("parentInbox")
            .where("athleteId", "==", uid)
            .where("type", "==", createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_DAY)
            .where("sourceId", "==", sourceId)
            .limit(1)
            .get();
        if (!existing.empty) {
            continue;
        }
        await (0, createParentSignal_1.createParentSignal)({
            athleteId: uid,
            athleteName: athlete.publicName ||
                athlete.fullName ||
                uid,
            type: createParentSignal_1.PARENT_SIGNAL_TYPES.TEST_DAY,
            testingDate: today,
            source: "sendTestDayPings",
            sourceId,
        });
        sent += 1;
    }
    console.log(`[sendTestDayPings] sent=${sent} date=${today}`);
});
