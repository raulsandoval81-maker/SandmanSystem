import {
  onCall,
  HttpsError
} from "firebase-functions/v2/https";

import {
  FieldValue,
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";

import {
  MANAGEMENT_STAFF_ROLES,
  normalizeStaffRole,
  requireActiveStaff
} from "../services/staffAuthorization";

import {
  activeXpCap,
  awardReceiptKey,
  athleteTier,
  classifyAthlete,
  persistedStripeCount
} from "../services/authoritativeXpService";

import {
  lifetimeXpPatch,
  resolveAuthoritativeActiveRankXp,
  resolveLifetimeXpEffects,
  resolveManagementAdjustmentSemantic
} from "../policy/xpDomainPolicy";

import {
  buildLifetimeCombatDisciplineUpdate,
  resolveAuthoritativeLifetimeCombatDiscipline
} from "../policy/lifetimeCombatDisciplinePolicy";

import {
  resolveF8RemoteAccess
} from "../policy/f8StrengthHonorAccessPolicy";

import {
  resolveDisciplineXpAuthority
} from "./disciplineXpAuthority";

const db = getFirestore();

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeList(...values: unknown[]): string[] {
  const out: string[] = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = clean(item);

        if (text && !out.includes(text)) {
          out.push(text);
        }
      }

      continue;
    }

    const text = clean(value);

    if (text && !out.includes(text)) {
      out.push(text);
    }
  }

  return out;
}

function requireLocationAccess(
  staff: Record<string, any>,
  locationId: string
) {
  const role =
    normalizeStaffRole(staff.role);

  if (
    role === "admin" ||
    role === "system_admin"
  ) {
    return;
  }

  const locationIds =
    normalizeList(
      staff.locationIds,
      staff.locations,
      staff.locationId
    );

  if (
    !locationId ||
    !locationIds.includes(locationId)
  ) {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside your assigned location."
    );
  }
}

function monthKey(
  timestamp: Timestamp
): string {
  const date = timestamp.toDate();

  return (
    `${date.getUTCFullYear()}-` +
    `${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`
  );
}

type ExperienceRecognitionPlan = {
  total: number;
  issuedNow: number;
  hold: boolean;
  schedule: string | null;
};

function buildExperienceRecognitionPlan(
  priorExperience: Record<string, any>
): ExperienceRecognitionPlan {
  if (priorExperience.manual === true) {
    const manualXp =
      Number(
        priorExperience.manualXp ??
        priorExperience.recognitionXp ??
        0
      );

    if (
      !Number.isFinite(manualXp) ||
      manualXp < 0 ||
      !Number.isInteger(manualXp)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Coach manual experience recognition is invalid."
      );
    }

    return {
      total: manualXp,
      issuedNow: manualXp,
      hold: false,
      schedule: null
    };
  }

  const years =
    Number(
      priorExperience.verifiedYears ||
      0
    );

  if (years === 1) {
    return {
      total: 200,
      issuedNow: 200,
      hold: false,
      schedule: "full_t0"
    };
  }

  if (years === 2) {
    return {
      total: 400,
      issuedNow: 200,
      hold: true,
      schedule: "deferred_t1_entry"
    };
  }

  if (years >= 3) {
    return {
      total: 600,
      issuedNow: 300,
      hold: true,
      schedule: "deferred_t1_entry"
    };
  }

  return {
    total: 0,
    issuedNow: 0,
    hold: false,
    schedule: null
  };
}

function experienceRecognitionNote(
  priorExperience: Record<string, any>
): string {
  if (priorExperience.manual === true) {
    return (
      clean(priorExperience.note) ||
      "Coach-verified manual prior-experience recognition"
    );
  }

  const years =
    Number(
      priorExperience.verifiedYears || 0
    );

  if (years === 1) {
    return "External legacy — 1 year of prior experience verified and honored";
  }

  if (years === 2) {
    return "External legacy — 2 years of prior experience verified and honored";
  }

  if (years >= 3) {
    return "External legacy — 3+ years of prior experience verified and honored";
  }

  return "No prior-experience XP recognition";
}

export const finalizeExperienceValidation =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Management sign-in required."
      );
    }

    const actorUid =
      req.auth.uid;

    const staffContext =
      await requireActiveStaff(
        actorUid,
        MANAGEMENT_STAFF_ROLES,
        "Management access required."
      );

    const pinId =
      clean(req.data?.pinId);

    if (!pinId) {
      throw new HttpsError(
        "invalid-argument",
        "pinId is required."
      );
    }

    const decision =
      clean(req.data?.decision)
        .toLowerCase();

    if (
      !["approve", "reject"].includes(
        decision
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "decision must be approve or reject."
      );
    }

    const managementNote =
      clean(
        req.data?.managementNote
      );

    const pinRef =
      db.doc(
        `athleteAssessmentPins/${pinId}`
      );

    const now =
      Timestamp.now();

    if (decision === "reject") {
      await db.runTransaction(
        async (tx) => {
          const pinSnap =
            await tx.get(pinRef);

          if (!pinSnap.exists) {
            throw new HttpsError(
              "not-found",
              "Assessment pin not found."
            );
          }

          const pin =
            pinSnap.data() || {};

          requireLocationAccess(
            staffContext.staff,
            clean(pin.locationId)
          );

          const status =
            clean(pin.status)
              .toUpperCase();

          if (
            ![
              "RETURNED_TO_MANAGEMENT",
              "PLACEMENT_RECORDED"
            ].includes(status)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Coach assessment has not been returned."
            );
          }

          const existingStatus =
            clean(
              pin.experienceRecognitionStatus
            ).toUpperCase();

          if (
            existingStatus === "AWARDED"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Experience recognition has already been awarded."
            );
          }

          tx.set(
            pinRef,
            {
              experienceRecognitionStatus:
                "REJECTED",

              experienceRecognitionReviewedAt:
                now,

              experienceRecognitionReviewedBy:
                actorUid,

              experienceRecognitionManagementNote:
                managementNote || null,

              updatedAt:
                now
            },
            {
              merge: true
            }
          );
        }
      );

      return {
        ok: true,
        status: "REJECTED",
        awardedXp: 0
      };
    }

    const result =
      await db.runTransaction(
        async (tx) => {
          const pinSnap =
            await tx.get(pinRef);

          if (!pinSnap.exists) {
            throw new HttpsError(
              "not-found",
              "Assessment pin not found."
            );
          }

          const pin =
            pinSnap.data() || {};

          requireLocationAccess(
            staffContext.staff,
            clean(pin.locationId)
          );

          const status =
            clean(pin.status)
              .toUpperCase();

          if (
            ![
              "RETURNED_TO_MANAGEMENT",
              "PLACEMENT_RECORDED"
            ].includes(status)
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Coach assessment has not been returned."
            );
          }

          const priorExperience =
            pin.priorExperience &&
            typeof pin.priorExperience ===
              "object"
              ? pin.priorExperience
              : {};

          const experiencePlan =
            buildExperienceRecognitionPlan(
              priorExperience
            );

          const requestedXp =
            experiencePlan.total;

          const issuedNowXp =
            experiencePlan.issuedNow;

          const athleteUid =
            clean(pin.athleteUid);

          if (!athleteUid) {
            throw new HttpsError(
              "failed-precondition",
              "Assessment pin is missing athleteUid."
            );
          }

          const athleteRef =
            db.doc(
              `athletes/${athleteUid}`
            );

          const athleteSnap =
            await tx.get(athleteRef);

          if (!athleteSnap.exists) {
            throw new HttpsError(
              "not-found",
              "Athlete profile not found."
            );
          }

          const athlete =
            athleteSnap.data() || {};

          requireLocationAccess(
            staffContext.staff,
            clean(
              athlete.locationId ||
              pin.locationId
            )
          );

          const awardIdentity =
            `experience-validation:${pinId}`;

          const receiptRef =
            db.collection(
              "xpAwardReceipts"
            ).doc(
              awardReceiptKey(
                athleteUid,
                awardIdentity
              )
            );

          const receiptSnap =
            await tx.get(
              receiptRef
            );

          if (receiptSnap.exists) {
            const previous =
              receiptSnap.data()
                ?.result || {};

            tx.set(
              pinRef,
              {
                experienceRecognitionStatus:
                  "AWARDED",

                experienceRecognitionAwardedXp:
                  Number(
                    previous.awardedAmount ||
                    previous.delta ||
                    0
                  ),

                experienceRecognitionReceiptId:
                  receiptRef.id,

                experienceRecognitionLogId:
                  clean(
                    previous.logId
                  ) || null,

                updatedAt:
                  now
              },
              {
                merge: true
              }
            );

            return {
              ...previous,
              ok: true,
              idempotent: true,
              duplicate: true
            };
          }

          const base =
            classifyAthlete(
              athlete,
              athleteUid
            );

          const tier =
            athleteTier(
              athlete,
              base
            );

          const xpCap =
            activeXpCap(
              athlete,
              base
            );

          const beforeXp =
            resolveAuthoritativeActiveRankXp(
              athlete
            );

          if (
            !Number.isFinite(
              beforeXp
            ) ||
            beforeXp < 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "INVALID_ACTIVE_XP"
            );
          }

          const unclamped =
            beforeXp + issuedNowXp;

          const afterXp =
            Math.max(
              0,
              Math.min(
                xpCap,
                unclamped
              )
            );

          const delta =
            afterXp - beforeXp;

          let canonicalDiscipline: string;

          try {
            canonicalDiscipline =
              resolveAuthoritativeLifetimeCombatDiscipline({
                athlete,
                requestedDiscipline:
                  pin.disciplineId || pin.discipline
              });
          } catch (error: any) {
            throw new HttpsError(
              "failed-precondition",
              clean(error?.message) ||
                "UNKNOWN_LIFETIME_COMBAT_DISCIPLINE"
            );
          }

          const lifetime =
            resolveLifetimeXpEffects({
              athlete,
              domain: "COMBAT",
              operationalDelta: delta,
              semantic: "RECOGNIZED_PRIOR_EXPERIENCE"
            });

          const disciplineLifetime =
            buildLifetimeCombatDisciplineUpdate({
              athlete,
              discipline: canonicalDiscipline,
              effects: lifetime
            });

          const beforeStripeCount =
            persistedStripeCount(
              base,
              tier,
              beforeXp,
              xpCap
            );

          const stripeCount =
            persistedStripeCount(
              base,
              tier,
              afterXp,
              xpCap
            );

          const athletePatch:
            Record<string, any> = {
              xp: afterXp,
              xpCap,
              stripeCount,
              trackBase: base,

              legacy: requestedXp > 0,

              legacyType:
                requestedXp > 0
                  ? "external"
                  : null,

              legacyYearsVerified:
                priorExperience.manual === true
                  ? null
                  : Number(
                      priorExperience
                        .verifiedYears ||
                      0
                    ),

              legacyCreditTotal:
                requestedXp,

              legacyCreditIssued:
                delta,

              legacyHold:
                experiencePlan.hold,

              legacyCreditSchedule:
                experiencePlan.schedule,

              legacyNote:
                experienceRecognitionNote(
                  priorExperience
                ),

              updatedAt:
                now
            };

          Object.assign(
            athletePatch,
            lifetimeXpPatch(lifetime),
            disciplineLifetime.patch
          );

          if (base === "F8") {
            const remoteAccess =
              resolveF8RemoteAccess({
                ...athlete,
                progressionTier:
                  tier,
                stripeCount
              });

            if (
              remoteAccess.gatewayReached
            ) {
              athletePatch[
                "unlocks.strength"
              ] = true;

              athletePatch[
                "unlocks.honor"
              ] = true;
            }
          }

          const ratio =
            xpCap > 0
              ? afterXp / xpCap
              : 0;

          const testingState =
            clean(
              athlete?.testing
                ?.state ||
              "ACTIVE"
            ).toUpperCase();

          if (
            (
              testingState === "ACTIVE" ||
              testingState === "TEMPLE"
            ) &&
            ratio >= 1
          ) {
            athletePatch[
              "testing.state"
            ] = "ELIGIBLE";

            athletePatch.tierStatus =
              "eligible";

            athletePatch[
              "testing.testEligibleAt"
            ] = now;
          } else if (
            testingState === "ACTIVE" &&
            ratio >= 0.9
          ) {
            athletePatch[
              "testing.state"
            ] = "TEMPLE";

            athletePatch.tierStatus =
              "temple";

            athletePatch[
              "testing.templeEnteredAt"
            ] = now;
          }

          tx.set(
            athleteRef,
            athletePatch,
            {
              merge: true
            }
          );

          const logRef =
            db.collection(
              "xpLogs"
            ).doc();

          const mk =
            monthKey(now);

          const note =
            experienceRecognitionNote(
              priorExperience
            );

          const log = {
            createdAt:
              now,

            monthKey:
              mk,

            uid:
              athleteUid,

            coachUid:
              clean(
                pin.coachUid ||
                pin.assignedCoachUid
              ) || null,

            managementUid:
              actorUid,

            kind:
              "EXPERIENCE_VALIDATION",

            lane:
              "combat",

            amount:
              delta,

            requestedAmount:
              issuedNowXp,

            recognitionTotal:
              requestedXp,

            recognitionHeld:
              Math.max(
                0,
                requestedXp - delta
              ),

            beforeXp,
            afterXp,
            xpCap,

            lifetimeXpBefore: lifetime.combinedBefore,
            lifetimeXpAfter: lifetime.combinedAfter,
            lifetimeXpDelta: lifetime.combinedLifetimeDelta,
            lifetimeXpDomain: lifetime.domain,
            lifetimeXpSemantic: lifetime.semantic,
            canonicalLifetimeCombatDiscipline: canonicalDiscipline,
            disciplineMapApplied: disciplineLifetime.disciplineMapApplied,
            disciplineLifetimeBefore: disciplineLifetime.disciplineLifetimeBefore,
            disciplineLifetimeAfter: disciplineLifetime.disciplineLifetimeAfter,

            base,
            tier,
            note,

            awardIdentity,

            meta: {
              source:
                "management_experience_validation",

              pinId,

              recognitionTotal:
                requestedXp,

              recognitionIssuedNow:
                delta,

              recognitionHeld:
                Math.max(
                  0,
                  requestedXp - delta
                ),

              recognitionSchedule:
                experiencePlan.schedule,

              locationId:
                clean(pin.locationId) ||
                null,

              verifiedYears:
                priorExperience.manual ===
                true
                  ? null
                  : Number(
                      priorExperience
                        .verifiedYears ||
                      0
                    ),

              manual:
                priorExperience.manual ===
                true,

              manualXp:
                priorExperience.manual ===
                true
                  ? Number(
                      priorExperience
                        .manualXp ||
                      requestedXp
                    )
                  : null,

              coachNote:
                clean(
                  priorExperience.note
                ) || null,

              managementNote:
                managementNote || null
            }
          };

          tx.set(
            logRef,
            log
          );

          tx.set(
            db.collection(
              "xp_logs"
            ).doc(
              logRef.id
            ),
            {
              ...log,
              compatibilityMirror:
                true
            }
          );

          const result = {
            ok: true,
            idempotent: false,
            duplicate: false,

            uid:
              athleteUid,

            kind:
              "EXPERIENCE_VALIDATION",

            requestedAmount:
              issuedNowXp,

            recognitionTotal:
              requestedXp,

            recognitionHeld:
              Math.max(
                0,
                requestedXp - delta
              ),

            recognitionSchedule:
              experiencePlan.schedule,

            delta,

            amount:
              delta,

            awardedAmount:
              delta,

            beforeXp,
            afterXp,
            xpCap,

            lifetimeXpBefore: lifetime.combinedBefore,
            lifetimeXpAfter: lifetime.combinedAfter,
            lifetimeXpDelta: lifetime.combinedLifetimeDelta,
            lifetimeXpDomain: lifetime.domain,
            lifetimeXpSemantic: lifetime.semantic,
            canonicalLifetimeCombatDiscipline: canonicalDiscipline,
            disciplineMapApplied: disciplineLifetime.disciplineMapApplied,
            disciplineLifetimeBefore: disciplineLifetime.disciplineLifetimeBefore,
            disciplineLifetimeAfter: disciplineLifetime.disciplineLifetimeAfter,

            beforeStripeCount,
            stripeCount,

            earnedStripe:
              stripeCount >
              beforeStripeCount,

            athleteName:
              clean(
                athlete.publicName ||
                athlete.fullName ||
                athlete.name
              ) ||
              athleteUid,

            base,
            tier,
            monthKey:
              mk,

            logId:
              logRef.id,

            awardIdentity
          };

          tx.create(
            receiptRef,
            {
              uid:
                athleteUid,

              awardIdentity,

              kind:
                "EXPERIENCE_VALIDATION",

              source:
                "management_experience_validation",

              createdAt:
                now,

              logId:
                logRef.id,

              result
            }
          );

          tx.set(
            pinRef,
            {
              experienceRecognitionStatus:
                "AWARDED",

              experienceRecognitionRequestedXp:
                requestedXp,

              experienceRecognitionIssuedNowXp:
                delta,

              experienceRecognitionHeldXp:
                Math.max(
                  0,
                  requestedXp - delta
                ),

              experienceRecognitionSchedule:
                experiencePlan.schedule,

              experienceRecognitionAwardedXp:
                delta,

              experienceRecognitionReviewedAt:
                now,

              experienceRecognitionReviewedBy:
                actorUid,

              experienceRecognitionManagementNote:
                managementNote || null,

              experienceRecognitionReceiptId:
                receiptRef.id,

              experienceRecognitionLogId:
                logRef.id,

              updatedAt:
                now
            },
            {
              merge: true
            }
          );

          return result;
        }
      );

    return result;
  });


export const createManagementXpAdjustment =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Management sign-in required."
      );
    }

    const actorUid =
      req.auth.uid;

    const staffContext =
      await requireActiveStaff(
        actorUid,
        MANAGEMENT_STAFF_ROLES,
        "Management access required."
      );

    const athleteUid =
      clean(
        req.data?.athleteUid
      );

    const amount =
      Number(
        req.data?.amount
      );

    const reason =
      clean(
        req.data?.reason
      );

    const category =
      clean(
        req.data?.category
      ).toLowerCase();

    const semantic =
      resolveManagementAdjustmentSemantic(
        category,
        clean(req.data?.semantic) as any || undefined
      );

    const adjustmentId =
      clean(
        req.data?.adjustmentId
      );

    const discipline =
      clean(
        req.data?.discipline
      ).toLowerCase();

    const allowedCategories =
      new Set([
        "delayed_onboarding",
        "downtime_recovery",
        "paper_reconciliation",
        "correction"
      ]);

    if (!athleteUid) {
      throw new HttpsError(
        "invalid-argument",
        "athleteUid is required."
      );
    }

    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Adjustment XP must be a positive whole number."
      );
    }

    if (!reason) {
      throw new HttpsError(
        "invalid-argument",
        "Adjustment reason is required."
      );
    }

    if (
      !allowedCategories.has(
        category
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid Management adjustment category."
      );
    }

    if (!adjustmentId) {
      throw new HttpsError(
        "invalid-argument",
        "adjustmentId is required."
      );
    }

    if (!discipline) {
      throw new HttpsError(
        "invalid-argument",
        "discipline is required."
      );
    }

    const athleteRef =
      db.doc(
        `athletes/${athleteUid}`
      );

    const now =
      Timestamp.now();

    return db.runTransaction(
      async (tx) => {
        const athleteSnap =
          await tx.get(
            athleteRef
          );

        if (!athleteSnap.exists) {
          throw new HttpsError(
            "not-found",
            "Athlete profile not found."
          );
        }

        const athlete =
          athleteSnap.data() || {};

        requireLocationAccess(
          staffContext.staff,
          clean(
            athlete.locationId
          )
        );

        const awardIdentity =
          `management-adjustment:${adjustmentId}`;

        const receiptRef =
          db.collection(
            "xpAwardReceipts"
          ).doc(
            awardReceiptKey(
              athleteUid,
              awardIdentity
            )
          );

        const receiptSnap =
          await tx.get(
            receiptRef
          );

        if (receiptSnap.exists) {
          return {
            ...(receiptSnap.data()
              ?.result || {}),

            ok: true,
            idempotent: true,
            duplicate: true
          };
        }

        let xpAuthority;

        try {
          xpAuthority =
            resolveDisciplineXpAuthority(
              athlete,
              discipline
            );
        } catch (error: any) {
          throw new HttpsError(
            "failed-precondition",
            clean(error?.message) ||
              "ATHLETE_DISCIPLINE_NOT_FOUND"
          );
        }

        const progression =
          xpAuthority.progression;

        const base =
          xpAuthority.progressionPrefix
            ? classifyAthlete(
                progression
              )
            : classifyAthlete(
                athlete,
                athleteUid
              );

        const tier =
          athleteTier(
            progression,
            base
          );

        const xpCap =
          activeXpCap(
            progression,
            base
          );

        const beforeXp =
          xpAuthority.authoritativeBeforeXp;

        const afterXp =
          Math.max(
            0,
            Math.min(
              xpCap,
              beforeXp + amount
            )
          );

        const delta =
          afterXp - beforeXp;

        if (delta <= 0) {
          throw new HttpsError(
            "failed-precondition",
            "XP_CAP_REACHED"
          );
        }

        const lifetime =
          resolveLifetimeXpEffects({
            athlete,
            domain: "COMBAT",
            operationalDelta: delta,
            semantic
          });

        let disciplineLifetime;

        try {
          disciplineLifetime =
            buildLifetimeCombatDisciplineUpdate({
              athlete,
              discipline:
                xpAuthority.discipline,
              effects: lifetime
            });
        } catch (error: any) {
          throw new HttpsError(
            "failed-precondition",
            clean(error?.message) ||
              "UNKNOWN_LIFETIME_COMBAT_DISCIPLINE"
          );
        }

        const beforeStripeCount =
          persistedStripeCount(
            base,
            tier,
            beforeXp,
            xpCap
          );

        const stripeCount =
          persistedStripeCount(
            base,
            tier,
            afterXp,
            xpCap
          );

        const athletePatch:
          Record<string, any> = {
            updatedAt:
              now
          };

        const progressionPrefix =
          xpAuthority.progressionPrefix;

        for (
          const target of
          xpAuthority.xpWriteTargets
        ) {
          athletePatch[target] =
            afterXp;
        }

        athletePatch[
          `${progressionPrefix}xpCap`
        ] = xpCap;

        athletePatch[
          `${progressionPrefix}stripeCount`
        ] = stripeCount;

        athletePatch[
          `${progressionPrefix}trackBase`
        ] = base;

        athletePatch[
          `${progressionPrefix}updatedAt`
        ] = now;

        Object.assign(
          athletePatch,
          lifetimeXpPatch(lifetime),
          disciplineLifetime.patch
        );

        if (base === "F8") {
          const remoteAccess =
            resolveF8RemoteAccess({
              ...progression,
              progressionTier:
                tier,
              stripeCount
            });

          if (
            remoteAccess.gatewayReached
          ) {
            athletePatch[
              `${progressionPrefix}unlocks.strength`
            ] = true;

            athletePatch[
              `${progressionPrefix}unlocks.honor`
            ] = true;
          }
        }

        const ratio =
          xpCap > 0
            ? afterXp / xpCap
            : 0;

        const testingState =
          clean(
            progression?.testing
              ?.state ||
            "ACTIVE"
          ).toUpperCase();

        if (
          (
            testingState === "ACTIVE" ||
            testingState === "TEMPLE"
          ) &&
          ratio >= 1
        ) {
          athletePatch[
            `${progressionPrefix}testing.state`
          ] = "ELIGIBLE";

          athletePatch[
            `${progressionPrefix}tierStatus`
          ] = "eligible";

          athletePatch[
            `${progressionPrefix}testing.testEligibleAt`
          ] = now;
        } else if (
          testingState === "ACTIVE" &&
          ratio >= 0.9
        ) {
          athletePatch[
            `${progressionPrefix}testing.state`
          ] = "TEMPLE";

          athletePatch[
            `${progressionPrefix}tierStatus`
          ] = "temple";

          athletePatch[
            `${progressionPrefix}testing.templeEnteredAt`
          ] = now;
        }

        tx.update(
          athleteRef,
          athletePatch
        );

        const logRef =
          db.collection(
            "xpLogs"
          ).doc();

        const mk =
          monthKey(now);

        const log = {
          createdAt:
            now,

          monthKey:
            mk,

          uid:
            athleteUid,

          managementUid:
            actorUid,

          kind:
            "MANAGEMENT_ADJUSTMENT",

          lane:
            "combat",

          amount:
            delta,

          requestedAmount:
            amount,

          beforeXp,
          afterXp,
          xpCap,

          lifetimeXpBefore:
            lifetime.combinedBefore,

          lifetimeXpAfter:
            lifetime.combinedAfter,

          lifetimeXpDelta:
            lifetime.combinedLifetimeDelta,

          lifetimeXpDomain:
            lifetime.domain,

          lifetimeXpSemantic:
            lifetime.semantic,

          lifetimeXpComponentBefore:
            lifetime.componentBefore,

          lifetimeXpComponentAfter:
            lifetime.componentAfter,

          canonicalLifetimeCombatDiscipline:
            disciplineLifetime.canonicalDiscipline,

          disciplineMapApplied:
            disciplineLifetime.disciplineMapApplied,

          disciplineLifetimeBefore:
            disciplineLifetime.disciplineLifetimeBefore,

          disciplineLifetimeAfter:
            disciplineLifetime.disciplineLifetimeAfter,

          base,
          tier,
          discipline,

          xpAuthoritySource:
            xpAuthority.sourceField,

          primaryXpMirrored:
            xpAuthority.mirrorsTopLevel,

          note:
            reason,

          awardIdentity,

          meta: {
            source:
              "management_adjustment",

            category,

            semantic,

            discipline,

            adjustmentId
          }
        };

        tx.set(
          logRef,
          log
        );

        tx.set(
          db.collection(
            "xp_logs"
          ).doc(
            logRef.id
          ),
          {
            ...log,
            compatibilityMirror:
              true
          }
        );

        const result = {
          ok: true,
          idempotent: false,
          duplicate: false,

          uid:
            athleteUid,

          kind:
            "MANAGEMENT_ADJUSTMENT",

          requestedAmount:
            amount,

          delta,

          amount:
            delta,

          awardedAmount:
            delta,

          beforeXp,
          afterXp,
          xpCap,

          lifetimeXpBefore:
            lifetime.combinedBefore,

          lifetimeXpAfter:
            lifetime.combinedAfter,

          lifetimeXpDelta:
            lifetime.combinedLifetimeDelta,

          lifetimeXpDomain:
            lifetime.domain,

          lifetimeXpSemantic:
            lifetime.semantic,

          lifetimeXpComponentBefore:
            lifetime.componentBefore,

          lifetimeXpComponentAfter:
            lifetime.componentAfter,

          canonicalLifetimeCombatDiscipline:
            disciplineLifetime.canonicalDiscipline,

          disciplineMapApplied:
            disciplineLifetime.disciplineMapApplied,

          disciplineLifetimeBefore:
            disciplineLifetime.disciplineLifetimeBefore,

          disciplineLifetimeAfter:
            disciplineLifetime.disciplineLifetimeAfter,

          beforeStripeCount,
          stripeCount,

          earnedStripe:
            stripeCount >
            beforeStripeCount,

          athleteName:
            clean(
              athlete.publicName ||
              athlete.fullName ||
              athlete.name
            ) ||
            athleteUid,

          base,
          tier,
          discipline,

          xpAuthoritySource:
            xpAuthority.sourceField,

          primaryXpMirrored:
            xpAuthority.mirrorsTopLevel,
          monthKey:
            mk,

          logId:
            logRef.id,

          awardIdentity
        };

        tx.create(
          receiptRef,
          {
            uid:
              athleteUid,

            awardIdentity,

            kind:
              "MANAGEMENT_ADJUSTMENT",

            source:
              "management_adjustment",

            discipline,

            createdAt:
              now,

            logId:
              logRef.id,

            result
          }
        );

        return result;
      }
    );
  });
