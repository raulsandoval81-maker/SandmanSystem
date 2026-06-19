import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  getFirestore
} from "firebase-admin/firestore";

const ACHIEVEMENT_TYPES = new Set([
  "XP_MILESTONE",
  "TESTING_ELIGIBLE",
  "TEST_SCHEDULED",
  "TEST_STARTED",
  "TEST_PASSED",
  "PROMOTED",
  "COACH_NOTE",
]);

function toISO(value: any): string | null {
  try {
    return (
      value?.toDate?.().toISOString?.() ||
      null
    );
  } catch {
    return null;
  }
}

function achievementLabel(type = ""): string {
  const labels: Record<string, string> = {
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

function activityLane(item: any): string {
  const kind =
    String(item?.kind || "")
      .toUpperCase();

  const lane =
    String(item?.meta?.lane || "")
      .toLowerCase();

  if (kind.includes("STRENGTH") || lane === "strength") {
    return "Strength";
  }

  if (kind.includes("HONOR") || lane === "honor") {
    return "Honor";
  }

  return "Combat";
}

function activityLabel(item: any): string {
  const kind =
    String(item?.kind || "")
      .toUpperCase();

  const lane =
    String(item?.meta?.lane || "")
      .toLowerCase();

  const amount =
    Number(item?.amount || 0);

  if (
    kind.includes("DAILY_GRIND") ||
    kind.includes("ATTENDANCE")
  ) {
    if (amount >= 15) return "Daily Grind — Double Shift";
    if (amount >= 10) return "Daily Grind — Full-Time Work";
    return "Daily Grind — Part-Time Work";
  }

  if (kind.includes("STRENGTH") || lane === "strength") {
    return "Strength Development";
  }

  if (kind.includes("HONOR") || lane === "honor") {
    return "Honor Development";
  }

  if (kind === "ARENA/BATTLE") {
    return "⚔️ Arena Battle";
  }

  if (kind === "ARENA/PODIUM") {
    return "🏅 Arena Podium";
  }

  if (kind === "ARENA/STYLEIQ") {
    return "🧠 Match IQ";
  }

  if (kind === "ARENA/FORFEIT_WIN") {
    return "🤝 Forfeit Win";
  }

  if (kind === "ARENA/NO_OPP_DAY") {
    return "💪 No Opp Day";
  }

  if (kind === "ARENA/SPORTSMANSHIP") {
    return "⚠️ Sportsmanship";
  }

  if (lane === "arena" || kind.includes("ARENA")) {
    return "Arena Work";
  }
  
  return (
    item?.note ||
    item?.kind ||
    "XP Earned"
  );
}

export const getAthleteProfileFeed = onCall(
  async (req) => {
    const db = getFirestore();

    const athleteId =
      String(req.data?.athleteId || req.data?.uid || "")
        .trim()
        .toUpperCase();

    if (!athleteId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing athleteId."
      );
    }

    const athleteSnap =
      await db
        .collection("athletes")
        .doc(athleteId)
        .get();

    if (!athleteSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Athlete not found."
      );
    }

    const athlete =
      athleteSnap.data() || {};

    const possibleIds =
      Array.from(
        new Set(
          [
            athleteId,
            athlete.uid,
            athlete.uidCode,
            athlete.id,
            athlete.dogTag,
            athlete.mintVirtueTag,
            athlete.mintVirtueTagDisplay,
          ]
            .filter(Boolean)
            .map((v) => String(v).trim().toUpperCase())
        )
      );

    const parentSnap =
      await db
        .collection("parentInbox")
        .where("athleteId", "==", athleteId)
        .limit(30)
        .get();

    const achievements =
      parentSnap.docs
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
        .filter((item) =>
          ACHIEVEMENT_TYPES.has(item.type)
        )
        .sort((a, b) =>
          String(b.createdAt || "")
            .localeCompare(String(a.createdAt || ""))
        )
        .slice(0, 5);

    const xpDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    const collectionsToCheck = [
      "xp_logs",
      "xpLogs",
    ];

    for (const coll of collectionsToCheck) {
      for (const id of possibleIds) {
        const snap =
          await db
            .collection(coll)
            .where("uid", "==", id)
            .limit(20)
            .get();

        xpDocs.push(...snap.docs);
      }
    }

    const seen =
      new Set<string>();

    const activity =
      xpDocs
        .filter((doc) => {
          if (seen.has(doc.id)) return false;
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
        .sort((a, b) =>
          String(b.createdAt || "")
            .localeCompare(String(a.createdAt || ""))
        )
        .slice(0, 5);

    return {
      ok: true,
      athleteId,
      possibleIds,
      achievements,
      activity,
    };
  }
);