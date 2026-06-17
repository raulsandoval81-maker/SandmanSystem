"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAthleteProfileFeed = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const ACHIEVEMENT_TYPES = new Set([
    "XP_MILESTONE",
    "TESTING_ELIGIBLE",
    "TEST_SCHEDULED",
    "TEST_STARTED",
    "TEST_PASSED",
    "PROMOTED",
    "COACH_NOTE",
]);
function toISO(value) {
    try {
        return (value?.toDate?.().toISOString?.() ||
            null);
    }
    catch {
        return null;
    }
}
function achievementLabel(type = "") {
    const labels = {
        XP_MILESTONE: "⭐ Stripe Earned",
        TESTING_ELIGIBLE: "🎯 Testing Eligible",
        TEST_SCHEDULED: "📋 Testing Scheduled",
        TEST_STARTED: "🟡 Testing Started",
        TEST_PASSED: "🏆 Testing Passed",
        PROMOTED: "⬆️ Promotion Earned",
        COACH_NOTE: "📝 Coach Note",
    };
    return labels[type] || "Achievement";
}
function activityLabel(item) {
    const kind = String(item?.kind || "")
        .toUpperCase();
    const lane = String(item?.meta?.lane || "")
        .toLowerCase();
    if (kind.includes("DAILY_GRIND")) {
        return "Combat XP · Daily Grind";
    }
    if (kind.includes("STRENGTH") || lane === "strength") {
        return "Strength XP";
    }
    if (kind.includes("HONOR") || lane === "honor") {
        return "Honor XP";
    }
    if (kind.includes("ATTENDANCE")) {
        return "Combat XP · Attendance";
    }
    if (lane === "arena") {
        return "Combat XP · Arena";
    }
    return (item?.note ||
        item?.kind ||
        "XP Earned");
}
exports.getAthleteProfileFeed = (0, https_1.onCall)(async (req) => {
    const db = (0, firestore_1.getFirestore)();
    const athleteId = String(req.data?.athleteId || req.data?.uid || "")
        .trim()
        .toUpperCase();
    if (!athleteId) {
        throw new https_1.HttpsError("invalid-argument", "Missing athleteId.");
    }
    const athleteSnap = await db
        .collection("athletes")
        .doc(athleteId)
        .get();
    if (!athleteSnap.exists) {
        throw new https_1.HttpsError("not-found", "Athlete not found.");
    }
    const athlete = athleteSnap.data() || {};
    const possibleIds = Array.from(new Set([
        athleteId,
        athlete.uid,
        athlete.uidCode,
        athlete.id,
        athlete.dogTag,
        athlete.mintVirtueTag,
        athlete.mintVirtueTagDisplay,
    ]
        .filter(Boolean)
        .map((v) => String(v).trim().toUpperCase())));
    const parentSnap = await db
        .collection("parentInbox")
        .where("athleteId", "==", athleteId)
        .limit(30)
        .get();
    const achievements = parentSnap.docs
        .map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            type: data.type || "",
            label: achievementLabel(data.type || ""),
            title: data.title || "",
            message: data.message || "",
            note: data.note || "",
            createdAt: toISO(data.createdAt),
        };
    })
        .filter((item) => ACHIEVEMENT_TYPES.has(item.type))
        .sort((a, b) => String(b.createdAt || "")
        .localeCompare(String(a.createdAt || "")))
        .slice(0, 5);
    const xpDocs = [];
    for (const id of possibleIds) {
        const snap = await db
            .collection("xp_logs")
            .where("uid", "==", id)
            .limit(20)
            .get();
        xpDocs.push(...snap.docs);
    }
    const seen = new Set();
    const activity = xpDocs
        .filter((doc) => {
        if (seen.has(doc.id))
            return false;
        seen.add(doc.id);
        return true;
    })
        .map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            kind: data.kind || "",
            amount: Number(data.amount || 0),
            note: data.note || "",
            label: activityLabel(data),
            lane: data.meta?.lane || "",
            createdAt: toISO(data.createdAt),
        };
    })
        .sort((a, b) => String(b.createdAt || "")
        .localeCompare(String(a.createdAt || "")))
        .slice(0, 5);
    const recentXpSnap = await db
        .collection("xp_logs")
        .limit(10)
        .get();
    const recentXpDebug = recentXpSnap.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            uid: data.uid || "",
            kind: data.kind || "",
            amount: Number(data.amount || 0),
            note: data.note || "",
            createdAt: toISO(data.createdAt),
        };
    });
    return {
        ok: true,
        athleteId,
        possibleIds,
        achievements,
        activity,
        recentXpDebug,
    };
});
