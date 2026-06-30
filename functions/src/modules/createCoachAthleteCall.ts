import { onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function pad4(n: number) {
  return String(n).padStart(4, "0");
}

function cleanString(v: any) {
  return String(v || "").trim();
}

function buildExperiencePlan(yearsRaw: any) {
  const years = Number(yearsRaw || 0);

  if (years === 1) {
    return {
      yearsVerified: 1,
      total: 200,
      issuedNow: 200,
      held: 0,
      hold: false,
      schedule: "full_t0",
      note: "External legacy — 1 year of prior experience verified and honored.",
    };
  }

  if (years === 2) {
    return {
      yearsVerified: 2,
      total: 400,
      issuedNow: 200,
      held: 200,
      hold: true,
      schedule: "deferred_t1_entry",
      note: "External legacy — 2 years of prior experience verified and honored.",
    };
  }

  if (years >= 3) {
    return {
      yearsVerified: 3,
      total: 600,
      issuedNow: 300,
      held: 300,
      hold: true,
      schedule: "deferred_t1_entry",
      note: "External legacy — 3 years of prior experience verified and honored.",
    };
  }

  return {
    yearsVerified: 0,
    total: 0,
    issuedNow: 0,
    held: 0,
    hold: false,
    schedule: null,
    note: null,
  };
}

export const createCoachAthleteCall = onCall(async (req) => {
  if (!req.auth) throw new Error("unauthenticated");

  const db = getFirestore();

  const {
    first,
    last,
    track,
    program,
    team,
    grade,
    birthYear,
    source,
    notes,

    framework,
    programTrack,
    art,
    ladderKey,
    rosterIds,
    coachIds,
    locationId,

    virtueName,
    virtueCode,
    mintVirtueTag,

    experience,
    placement,

    adjustment,
  } = req.data || {};

  if (!first || !last || !track) {
    throw new Error("missing athlete fields");
  }

  const cleanTrack = cleanString(track).toUpperCase();

  if (!["F4", "F8"].includes(cleanTrack)) {
    throw new Error("invalid track");
  }

  const counterRef = db.collection("counters").doc(cleanTrack.toLowerCase());

  const athlete = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);

    const current = counterSnap.exists
      ? Number(counterSnap.get("next") || 1)
      : 1;

    const uid = `${cleanTrack}_${pad4(current)}`;
    const athleteRef = db.collection("athletes").doc(uid);

    const isF8 = cleanTrack === "F8";

    const xpAdjustment = Math.max(0, Number(adjustment?.amount || 0));

    const experienceYears = Number(experience?.years || 0);
    const expPlan = buildExperiencePlan(experienceYears);
    const hasLegacy = expPlan.total > 0;
    const totalXp = xpAdjustment + expPlan.issuedNow;

    const rankName = isF8 ? "Shadow" : "Apprentice";
    const trackCode =
      placement?.trackCode ||
      (isF8 ? "foundry8-combat" : "foundry4-combat");

    const athleteData = {
      uid,
      athleteId: uid,

      first: cleanString(first),
      last: cleanString(last),
      publicName: `${cleanString(first)[0]}. ${cleanString(last)}`,

      track: cleanTrack,
      program: program || "wrestling",
      tier: "T0",
      rank: rankName,
      rankName,
      rankColor: "white",

      stripeCount: 0,
      xp: totalXp,
      xpCap: isF8 ? 600 : 1000,
      xpSource: hasLegacy
        ? "intake+legacy"
        : xpAdjustment > 0
          ? "coach_direct_intake"
          : "coach_direct",

      isCanonical: true,
      isDev: false,
      promotionLocked: true,

      legacy: hasLegacy,
      legacyType: hasLegacy ? "external" : null,
      legacyYearsVerified: expPlan.yearsVerified,
      legacyCreditTotal: expPlan.total,
      legacyCreditIssued: expPlan.issuedNow,
      legacyHold: expPlan.hold,
      legacyCreditSchedule: expPlan.schedule,
      legacyNote: expPlan.note,

      testing: {
        state: "ACTIVE",
        coachReady: false,
        coachReadyAt: null,
        cooldownUntil: null,
        freezeUntil: null,
        lastTestResult: null,
        templeEnteredAt: null,
        testEligibleAt: null,
        testingStartedAt: null,
        tier: "T0",
        track: trackCode,
        trackCode,
      },

      team: team || "",
      grade: grade || "",
      birthYear: birthYear || "",

      source: source || "coach_direct",
      notes: notes || "",

      status: "active",
      createdBy: "coach",
      intakePath: "coach_direct",

      parentLinked: false,
      parentStatus: "unlinked",

      framework: framework || "",
      programTrack: programTrack || "",
      art: art || "",
      ladderKey: ladderKey || cleanTrack,
      rosterIds: Array.isArray(rosterIds) ? rosterIds : [],
      coachIds: Array.isArray(coachIds) ? coachIds : [],
      locationId: locationId || "lompoc",

      virtueName: virtueName || "",
      virtueCode: virtueCode || "",
      mintVirtueTag: mintVirtueTag || "",
      mintVirtueTagDisplay: mintVirtueTag || "",

      placement: placement || null,

      experience: experience || {
        years: 0,
        placementOnly: true,
        grantsXP: false,
        transferXP: false,
        source: "coach_direct",
      },

      adjustment: xpAdjustment > 0
        ? {
            amount: xpAdjustment,
            note: adjustment?.note || "Paper pilot / late onboarding XP",
            kind: adjustment?.kind || "PAPER_RECONCILE_GRIND",
            source: adjustment?.source || "coach_direct_intake",
            createdAt: FieldValue.serverTimestamp(),
          }
        : null,

      startingXp: xpAdjustment,
      startingXpReason: xpAdjustment > 0 ? "late_onboarding" : "",
      startingXpSource: xpAdjustment > 0 ? "coach_direct_intake" : "",

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(
      counterRef,
      {
        next: current + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(athleteRef, athleteData, { merge: true });

    if (xpAdjustment > 0) {
      const logRef = athleteRef.collection("logs").doc();

      tx.set(logRef, {
        athleteUid: uid,
        amount: xpAdjustment,
        kind: "PAPER_RECONCILE_GRIND",
        source: "coach_direct_intake",
        note: adjustment?.note || "Paper pilot / late onboarding XP",
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    if (expPlan.issuedNow > 0) {
      const legacyLogRef = athleteRef.collection("logs").doc();

      tx.set(legacyLogRef, {
        athleteUid: uid,
        amount: expPlan.issuedNow,
        kind: "LEGACY_CREDIT",
        source: "coach_direct_intake",
        note: expPlan.note,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return athleteData;
  });

  return {
    ok: true,
    athlete,
  };
});