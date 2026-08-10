import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

function computeStartingStripeCount(xp: number, xpCap: number): number {
  const safeXp = Math.max(0, Number(xp || 0));
  const safeCap = Math.max(1, Number(xpCap || 0));

  const stripeUnit = safeCap / 4;
  const raw = Math.floor(safeXp / stripeUnit);

  return Math.max(0, Math.min(4, raw));
}

function pad4(n: number) {
  return String(n).padStart(4, "0");
}
function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

const SYSTEM_PING_EVENTS = {
  PLACEMENT_ASSIGNED: "placement_assigned",
  ATHLETE_MINTED: "athlete_minted",

  TESTING_ELIGIBLE: "testing_eligible",
  TEST_SCHEDULED: "test_scheduled",
  TEST_PASSED: "test_passed",
  TEST_FAILED: "test_failed",

  STRENGTH_UNLOCKED: "strength_unlocked",
  HONOR_UNLOCKED: "honor_unlocked",
  STRIPE_EARNED: "stripe_earned",
  PROMOTION_EARNED: "promotion_earned",

  CEREMONY_SCHEDULED: "ceremony_scheduled",
  SCHEDULE_CHANGED: "schedule_changed",
} as const;

function getStartingRankColor(
  framework: string,
  programTrack: string,
  discipline: string
): string {
  const fw = String(framework || "").trim().toLowerCase();
  const journey = String(programTrack || "").trim().toLowerCase();
  const art = String(discipline || "").trim().toLowerCase();

  if (fw === "foundry8") {
    return "white";
  }

  if (journey === "quest2mastery") {
    return "gray";
  }

  if (journey === "path2legend") {
    if (art === "wrestling" || art === "submission-grappling") {
      return "white";
    }

    if (art === "boxing" || art === "kickboxing") {
      return "gray";
    }
  }

  return "gray";
}

function resolveRequestedDiscipline(
  art: unknown,
  lane: unknown
): string {
  const fromArt =
    String(art || "")
      .trim()
      .toLowerCase();

  if (fromArt) return fromArt;

  const fromLane =
    String(lane || "")
      .trim()
      .toLowerCase();

  if (fromLane) return fromLane;

  return "";
}

function buildDisciplineRecord({
  discipline,
  framework,
  programTrack,
  trackCode,
  ladderKey,
  rosterIds,
  coachIds,
  locationId,
  placement,
  tier,
  rankName,
  rankColor,
  xpCap,
  now
}: {
  discipline: string;
  framework: string;
  programTrack: string;
  trackCode: string;
  ladderKey: string;
  rosterIds: string[];
  coachIds: string[];
  locationId: string | null;
  placement: Record<string, unknown> | null;
  tier: string;
  rankName: string;
  rankColor: string;
  xpCap: number;
  now: FirebaseFirestore.FieldValue;
}) {
  return {
    discipline,
    primaryDiscipline: discipline,
    sport: discipline,
    art: discipline,

    framework,
    journey: programTrack,
    program: programTrack,
    programTrack,
    track: programTrack,
    trackCode,
    ladderKey,

    rosterIds,
    coachIds,
    locationId,
    placement,

    tier,
    rankName,
    rankColor,
    xp: 0,
    xpCap,
    stripeCount: 0,

    testing: {
      state: "ACTIVE",
      coachReady: false,
      coachReadyAt: null,
      testingStartedAt: null,
      cooldownUntil: null,
      freezeUntil: null,
      lastTestResult: null,
      templeEnteredAt: null,
      testEligibleAt: null
    },

    createdAt: now,
    updatedAt: now
  };
}

function programLabel(programTrack: string, art: string) {

  if (programTrack === "zero2hero") {
    return art === "kickboxing"
      ? "Zero2Hero Muay Thai"
      : "Zero2Hero Wrestling";
  }

  if (programTrack === "path2legend") {
    return art === "boxing"
      ? "Path2Legend Boxing"
      : "Path2Legend Wrestling";
  }

  if (programTrack === "quest2mastery") {
    return "Quest2Mastery MMA";
  }

  if (programTrack === "road2greatness") {
    return "Road2Greatness";
  }

  return `${programTrack} ${art}`.trim();
}

type ApproveActivateInput = {
  intakeId: string;
  foundry: "f4" | "f8" | string;
  virtueName: string;
  virtueCode: string;
  trackCode: string;
  fullName?: string;
  publicName?: string;
  parent?: {
    email?: string | null;
    phoneDigits?: string | null;
    name?: string | null;
  };
  team?: {
    name?: string | null;
    teamId?: string | null;
    city?: string | null;
    state?: string | null;
  };
  mint?: {
    lane?: string | null;
  };
  experience?: {
    years?: number | null;
  };
  adjustment?: {
    amount?: number | null;
    note?: string | null;
    kind?: string | null;
    source?: string | null;
  };
};

type ExperiencePlan = {
  yearsVerified: number;
  total: number;
  issuedNow: number;
  hold: boolean;
  schedule: string | null;
  note: string | null;
};

function buildExperiencePlan(yearsRaw: unknown): ExperiencePlan {
  const years = Number(yearsRaw || 0);

  if (years === 1) {
    return {
      yearsVerified: 1,
      total: 200,
      issuedNow: 200,
      hold: false,
      schedule: "full_t0",
      note: "External legacy — 1 year of prior experience verified and honored",
    };
  }

  if (years === 2) {
    return {
      yearsVerified: 2,
      total: 400,
      issuedNow: 200,
      hold: true,
      schedule: "deferred_t1_entry",
      note: "External legacy — 2 years of prior experience verified and honored",
    };
  }

  if (years >= 3) {
    return {
      yearsVerified: 3,
      total: 600,
      issuedNow: 300,
      hold: true,
      schedule: "deferred_t1_entry",
      note: "External legacy — 3 years of prior experience verified and honored",
    };
  }

  return {
    yearsVerified: 0,
    total: 0,
    issuedNow: 0,
    hold: false,
    schedule: null,
    note: null,
  };
}

export const approveAndActivate = onCall(async (req) => {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required");
  }

  const coachUid = req.auth.uid;

  try {
    const input = req.data as ApproveActivateInput;

    const mode =
  String((input as any).mode || "new_athlete").trim();

const existingAthleteUid =
  String((input as any).existingAthleteUid || "").trim();

const forTrack =
  String((input as any).forTrack || "").trim();

const forLane =
  String((input as any).forLane || "").trim();

    if (
      !input?.intakeId ||
      !input?.foundry ||
      !input?.virtueName ||
      !input?.virtueCode ||
      !input?.trackCode
    ) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

const {
  intakeId,
  foundry: foundryRaw,
  virtueName,
  virtueCode,
  trackCode,
  fullName,
  publicName,
  parent,
  team,
  mint,
  experience,
  adjustment,

  framework,
  programTrack,
  art,
  ladderKey,
  rosterIds,
  coachIds,
  locationId,
  placement,
  priorExperienceValidation,
} = input as any;

    const foundry = String(foundryRaw || "").trim().toLowerCase();
const safeFramework =
  String(framework || "").trim() ||
  (foundry === "f4" ? "foundry4" : "foundry8");

const safeProgramTrack =
  String(programTrack || "").trim() ||
  (foundry === "f8" ? "zero2hero" : "path2legend");

const safeArt =
  String(art || "").trim() ||
  (foundry === "f8" ? "wrestling" : "wrestling");

const safeLadderKey =
  String(ladderKey || "").trim() ||
  (foundry === "f8" ? "F8" : "F4");

const safeRosterIds = Array.isArray(rosterIds) ? rosterIds : [];
const safeCoachIds = Array.isArray(coachIds) ? coachIds : [];

const safeLocationId =
  String(locationId || "").trim() || null;

const safePlacement =
  placement && typeof placement === "object" ? placement : null;

const safePriorExperienceValidation =
  priorExperienceValidation && typeof priorExperienceValidation === "object"
    ? priorExperienceValidation
    : null;

    if (foundry !== "f4" && foundry !== "f8") {
      throw new HttpsError("invalid-argument", `Invalid foundry: ${foundryRaw}`);
    }


    const lane = String(mint?.lane || "CB").trim().toUpperCase() || "CB";
    const expPlan = buildExperiencePlan(experience?.years);

    const adjustmentAmount = Number(adjustment?.amount || 0);
    const adjustmentNote =
      adjustmentAmount > 0
        ? String(adjustment?.note || "Coach adjustment")
        : null;

    const hasLegacy = expPlan.total > 0;
    const hasAdjustment = adjustmentAmount > 0;



    if (mode === "add_sport") {
      if (!existingAthleteUid) {
        throw new HttpsError(
          "invalid-argument",
          "Missing existingAthleteUid."
        );
      }

      if (!forTrack || !forLane) {
        throw new HttpsError(
          "invalid-argument",
          "Add-sport request requires forTrack and forLane."
        );
      }

      const existingRef =
        db.doc(`athletes/${existingAthleteUid}`);

      const existingSnap =
        await existingRef.get();

      if (!existingSnap.exists) {
        throw new HttpsError(
          "not-found",
          `Athlete not found: ${existingAthleteUid}`
        );
      }

      const existingAthlete =
        existingSnap.data() || {};

      const requestedDiscipline =
        resolveRequestedDiscipline(
          safeArt,
          forLane
        );

      if (!requestedDiscipline) {
        throw new HttpsError(
          "invalid-argument",
          "Unable to determine requested discipline."
        );
      }

      const existingDisciplines =
        existingAthlete.disciplines &&
        typeof existingAthlete.disciplines === "object"
          ? existingAthlete.disciplines
          : {};

      const legacyDiscipline =
        String(
          existingAthlete.primaryDiscipline ||
          existingAthlete.discipline ||
          existingAthlete.art ||
          existingAthlete.sport ||
          ""
        )
          .trim()
          .toLowerCase();

      const legacyTrackCode =
        String(existingAthlete.trackCode || "")
          .trim()
          .toLowerCase();

      const alreadyHasNestedDiscipline =
        Object.prototype.hasOwnProperty.call(
          existingDisciplines,
          requestedDiscipline
        );

      const alreadyHasLegacyDiscipline =
        legacyDiscipline === requestedDiscipline ||
        legacyTrackCode.endsWith(`-${requestedDiscipline}`);

      if (
        alreadyHasNestedDiscipline ||
        alreadyHasLegacyDiscipline
      ) {
        throw new HttpsError(
          "already-exists",
          `${existingAthleteUid} already has ${requestedDiscipline}.`
        );
      }

      const addSportIntakeRef =
        db.doc(`intakes/${intakeId}`);

      const addSportResult =
        await db.runTransaction(async (tx) => {
          const athleteSnap =
            await tx.get(existingRef);

          const intakeSnap =
            await tx.get(addSportIntakeRef);

          if (!athleteSnap.exists) {
            throw new HttpsError(
              "not-found",
              `Athlete not found: ${existingAthleteUid}`
            );
          }

          if (!intakeSnap.exists) {
            throw new HttpsError(
              "failed-precondition",
              `Submission doc missing: ${addSportIntakeRef.path}`
            );
          }

          const athleteData =
            athleteSnap.data() || {};

          const intakeData =
            intakeSnap.data() || {};

          const existingStatus =
            String(intakeData.status || "")
              .trim()
              .toLowerCase();

          const approvedUid =
            String(intakeData.approvedUid || "")
              .trim();

          if (
            existingStatus === "approved" &&
            approvedUid === existingAthleteUid
          ) {
            return {
              uid: existingAthleteUid,
              discipline: requestedDiscipline,
              mintVirtueTag:
                String(
                  athleteData.mintVirtueTag ||
                  athleteData.mintVirtueTagDisplay ||
                  ""
                ).trim(),
              idempotent: true
            };
          }

          if (
            existingStatus &&
            existingStatus !== "submitted"
          ) {
            throw new HttpsError(
              "failed-precondition",
              `Submission not approvable: ${existingStatus}`
            );
          }

          const currentDisciplines =
            athleteData.disciplines &&
            typeof athleteData.disciplines === "object"
              ? athleteData.disciplines
              : {};

          if (
            Object.prototype.hasOwnProperty.call(
              currentDisciplines,
              requestedDiscipline
            )
          ) {
            throw new HttpsError(
              "already-exists",
              `${existingAthleteUid} already has ${requestedDiscipline}.`
            );
          }

          const now =
            FieldValue.serverTimestamp();

          const starter =
            foundry === "f8"
              ? {
                  tier: "T0",
                  rankName: "Shadow",
                  rankColor:
                    getStartingRankColor(
                      safeFramework,
                      safeProgramTrack,
                      requestedDiscipline
                    ),
                  xpCap: 600
                }
              : {
                  tier: "T0",
                  rankName: "Apprentice",
                  rankColor:
                    getStartingRankColor(
                      safeFramework,
                      safeProgramTrack,
                      requestedDiscipline
                    ),
                  xpCap: 1000
                };

          const disciplinePath =
            `disciplines.${requestedDiscipline}`;

          const disciplineRecord =
            buildDisciplineRecord({
              discipline:
                requestedDiscipline,
              framework:
                safeFramework,
              programTrack:
                safeProgramTrack,
              trackCode,
              ladderKey:
                safeLadderKey,
              rosterIds:
                safeRosterIds,
              coachIds:
                safeCoachIds,
              locationId:
                safeLocationId,
              placement:
                safePlacement,
              tier:
                starter.tier,
              rankName:
                starter.rankName,
              rankColor:
                starter.rankColor,
              xpCap:
                starter.xpCap,
              now
            });

          const athletePatch: Record<string, any> = {
            [disciplinePath]: disciplineRecord,

            disciplineIds:
              FieldValue.arrayUnion(
                requestedDiscipline
              ),

            rosterIds:
              FieldValue.arrayUnion(
                ...(safeRosterIds || [])
              ),

            updatedAt: now
          };

          if (!athleteData.activeDiscipline) {
            athletePatch.activeDiscipline =
              requestedDiscipline;
          }

          tx.update(
            existingRef,
            athletePatch
          );

          tx.update(
            addSportIntakeRef,
            {
              status: "approved",
              used: true,
              approved: true,
              approvedUid:
                existingAthleteUid,
              approvedAt: now,

              minted: false,
              attachedSport: true,
              mode: "add_sport",

              existingAthleteUid,
              requestedDiscipline,

              forTrack,
              forLane,

              framework: safeFramework,
              programTrack:
                safeProgramTrack,
              track:
                safeProgramTrack,
              trackCode,
              art: safeArt,
              ladderKey:
                safeLadderKey,
              rosterIds:
                safeRosterIds,
              coachIds:
                safeCoachIds,
              locationId:
                safeLocationId,
              placement:
                safePlacement,

              updatedAt: now
            }
          );

          const receiptRef =
            db.collection("receipts").doc();

          tx.create(
            receiptRef,
            {
              type:
                "ATHLETE_DISCIPLINE_ADDED",

              mode: "add_sport",
              intakeId,
              uid:
                existingAthleteUid,

              discipline:
                requestedDiscipline,

              framework:
                safeFramework,
              programTrack:
                safeProgramTrack,
              track:
                safeProgramTrack,
              trackCode,
              art: safeArt,
              ladderKey:
                safeLadderKey,
              rosterIds:
                safeRosterIds,
              coachIds:
                safeCoachIds,
              locationId:
                safeLocationId,

              tier:
                starter.tier,
              rankName:
                starter.rankName,
              xp: 0,
              xpCap:
                starter.xpCap,
              stripeCount: 0,

              coachUid,
              createdAt: now
            }
          );

          return {
            uid:
              existingAthleteUid,

            discipline:
              requestedDiscipline,

            mintVirtueTag:
              String(
                athleteData.mintVirtueTag ||
                athleteData.mintVirtueTagDisplay ||
                ""
              ).trim(),

            receiptId:
              receiptRef.id,

            idempotent: false
          };
        });

      console.log(
        "[approveAndActivate] discipline attached",
        addSportResult
      );

      return {
        ok: true,
        mode: "add_sport",
        addedDiscipline:
          addSportResult.discipline,
        ...addSportResult
      };
    }

    const counterRef = db.doc(`counters/${foundry}`);
    const intakeRef = db.doc(`intakes/${intakeId}`);

    const intakeSnapPre = await intakeRef.get();
    if (!intakeSnapPre.exists) {
      throw new HttpsError(
        "failed-precondition",
        `Submission doc missing: ${intakeRef.path}`
      );
    }

    const intakeDataPre = intakeSnapPre.data() || {};
    const parentEmailPre =
      String(parent?.email || intakeDataPre.parent?.email || "")
        .trim()
        .toLowerCase() || null;

    let parentUid: string | null = null;

    if (parentEmailPre) {
      try {
        const userRecord = await admin.auth().getUserByEmail(parentEmailPre);
        parentUid = userRecord.uid;
      } catch {
        parentUid = null;
      }
    }

    const result = await db.runTransaction(async (tx) => {
      const intakeSnap = await tx.get(intakeRef);
      if (!intakeSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          `Submission doc missing: ${intakeRef.path}`
        );
      }

      const intakeData = intakeSnap.data() || {};
      const loc = (intakeData.location || {}) as any;

      const teamName =
        String(team?.name || "").trim() ||
        String(loc.team || "").trim() ||
        null;

      const cityName =
        String(team?.city || "").trim() ||
        String(loc.city || "").trim() ||
        null;

      const stateCode =
        String(team?.state || loc.state || "")
          .trim()
          .toUpperCase()
          .slice(0, 2) || null;

      const teamId =
        String(team?.teamId || "").trim() ||
        String(loc.teamId || "").trim() ||
        null;

      const parentEmail =
        String(parent?.email || intakeData.parent?.email || "")
          .trim()
          .toLowerCase() || null;

      const parentPhoneDigits =
        String(parent?.phoneDigits || intakeData.parent?.phoneDigits || "").trim() || null;

      const parentName =
        String(parent?.name || intakeData.parent?.name || intakeData.waiver?.signatureName || "").trim() || null;

      const existingApprovedUid = String(intakeSnap.get("approvedUid") || "").trim();
      const existingStatus = String(intakeSnap.get("status") || "").trim().toLowerCase();

      if (existingStatus === "approved" && existingApprovedUid) {
        const existingMintTag = String(
          intakeSnap.get("mintVirtueTagSerial") || intakeSnap.get("mintVirtueTag") || ""
        ).trim();

        if (existingMintTag) {
          return { uid: existingApprovedUid, mintVirtueTag: existingMintTag, idempotent: true };
        }

        const existingAthleteSnap = await tx.get(db.doc(`athletes/${existingApprovedUid}`));
        const athleteMintTag = existingAthleteSnap.exists
          ? String(existingAthleteSnap.get("mintVirtueTag") || "").trim()
          : "";

        return { uid: existingApprovedUid, mintVirtueTag: athleteMintTag || "", idempotent: true };
      }

      const exp = intakeSnap.get("exp");
      if (typeof exp === "number" && exp < Date.now()) {
        throw new HttpsError("failed-precondition", "Submission expired");
      }

      if (existingStatus && existingStatus !== "submitted") {
        throw new HttpsError("failed-precondition", `Submission not approvable: ${existingStatus}`);
      }

      const counterSnap = await tx.get(counterRef);
      if (!counterSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          `Counter doc missing: ${counterRef.path}`
        );
      }

      const next = counterSnap.get("next");
      if (typeof next !== "number" || !Number.isFinite(next) || next < 1) {
        throw new HttpsError(
          "failed-precondition",
          `Invalid counter.next in ${counterRef.path} (must be a number)`
        );
      }

      const n = next;
      const prefix = foundry.toUpperCase();
      const uid = `${prefix}_${pad4(n)}`;

      const vName = String(virtueName || "").trim().toUpperCase();
      const vCode = String(virtueCode || "").trim().toUpperCase();

      const mintVirtueTag = `${prefix}_CB${pad4(n)}_${vName}`;

      const athleteRef = db.doc(`athletes/${uid}`);
      const athleteSnap = await tx.get(athleteRef);
      if (athleteSnap.exists) {
        throw new HttpsError("already-exists", `Athlete already exists: ${uid}`);
      }

      const now = FieldValue.serverTimestamp();

      tx.update(counterRef, { next: n + 1 });

const starter =
  foundry === "f4"
    ? {
        tier: "T0",
        rankName: "Apprentice",
        rankColor: "white",
        xpCap: 1000
      }
    : {
        tier: "T0",
        rankName: "Shadow",
        rankColor: "white",
        xpCap: 600
      };
      const startingXp = expPlan.issuedNow + adjustmentAmount;
      const stripeCount = computeStartingStripeCount(startingXp, starter.xpCap);
      const emergencyName =
  String(intakeData.emergency?.name || "").trim() || null;

const emergencyPhoneDigits =
  String(intakeData.emergency?.phoneDigits || "").trim() || null;

const medical =
  String(intakeData.medical || "").trim() || "None";

      tx.create(athleteRef, {
        uid,
        uidCode: uid,
        coachUid,
        foundry,

framework: safeFramework,
programTrack: safeProgramTrack,
art: safeArt,
ladderKey: safeLadderKey,
rosterIds: safeRosterIds,
coachIds: safeCoachIds,
locationId: safeLocationId,
placement: safePlacement,
priorExperienceValidation: safePriorExperienceValidation,

        tier: starter.tier,
        rankName: starter.rankName,
        rankColor: starter.rankColor,
        xpCap: starter.xpCap,

        track: safeProgramTrack,
        trackCode,

        onboarding: {
          version: "v1",
          status: "new",
          step: 1,
          locks: {}
        },

        team: teamName,
        teamId,
        city: cityName,
        state: stateCode,

        parentUid,
        parentEmail,
        parentPhoneDigits,
        parentName,

        virtue: vName,
        virtueName: vName,
        virtueCode: vCode,

        mintVirtueTag,
        mintVirtueTagDisplay: mintVirtueTag,

        xp: startingXp,
        stripeCount,
        xpSource:
          hasLegacy && hasAdjustment
            ? "intake+legacy+adjustment"
            : hasLegacy
            ? "intake+legacy"
            : hasAdjustment
            ? "intake+adjustment"
            : "intake",

        adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
        adjustmentNote,

        legacy: hasLegacy,
        legacyType: hasLegacy ? "external" : null,
        legacyYearsVerified: expPlan.yearsVerified,
        legacyCreditTotal: expPlan.total,
        legacyCreditIssued: expPlan.issuedNow,
        legacyHold: expPlan.hold,
        legacyCreditSchedule: expPlan.schedule,
        legacyNote: expPlan.note,

        promotionLocked: false,

        testing: {
          state: "ACTIVE",
          coachReady: false,
          coachReadyAt: null,
          testingStartedAt: null,
          cooldownUntil: null,
          freezeUntil: null,
          lastTestResult: null,
          templeEnteredAt: null,
          testEligibleAt: null
        },

        unlocks: {
      combat: true,
      strength: false,
      honor: false,
      merit: false,
    },


        fullName: fullName ?? null,
        publicName: publicName ?? null,

        isCanonical: true,
        isDev: false,

        createdAt: now,
        updatedAt: now,
      });

      if (parentUid) {
        const parentLinkRef = db.doc(`parentAthleteLinks/${parentUid}_${uid}`);
        tx.set(parentLinkRef, {
          parentUid,
          athleteUid: uid,
          status: "active",
          parentEmail,
          createdAt: now,
          updatedAt: now,
        });

        const parentRef = db.doc(`parents/${parentUid}`);
        tx.set(
          parentRef,
          {
            uid: parentUid,
            email: parentEmail,
            athleteUid: uid,
            primaryAthleteUid: uid,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.update(intakeRef, {
        status: "approved",
        used: true,

        approved: true,
        approvedUid: uid,
        approvedAt: now,

        minted: true,


        forTrack: prefix,
        forLane: lane,

        framework: safeFramework,
programTrack: safeProgramTrack,
track: safeProgramTrack,
art: safeArt,
ladderKey: safeLadderKey,
rosterIds: safeRosterIds,
coachIds: safeCoachIds,
locationId: safeLocationId,
placement: safePlacement,
priorExperienceValidation: safePriorExperienceValidation,

        trackCode,
        virtueName: vName,
        virtueCode: vCode,

        mintVirtueTagSerial: mintVirtueTag,
        mintVirtueTag: mintVirtueTag,

        parentUid,
        parentEmail,
        parentPhoneDigits,
        parentName,

        emergency: {
  name: emergencyName,
  phoneDigits: emergencyPhoneDigits,
},

medical,
medicalNotes: medical,

safety: {
  emergencyContactName: emergencyName,
  emergencyPhoneDigits,
  medical,
  source: "intake",
  updatedAt: now,
},

        legacy: hasLegacy,
        legacyType: hasLegacy ? "external" : null,
        legacyYearsVerified: expPlan.yearsVerified,
        legacyCreditTotal: expPlan.total,
        legacyCreditIssued: expPlan.issuedNow,
        legacyHold: expPlan.hold,
        legacyCreditSchedule: expPlan.schedule,
        legacyNote: expPlan.note,

        adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
        adjustmentNote,

        updatedAt: now,
      });

      const receiptRef = db.collection("receipts").doc();
      tx.create(receiptRef, {
        type: "MINT_ACTIVATE",
        foundry: prefix,
        counterDoc: counterRef.path,
        allocatedNumber: n,
        uid,
        mintVirtueTag,
        virtue: vName,
        virtueCode: vCode,
        trackCode,
        framework: safeFramework,
programTrack: safeProgramTrack,
track: safeProgramTrack,
art: safeArt,
ladderKey: safeLadderKey,
rosterIds: safeRosterIds,
coachIds: safeCoachIds,
locationId: safeLocationId,
        intakeId,
        lane,
        legacyYearsVerified: expPlan.yearsVerified,
        legacyCreditTotal: expPlan.total,
        legacyCreditIssued: expPlan.issuedNow,
        adjustmentAmount: hasAdjustment ? adjustmentAmount : 0,
        adjustmentNote,
        stripeCount,
        parentUid,
        parentEmail,
        createdAt: now,
      });

return {
  uid,
  mintVirtueTag,
  allocatedNumber: n,
  receiptId: receiptRef.id,
  parentUid,
  parentEmail,
  parentName,
  athleteName: fullName ?? publicName ?? uid,
  programTrack: safeProgramTrack,
  art: safeArt,
  rankName: starter.rankName,
  tier: starter.tier,
  legacyCreditIssued: expPlan.issuedNow,
  idempotent: false,
};

    });

if (
  !result.idempotent &&
  (
    result.parentEmail ||
    result.parentUid
  )
) {
  const linkKey =
    String(
      result.parentUid ||
      result.parentEmail
    )
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_@.-]/g, "_");

  const linkId =
    `${linkKey}_${result.uid}`;

  await db
    .collection("parentAthleteLinks")
    .doc(linkId)
    .set(
      {
        athleteUid: result.uid,
        athleteName:
          result.athleteName || result.uid,

        parentUid:
          result.parentUid || null,

        parentEmail:
          result.parentEmail || null,

        parentName:
          result.parentName || null,

        role: "parent",
        status:
          result.parentUid ? "active" : "pending",

        source: "approveAndActivate",
        intakeId,
        createdAt:
          FieldValue.serverTimestamp(),
        updatedAt:
          FieldValue.serverTimestamp(),


      },

      { merge: true }
    );
}

if (result.parentUid && !result.idempotent) {

  const label = programLabel(result.programTrack, result.art);
const body =
  `${result.athleteName} has been placed into ${label}.\n\n` +
  `Starting rank: ${result.tier} ${result.rankName}.`;

const threadRef = db.collection("paraParentInbox").doc();

await threadRef.set({
  academy: "lompoc",
  academyId: "lompoc",
  source: "system",
  category: "system",

  entryType: SYSTEM_PING_EVENTS.PLACEMENT_ASSIGNED,
  eventType: SYSTEM_PING_EVENTS.PLACEMENT_ASSIGNED,

  programTrack: result.programTrack,
  athleteUid: result.uid,

  lang: "en",
  stage: "placement",
  status: "active",

  subject: "Placement Assigned",
  parentName: result.parentName || "Family",
  parentEmail: result.parentEmail || "",
  athleteName: result.athleteName || "",

  lastBody: body,
  lastReplyAt: FieldValue.serverTimestamp(),

  coachHasUnread: false,
  parentHasUnread: true,
  seenByCoach: true,
  seenByParent: false,

  systemGenerated: true,
  createdAt: FieldValue.serverTimestamp(),
});

await threadRef.collection("thread").add({
  from: "system",
  fromName: "Sandman System",
  body,
  createdAt: FieldValue.serverTimestamp(),
  seenByCoach: true,
  seenByParent: false,
});
}

return { ok: true, ...result };

  } catch (err: any) {
    console.error("approveAndActivate crash:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err?.message || String(err));
  }
});