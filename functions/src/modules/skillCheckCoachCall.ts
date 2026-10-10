import {
  onCall,
  HttpsError,
} from "firebase-functions/v2/https";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import { reconcileHistoryPages, type HistoryPage } from "./historicalSkillReconciliation";

import {
  normalizeStaffList,
  normalizeStaffRole,
  normalizeStaffScope,
  requireActiveStaff,
  staffHasLocation,
} from "../services/staffAuthorization";

const SKILL_CHECK_STAFF_ROLES = Object.freeze([
  "admin",
  "coach",
]);

function requireSkillCheckAthleteAccess(
  actor: {
    uid: string;
    role: string;
    staff: Record<string, unknown>;
  },
  athlete: Record<string, unknown>
): void {
  if (normalizeStaffRole(actor.role) === "admin") return;

  if (normalizeStaffRole(actor.role) !== "coach") {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside the Coach's authorized training scope."
    );
  }

  const assignedCoachIds = normalizeStaffList(
    athlete.coachUid,
    athlete.coachIds
  );

  const directlyAssigned =
    assignedCoachIds.includes(actor.uid);

  const locationId =
    String(athlete.locationId ?? "").trim();

  if (
    !directlyAssigned &&
    !staffHasLocation(actor.staff, locationId)
  ) {
    throw new HttpsError(
      "permission-denied",
      "This athlete is outside the Coach's authorized training scope."
    );
  }
}

const ALLOWED_STATES = Object.freeze([
  "NOT_INTRODUCED",
  "LEARNED",
  "APPLIED",
  "MASTERED",
  "REFINED",
]);

const WRESTLING_FAMILIES = Object.freeze([
  "stance_motion",
  "level_change_entry",
  "angle",
  "head_position",
  "distance",
  "tempo",
  "pressure_footwork",
  "motion_attack_reattack",
  "double_leg",
  "single_leg",
  "setups_ties",
  "snap_go_behind",
  "arm_drag",
  "reattack_reshot",
  "chain_wrestling",
  "underhook",
  "two_on_one",
  "upper_body",
  "shot_defense",
  "down_block",
  "counter_offense",
  "front_headlock",
  "whizzer",
  "scramble",
  "ride_control",
  "return",
  "turn_system",
  "crossface",
  "leg_ride",
  "escape",
  "stand_up",
  "sitout_switch",
  "hip_heist",
  "reversal",
  "survival_recovery",
  "bottom_integration",
]);

const BOXING_FAMILIES = Object.freeze([
  "stance_motion",
  "distance_range",
  "angles_pivots",
  "jab_system",
  "cross_system",
  "hook_system",
  "uppercut",
  "body_attack",
  "combination_flow",
  "slip_head_movement",
  "roll",
  "parry",
  "block_shell",
  "defense_reset",
  "defense_to_offense",
  "counter_punching",
  "timing_rhythm",
  "feints_setups",
  "pressure_boxing",
  "inside_boxing",
  "ringcraft",
  "tempo_pace",
  "fight_iq",
  "live_application",
  "conditioning_composure",
  "finishing",
  "leadership_mastery",
]);

const MUAY_THAI_FAMILIES = Object.freeze([
  "stance_motion",
  "guard_defense",
  "head_movement",
  "distance_range",
  "angles_pivots",
  "jab_system",
  "cross_system",
  "hook_system",
  "uppercut",
  "body_attack",
  "teep_system",
  "kick_system",
  "knee_system",
  "elbow_system",
  "clinch_system",
  "check_kick_defense",
  "combination_flow",
  "timing_rhythm",
  "feints_setups",
  "counter_striking",
  "defense_reset",
  "defense_to_offense",
  "pressure",
  "inside_fighting",
  "ringcraft",
  "tempo_pace",
  "fight_iq",
  "weapon_integration",
  "live_application",
  "conditioning_composure",
  "finishing",
  "leadership_mastery",
]);

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeFamily(value: unknown): string {
  return clean(value).toLowerCase();
}

function normalizeDiscipline(value: unknown): string {
  const raw = clean(value).toLowerCase();

  if (raw.includes("wrest")) return "wrestling";

  if (
    raw.includes("muay") ||
    raw.includes("kickbox")
  ) {
    return "muay-thai";
  }

  if (raw.includes("box")) return "boxing";

  return raw.replace(/[\s_]+/g, "-");
}

function familiesForDiscipline(
  discipline: string
): readonly string[] {
  if (discipline === "boxing") {
    return BOXING_FAMILIES;
  }

  if (discipline === "muay-thai") {
    return MUAY_THAI_FAMILIES;
  }

  if (discipline === "wrestling") {
    return WRESTLING_FAMILIES;
  }

  return [];
}

function skillDocDiscipline(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    normalizeDiscipline(data.discipline);

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  if (separator > 0) {
    return normalizeDiscipline(
      docId.slice(0, separator)
    );
  }

  // Legacy raw family documents were Wrestling-only.
  return "wrestling";
}

function skillDocFamilyId(
  docId: string,
  data: Record<string, unknown>
): string {
  const explicit =
    normalizeFamily(data.familyId);

  if (explicit) return explicit;

  const separator = docId.indexOf("__");

  if (separator > 0) {
    return normalizeFamily(
      docId.slice(separator + 2)
    );
  }

  return normalizeFamily(docId);
}

function normalizeState(value: unknown): string {
  return clean(value).toUpperCase();
}

function optionalPracticeId(value: unknown): string {
  const practiceId = clean(value);
  if (!practiceId) return "";
  if (practiceId.length > 160 || practiceId.includes("/") || practiceId === "." || practiceId === ".."
    || /[\u0000-\u001f\u007f]/.test(practiceId)) {
    throw new HttpsError("invalid-argument", "practiceId is invalid.");
  }
  return practiceId;
}

function requirePracticeVerificationAccess(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  practice: Record<string, unknown>
): void {
  if (normalizeStaffRole(actor.role) === "admin") return;
  const locationId = clean(practice.locationId || practice.academyId);
  if (!locationId || !staffHasLocation(actor.staff, locationId)) {
    throw new HttpsError("permission-denied", "Practice location is outside the Coach's authorized scope.");
  }
  if (clean(practice.coachUid) !== actor.uid) {
    throw new HttpsError("permission-denied", "Only the Coach who opened this practice may attach Skill Check evidence.");
  }
}

// History reads may include a different originating Coach, but only within
// the athlete's current authorized location. Practice write ownership is unchanged.
function requireHistoricalPracticeReadAccess(
  actor: { uid: string; role: string; staff: Record<string, unknown> },
  practice: Record<string, unknown>,
  athleteLocationId: string,
  athleteAcademyId: string,
  authorizedPriorLocations: readonly string[] = []
): void {
  const locationId = clean(practice.locationId);
  const academyId = clean(practice.academyId);
  const admin = normalizeStaffRole(actor.role) === "admin";
  if (locationId) {
    const currentLocationAccess = locationId === athleteLocationId
      && (admin || staffHasLocation(actor.staff, locationId));
    // A prior location is read-only and Admin-only, and must be declared
    // in the server-fetched athlete record. Coach permissions never expand.
    const verifiedPriorLocationAccess = admin && authorizedPriorLocations.includes(locationId);
    if (!currentLocationAccess && !verifiedPriorLocationAccess) {
      throw new HttpsError("permission-denied", "Historical practice is outside the athlete's authorized location.");
    }
    return;
  }
  // Legacy fallback applies only to practices with no locationId, and only
  // with an explicit athlete/staff academy match. It never overrides a
  // conflicting locationId or infers authorization from a coach assignment.
  if (!academyId || !athleteAcademyId || academyId !== athleteAcademyId
      || (!admin && !normalizeStaffScope(actor.staff).academyIds.includes(academyId))) {
    throw new HttpsError("permission-denied", "Historical practice is outside the athlete's authorized academy.");
  }
}

function attendanceIncludesAthlete(attendance: Record<string, unknown>, athleteId: string): boolean {
  const presentIds = Array.isArray(attendance.presentIds) ? attendance.presentIds : [];
  const present = Array.isArray(attendance.present) ? attendance.present : [];
  return presentIds.some((id) => clean(id).toUpperCase() === athleteId)
    || present.some((athlete: any) => clean(athlete?.id || athlete?.uid).toUpperCase() === athleteId);
}

export const skillCheckCoachCall =
  onCall(async (req) => {
    if (!req.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign-in required."
      );
    }

    const actor = await requireActiveStaff(
      req.auth.uid,
      SKILL_CHECK_STAFF_ROLES,
      "Active Coach access required."
    );

    const data = req.data || {};
    const action = clean(data.action).toLowerCase();
    const athleteId = clean(
      data.athleteId || data.uid
    ).toUpperCase();

    const discipline =
      normalizeDiscipline(
        data.discipline || "wrestling"
      );

    if (!["wrestling", "boxing", "muay-thai"].includes(
      discipline
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported Skill Check discipline."
      );
    }

    if (!athleteId) {
      throw new HttpsError(
        "invalid-argument",
        "A valid athlete ID is required."
      );
    }

    const db = getFirestore();

    const athleteSnap = await db
      .doc(`athletes/${athleteId}`)
      .get();

    if (!athleteSnap.exists) {
      throw new HttpsError(
        "not-found",
        `Athlete not found: ${athleteId}`
      );
    }

    const athlete =
      athleteSnap.data() || {};

    requireSkillCheckAthleteAccess(
      actor,
      athlete
    );

    if (action === "get-transfer-review-status") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer review details require Admin authority.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const snap = await ref.get();
      if (!snap.exists) {
        return { ok: true, status: "NOT_OPENED", stale: false,
          evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
      }
      const review = snap.data() || {};
      const currentLocations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort()
        : [];
      const recordedLocations = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort()
        : [];
      const stale = JSON.stringify(currentLocations) !== JSON.stringify(recordedLocations);
      return { ok: true, status: stale ? "STALE_REVIEW" : clean(review.status) === "REJECTED" ? "REJECTED" : "PENDING_MANAGEMENT_REVIEW",
        stale, recordedLocations, currentLocations,
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
    }

    if (action === "list-transfer-coverage-checkpoints") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer checkpoint history requires Admin authority.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const reviewSnap = await ref.get();
      if (!reviewSnap.exists) {
        return { ok: true, checkpoints: [], evidenceApproved: false,
          coverageComplete: false, eligibleForAuto: false };
      }
      const review = reviewSnap.data() || {};
      const revision = typeof review.revision === "number" ? review.revision : 1;
      // Bound history retrieval; never interpret an audit checkpoint as approval.
      const snapshot = await ref.collection("coverageCheckpoints")
        .orderBy(FieldPath.documentId()).limit(50).get();
      return {
        ok: true,
        checkpoints: snapshot.docs.map(doc => {
          const record = doc.data() || {};
          return {
            checkpointId: doc.id,
            kind: "UNVERIFIED_REVIEW_CHECKPOINT",
            reviewRevision: record.reviewRevision ?? null,
            currentRevision: record.reviewRevision === revision,
            recordedBy: clean(record.recordedBy),
            evidenceApproved: false,
            coverageComplete: false,
            eligibleForAuto: false,
          };
        }),
        truncated: snapshot.size === 50,
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
      };
    }

    if (action === "record-transfer-coverage-checkpoint") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Historical coverage checkpoints require Admin authority.");
      }
      // Persist only authoritative review metadata fetched by this callable.
      // This is an audit checkpoint, NOT a verified evidence manifest.
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const checkpointId = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("failed-precondition", "Open a transfer review first.");
        const review = snap.data() || {};
        if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") {
          throw new HttpsError("failed-precondition", "Only pending reviews can have coverage checkpoints.");
        }
        const current = Array.isArray(athlete.previousLocationIds)
          ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
            .filter(id => id !== clean(athlete.locationId)).sort()
          : [];
        const recorded = Array.isArray(review.declaredPriorLocationIds)
          ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort()
          : [];
        if (JSON.stringify(current) !== JSON.stringify(recorded)) {
          throw new HttpsError("failed-precondition", "Refresh stale review before recording a checkpoint.");
        }
        const checkpoint = ref.collection("coverageCheckpoints").doc();
        tx.create(checkpoint, {
          kind: "UNVERIFIED_REVIEW_CHECKPOINT",
          athleteId, discipline,
          reviewRevision: typeof review.revision === "number" ? review.revision : 1,
          declaredPriorLocationIds: recorded,
          recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp(),
          blockers: ["verified-historical-coverage-manifest-required",
            "verified-evidence-acceptance-chain-required"],
          evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
        });
        return checkpoint.id;
      });
      return { ok: true, checkpointId, kind: "UNVERIFIED_REVIEW_CHECKPOINT",
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
    }

    if (action === "verify-evidence-manifest") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Manifest verification requires Admin authority.");
      }
      const manifestId = clean(data.manifestId);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(manifestId)) {
        throw new HttpsError("invalid-argument", "Valid manifestId is required.");
      }
      const reviewRef = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const [reviewSnap, manifestSnap] = await Promise.all([
        reviewRef.get(), reviewRef.collection("evidenceManifests").doc(manifestId).get(),
      ]);
      if (!reviewSnap.exists || !manifestSnap.exists) {
        throw new HttpsError("not-found", "Transfer review or manifest not found.");
      }
      const review = reviewSnap.data() || {};
      const manifest = manifestSnap.data() || {};
      const blockers: string[] = [];
      if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") blockers.push("review-not-pending");
      if (manifest.kind !== "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST"
          || clean(manifest.athleteId) !== athleteId
          || normalizeDiscipline(manifest.discipline) !== discipline) {
        blockers.push("manifest-identity-invalid");
      }
      const revision = typeof review.revision === "number" ? review.revision : 1;
      if (manifest.reviewRevision !== revision) blockers.push("manifest-review-revision-stale");
      const records = Array.isArray(manifest.records) ? manifest.records : [];
      if (records.length > 100) throw new HttpsError("failed-precondition", "Manifest exceeds verification limit.");
      if (!records.length) blockers.push("manifest-empty");
      const results: Array<{skillEvidencePath: string; valid: boolean; blockers: string[]}> = [];
      for (const entry of records) {
        const r = entry as Record<string, unknown>;
        const practiceId = clean(r.practiceId);
        const path = clean(r.skillEvidencePath);
        const base = `practiceSessions/${practiceId}/athletes/${athleteId}`;
        const errors: string[] = [];
        if (!/^[a-zA-Z0-9_-]{1,160}$/.test(practiceId)
            || !path.startsWith(base + "/verifiedSkills/")
            || path.split("/").length !== 6
            || clean(r.attendancePath) !== `attendance_sessions/${practiceId}`
            || clean(r.athleteMemoryPath) !== base) {
          errors.push("source-path-invalid");
        } else {
          const [practiceSnap, attendanceSnap, memorySnap, evidenceSnap] = await Promise.all([
            db.doc(`practiceSessions/${practiceId}`).get(),
            db.doc(`attendance_sessions/${practiceId}`).get(),
            db.doc(base).get(), db.doc(path).get(),
          ]);
          const practice = practiceSnap.data() || {};
          const attendance = attendanceSnap.data() || {};
          const memory = memorySnap.data() || {};
          const evidence = evidenceSnap.data() || {};
          // Revalidate source location against the scope saved in the manifest.
          // Moving a practice after evidence collection must invalidate that entry.
          const sourceScope = clean(r.scope);
          const sourceLocation = clean(practice.locationId);
          const sourceAcademy = clean(practice.academyId);
          const currentLocation = clean(athlete.locationId);
          const declaredPrior = Array.isArray(athlete.previousLocationIds)
            ? athlete.previousLocationIds.map(clean).filter(Boolean) : [];
          const scopeValid =
            (sourceScope === "athlete-location" && sourceLocation === currentLocation && !!currentLocation)
            || (sourceScope === "athlete-academy" && !sourceLocation
              && !!sourceAcademy && sourceAcademy === clean(athlete.academyId))
            || (sourceScope.startsWith("prior-location:")
              && sourceLocation === sourceScope.slice("prior-location:".length)
              && declaredPrior.includes(sourceLocation)
              && sourceLocation !== currentLocation)
            || (sourceScope === "coach" && (
              (sourceLocation === currentLocation && !!currentLocation)
              || (!sourceLocation && !!sourceAcademy && sourceAcademy === clean(athlete.academyId))
            ));
          if (!scopeValid) errors.push("practice-scope-changed");
          if (!practiceSnap.exists || normalizeDiscipline(practice.discipline) !== discipline
              || clean(practice.sessionDateKey) !== clean(r.sessionDateKey)) errors.push("practice-changed");
          if (!attendanceSnap.exists || clean(attendance.practiceId) !== practiceId
              || normalizeDiscipline(attendance.discipline) !== discipline
              || clean(attendance.status).toLowerCase() !== "finalized"
              || attendance.finalized !== true || !attendanceIncludesAthlete(attendance, athleteId)) {
            errors.push("attendance-changed");
          }
          if (!memorySnap.exists || clean(memory.practiceId) !== practiceId
              || clean(memory.athleteId).toUpperCase() !== athleteId
              || normalizeDiscipline(memory.discipline) !== discipline
              || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
            errors.push("athlete-memory-changed");
          }
          if (!evidenceSnap.exists || normalizeDiscipline(evidence.discipline) !== discipline
              || normalizeFamily(evidence.familyId) !== clean(r.familyId)
              || normalizeState(evidence.state) !== clean(r.state)
              || clean(evidence.coachUid) !== clean(r.coachUid)
              || !(evidence.verifiedAt instanceof Timestamp)
              || (evidence.verifiedAt instanceof Timestamp
                && evidence.verifiedAt.toDate().toISOString() !== clean(r.verifiedAt))) {
            errors.push("skill-evidence-changed");
          }
        }
        results.push({skillEvidencePath: path, valid: errors.length === 0, blockers: errors});
        if (errors.length) blockers.push("manifest-source-invalid:" + practiceId);
      }
      // Expose review readiness independently from source integrity.
      // Even valid evidence cannot substitute for a complete coverage attestation.
      const reviewLocations = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
      const currentLocations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort() : [];
      if (JSON.stringify(reviewLocations) !== JSON.stringify(currentLocations)) {
        blockers.push("transfer-review-stale");
      }
      const manifestBlockers = Array.isArray(manifest.blockers) ? manifest.blockers.map(clean) : [];
      if (manifestBlockers.length) blockers.push("manifest-historical-coverage-unresolved");
      // Store immutable, server-observed rechecks for later independent
      // review. A receipt records an observation, never permanent validity.
      const sourceRecordsValid = results.length > 0 && results.every(r => r.valid);
      const reviewCurrent = JSON.stringify(reviewLocations) === JSON.stringify(currentLocations)
        && clean(review.status) === "PENDING_MANAGEMENT_REVIEW"
        && manifest.reviewRevision === revision;
      let verificationReceiptId: string | null = null;
      if (data.recordVerification === true) {
        const receipt = reviewRef.collection("sourceVerificationReceipts").doc();
        await receipt.create({
          kind: "UNAPPROVED_SOURCE_VERIFICATION_RECEIPT",
          athleteId, discipline, manifestId, reviewRevision: revision,
          sourceRecordsValid, reviewCurrent,
          records: results, blockers: [...new Set(blockers)].sort(),
          observedAt: Timestamp.now(), observedBy: actor.uid,
          historicalCoverageVerified: false, evidenceApproved: false,
        });
        verificationReceiptId = receipt.id;
      }
      // Verification is not completeness attestation and never grants approval.
      return {ok: true, diagnosticOnly: true, manifestId, recordCount: results.length,
        verificationReceiptId, sourceRecordsValid, reviewCurrent,
        historicalCoverageVerified: false,
        acceptanceReady: false,
        records: results, blockers: [...new Set(blockers)].sort(),
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false};
    }

    if (action === "assess-history-attestation") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Historical attestation requires Admin authority.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const [reviewSnap, manifestsSnap] = await Promise.all([
        ref.get(), ref.collection("evidenceManifests").limit(51).get(),
      ]);
      const review = reviewSnap.data() || {};
      const currentLocations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort() : [];
      const reviewLocations = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
      const revision = typeof review.revision === "number" ? review.revision : 1;
      const blockers: string[] = [];
      if (!reviewSnap.exists) blockers.push("review-not-opened");
      else if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") blockers.push("review-not-pending");
      if (JSON.stringify(currentLocations) !== JSON.stringify(reviewLocations)) blockers.push("declared-locations-changed");
      if (manifestsSnap.size === 51) blockers.push("manifest-list-truncated");
      const matching = manifestsSnap.docs.filter(doc => {
        const data = doc.data() || {};
        return data.kind === "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST"
          && data.reviewRevision === revision && clean(data.athleteId) === athleteId
          && normalizeDiscipline(data.discipline) === discipline;
      });
      if (!matching.length) blockers.push("current-revision-manifest-missing");
      const manifestSummaries = matching.map(doc => {
        const data = doc.data() || {};
        const scopes = Array.isArray(data.checkedScopes) ? data.checkedScopes : [];
        const sourceBlockers = Array.isArray(data.blockers) ? data.blockers.map(clean) : [];
        const allScanned = scopes.length > 0
          && scopes.every((scope: Record<string, unknown>) =>
            scope.authorized === true && scope.exhausted === true);
        return {
          manifestId: doc.id, sourceRecordCount: Array.isArray(data.records) ? data.records.length : 0,
          boundedScopesExhausted: allScanned,
          sourceBlockerCount: sourceBlockers.length,
        };
      });
      if (!manifestSummaries.some(item => item.boundedScopesExhausted && item.sourceBlockerCount === 0)) {
        blockers.push("no-blocker-free-exhausted-manifest");
      }
      // Every required scope must be present and exhausted in a single
      // manifest; a collection of unrelated partial manifests is not proof.
      const expectedScopes = ["athlete-location", "athlete-academy",
        ...currentLocations.map(id => "prior-location:" + id)];
      const scopeCoverage = matching.map(doc => {
        const data = doc.data() || {};
        const scopes: Record<string, unknown>[] = Array.isArray(data.checkedScopes)
          ? data.checkedScopes : [];
        const missing = expectedScopes.filter(name => !scopes.some(scope =>
          scope.scope === name && scope.authorized === true && scope.exhausted === true));
        return { manifestId: doc.id, missingScopes: missing };
      });
      if (!scopeCoverage.some(item => item.missingScopes.length === 0)) {
        blockers.push("required-history-scopes-not-exhausted");
      }
      if (matching.some(doc => {
        const data = doc.data() || {};
        return Array.isArray(data.blockers) && data.blockers.length > 0;
      })) blockers.push("manifest-has-unresolved-evidence-blockers");
      // Saved manifests cannot establish completeness or validate their own
      // provenance. Independent, durable cross-scope chain verification remains required.
      blockers.push("independent-full-history-attestation-required");
      blockers.push("current-source-reverification-required");
      blockers.push("management-evidence-acceptance-required");
      return { ok: true, diagnosticOnly: true, kind: "HISTORY_ATTESTATION_ASSESSMENT",
        reviewRevision: reviewSnap.exists ? revision : null,
        manifests: manifestSummaries, scopeCoverage, blockers: [...new Set(blockers)].sort(),
        attested: false, evidenceApproved: false, coverageComplete: false,
        eligibleForAuto: false };
    }

    if (action === "preview-accepted-skill-state") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Accepted skill-state previews require Admin authority.");
      }
      // An accepted, independently verified evidence chain has not been
      // implemented. Never infer state from unapproved manifestations or claims.
      return { ok: true, diagnosticOnly: true, athleteId, discipline,
        skillStates: [], unresolvedFamilies: [...familiesForDiscipline(discipline)],
        blockers: ["accepted-historical-evidence-unavailable",
          "independent-full-history-attestation-required"],
        coverageComplete: false, evidenceApproved: false, eligibleForAuto: false };
    }

    if (action === "certify-bounded-history-snapshot") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Historical snapshot certification requires Admin.");
      }
      const manifestId = clean(data.manifestId);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(manifestId)) {
        throw new HttpsError("invalid-argument", "Valid manifest ID required.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const certificate = ref.collection("coverageCertificates").doc(manifestId);
      // All query and record reads occur in ONE Firestore transaction snapshot.
      // Limit to small histories; never label a truncated history complete.
      const outcome = await db.runTransaction(async tx => {
        const [reviewSnap, athleteSnap, manifestSnap, existingCert] = await Promise.all([
          tx.get(ref), tx.get(db.doc(`athletes/${athleteId}`)),
          tx.get(ref.collection("evidenceManifests").doc(manifestId)), tx.get(certificate),
        ]);
        const review = reviewSnap.data() || {};
        const current = athleteSnap.data() || {};
        const manifest = manifestSnap.data() || {};
        const revision = typeof review.revision === "number" ? review.revision : 1;
        const previous = Array.isArray(current.previousLocationIds)
          ? [...new Set(current.previousLocationIds.map(clean).filter(Boolean))]
            .filter(id => id !== clean(current.locationId)).sort() : [];
        const declared = Array.isArray(review.declaredPriorLocationIds)
          ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
        const blockers: string[] = [];
        if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW"
            || JSON.stringify(previous) !== JSON.stringify(declared)) blockers.push("review-stale");
        if (!manifestSnap.exists || manifest.kind !== "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST"
            || manifest.reviewRevision !== revision || clean(manifest.athleteId) !== athleteId
            || normalizeDiscipline(manifest.discipline) !== discipline) blockers.push("manifest-invalid");
        if (existingCert.exists) blockers.push("certificate-already-exists");
        const manifestBlockers: string[] = Array.isArray(manifest.blockers)
          ? manifest.blockers.map(clean) : [];
        // A prior-location review requirement is resolved by this Admin's
        // independent atomic reconciliation; other blockers remain fatal.
        const resolvedByAtomicReconciliation = new Set([
          "prior-location-management-verification-required",
          "historical-transfer-coverage-unverified",
          "current-skill-state-unresolved",
        ]);
        // These generic diagnostic markers are emitted even for a complete
        // scan. The atomic certification resolves coverage independently;
        // skill-state remains unresolved until approved evidence is processed.
        const unresolvedManifestBlockers = manifestBlockers.filter(reason =>
          !resolvedByAtomicReconciliation.has(reason));
        if (unresolvedManifestBlockers.length) blockers.push("manifest-has-blockers");
        const records: Record<string, unknown>[] = Array.isArray(manifest.records)
          ? manifest.records : [];
        if (!records.length || records.length > 50) blockers.push("manifest-evidence-count-not-supported");
        const location = clean(current.locationId);
        const academy = clean(current.academyId);
        const scopes = [
          ...(location ? [{scope: "athlete-location", field: "locationId", value: location}] : []),
          ...(academy ? [{scope: "athlete-academy", field: "academyId", value: academy}] : []),
          ...previous.map(value => ({scope: "prior-location:" + value, field: "locationId", value})),
        ];
        if (previous.length > 10 || scopes.length > 12) blockers.push("too-many-history-scopes");
        if (!location) blockers.push("current-location-missing");
        // A certificate must capture the complete inventory, not just a valid subset.
        const observed = new Set<string>();
        if (!blockers.length) {
          for (const spec of scopes) {
            const query = db.collection("practiceSessions").where(spec.field, "==", spec.value)
              .orderBy(FieldPath.documentId()).limit(51);
            const practices = await tx.get(query);
            if (practices.size > 50) {
              blockers.push("scope-exceeds-atomic-snapshot-limit:" + spec.scope);
              continue;
            }
            for (const practiceDoc of practices.docs) {
              const practice = practiceDoc.data() || {};
              if (normalizeDiscipline(practice.discipline) !== discipline) continue;
              if (spec.scope === "athlete-academy" && clean(practice.locationId)) continue;
              const base = `practiceSessions/${practiceDoc.id}/athletes/${athleteId}`;
              const [attendanceSnap, memorySnap, evidenceSnap] = await Promise.all([
                tx.get(db.doc(`attendance_sessions/${practiceDoc.id}`)),
                tx.get(db.doc(base)),
                tx.get(db.collection(base + "/verifiedSkills")),
              ]);
              const attendance = attendanceSnap.data() || {};
              const memory = memorySnap.data() || {};
              const present = attendanceSnap.exists
                && clean(attendance.practiceId) === practiceDoc.id
                && normalizeDiscipline(attendance.discipline) === discipline
                && clean(attendance.status).toLowerCase() === "finalized"
                && attendance.finalized === true && attendanceIncludesAthlete(attendance, athleteId);
              const remembered = memorySnap.exists
                && clean(memory.practiceId) === practiceDoc.id
                && clean(memory.athleteId).toUpperCase() === athleteId
                && normalizeDiscipline(memory.discipline) === discipline
                && clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() === "present";
              if (present !== remembered) blockers.push("attendance-memory-mismatch:" + practiceDoc.id);
              if (!present || !remembered) continue;
              if (evidenceSnap.empty) blockers.push("missing-skills:" + practiceDoc.id);
              for (const doc of evidenceSnap.docs) {
                const evidence = doc.data() || {};
                const entry = records.find(item => clean(item.skillEvidencePath) === doc.ref.path);
                if (!entry || normalizeDiscipline(evidence.discipline) !== discipline
                    || normalizeFamily(evidence.familyId) !== clean(entry.familyId)
                    || normalizeState(evidence.state) !== clean(entry.state)
                    || clean(evidence.coachUid) !== clean(entry.coachUid)
                    || !(evidence.verifiedAt instanceof Timestamp)
                    || evidence.verifiedAt.toDate().toISOString() !== clean(entry.verifiedAt)
                    || clean(entry.practiceId) !== practiceDoc.id
                    || clean(entry.sessionDateKey) !== clean(practice.sessionDateKey)) {
                  blockers.push("unmatched-or-changed-evidence:" + doc.ref.path);
                }
                observed.add(doc.ref.path);
              }
            }
          }
          for (const record of records) {
            if (!observed.has(clean(record.skillEvidencePath)))
              blockers.push("manifest-record-not-in-snapshot:" + clean(record.skillEvidencePath));
          }
        }
        if (blockers.length) return {certificateIssued: false, blockers: [...new Set(blockers)].sort(),
          observedEvidenceCount: observed.size};
        // Immutable evidence certification only; no athlete placement or AUTO.
        tx.create(certificate, {
          kind: "SERVER_CERTIFIED_FULL_HISTORY", schemaVersion: 1,
          athleteId, discipline, manifestId, reviewRevision: revision,
          declaredPriorLocationIds: previous, sourceEvidencePaths: [...observed].sort(),
          scopeNames: scopes.map(spec => spec.scope),
          certifiedAt: FieldValue.serverTimestamp(), certifiedBy: actor.uid,
          evidenceApproved: false, eligibleForAuto: false,
        });
        return {certificateIssued: true, blockers: [], observedEvidenceCount: observed.size};
      });
      return {ok: true, kind: "BOUNDED_ATOMIC_HISTORY_CERTIFICATION", manifestId,
        ...outcome, evidenceApproved: false, eligibleForAuto: false,
        coverageComplete: false};
    }

    if (action === "certify-history-coverage") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "History certification requires Admin authority.");
      }
      const manifestId = clean(data.manifestId);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(manifestId)) {
        throw new HttpsError("invalid-argument", "A valid manifestId is required.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const [reviewSnap, manifestSnap] = await Promise.all([
        ref.get(), ref.collection("evidenceManifests").doc(manifestId).get(),
      ]);
      const review = reviewSnap.data() || {};
      const manifest = manifestSnap.data() || {};
      const locations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort() : [];
      const declared = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
      const revision = typeof review.revision === "number" ? review.revision : 1;
      const blockers: string[] = [];
      if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") {
        blockers.push("review-not-currently-pending");
      }
      if (JSON.stringify(locations) !== JSON.stringify(declared)) {
        blockers.push("declared-location-history-changed");
      }
      if (!manifestSnap.exists || manifest.kind !== "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST"
          || manifest.reviewRevision !== revision || clean(manifest.athleteId) !== athleteId
          || normalizeDiscipline(manifest.discipline) !== discipline) {
        blockers.push("manifest-not-current");
      }
      const scopes: Record<string, unknown>[] = Array.isArray(manifest.checkedScopes)
        ? manifest.checkedScopes : [];
      const expectedScopes = ["athlete-location", "athlete-academy",
        ...locations.map(id => "prior-location:" + id)];
      for (const scope of expectedScopes) {
        if (!scopes.some(item => item.scope === scope
            && item.authorized === true && item.exhausted === true
            && item.nextCursor == null)) {
          blockers.push("scope-not-proven-exhausted:" + scope);
        }
      }
      if (scopes.some(item => item.authorized !== true || item.exhausted !== true)) {
        blockers.push("manifest-contains-incomplete-scope");
      }
      if (!Array.isArray(manifest.records) || manifest.records.length === 0) {
        blockers.push("no-source-evidence");
      }
      if (Array.isArray(manifest.blockers) && manifest.blockers.length) {
        blockers.push("manifest-has-unresolved-blockers");
      }
      // Exhausted bounded queries are insufficient: missing historical scopes,
      // writes during traversal and omitted evidence still need independent proof.
      blockers.push("independent-unbounded-scope-reconciliation-required");
      blockers.push("source-snapshot-consistency-required");
      return {ok: true, diagnosticOnly: true, kind: "HISTORY_CERTIFICATION_PREFLIGHT",
        manifestId, requiredScopes: expectedScopes,
        blockers: [...new Set(blockers)].sort(), certificateIssued: false,
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false};
    }

    if (action === "commit-transfer-acceptance") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Only Admin may accept historical transfers.");
      }
      const manifestId = clean(data.manifestId);
      const receiptId = clean(data.verificationReceiptId);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(manifestId)
          || !/^[a-zA-Z0-9_-]{1,128}$/.test(receiptId)) {
        throw new HttpsError("invalid-argument", "Manifest and verification receipt IDs are required.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const result = await db.runTransaction(async tx => {
        const [reviewSnap, manifestSnap, receiptSnap, certificationSnap, athleteSnap] =
          await Promise.all([
            tx.get(ref),
            tx.get(ref.collection("evidenceManifests").doc(manifestId)),
            tx.get(ref.collection("sourceVerificationReceipts").doc(receiptId)),
            tx.get(ref.collection("coverageCertificates").doc(manifestId)),
            tx.get(db.doc(`athletes/${athleteId}`)),
          ]);
        const review = reviewSnap.data() || {};
        const manifest = manifestSnap.data() || {};
        const receipt = receiptSnap.data() || {};
        const athleteCurrent = athleteSnap.data() || {};
        const revision = typeof review.revision === "number" ? review.revision : 1;
        const latestLocations = Array.isArray(athleteCurrent.previousLocationIds)
          ? [...new Set(athleteCurrent.previousLocationIds.map(clean).filter(Boolean))]
            .filter(id => id !== clean(athleteCurrent.locationId)).sort() : [];
        const reviewLocations = Array.isArray(review.declaredPriorLocationIds)
          ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
        const blockers: string[] = [];
        if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW")
          blockers.push("review-not-pending");
        if (JSON.stringify(latestLocations) !== JSON.stringify(reviewLocations))
          blockers.push("declared-location-history-changed");
        if (!manifestSnap.exists || manifest.kind !== "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST"
            || clean(manifest.athleteId) !== athleteId
            || normalizeDiscipline(manifest.discipline) !== discipline
            || manifest.reviewRevision !== revision) blockers.push("manifest-missing-or-stale");
        if (!receiptSnap.exists || receipt.kind !== "UNAPPROVED_SOURCE_VERIFICATION_RECEIPT"
            || clean(receipt.manifestId) !== manifestId
            || clean(receipt.athleteId) !== athleteId
            || normalizeDiscipline(receipt.discipline) !== discipline
            || receipt.reviewRevision !== revision || receipt.sourceRecordsValid !== true
            || receipt.reviewCurrent !== true) blockers.push("verified-source-receipt-required");
        // A receipt is an observation, not a live recheck. Never accept on
        // receipt validity alone. Full-scope certificates are not issued yet.
        const certified = certificationSnap.data() || {};
        const certifiedPaths = Array.isArray(certified.sourceEvidencePaths)
          ? certified.sourceEvidencePaths.map(clean).sort() : [];
        const manifestPaths = Array.isArray(manifest.records)
          ? manifest.records.map((record: Record<string, unknown>) => clean(record.skillEvidencePath)).sort() : [];
        if (!certificationSnap.exists || certified.kind !== "SERVER_CERTIFIED_FULL_HISTORY"
            || certified.reviewRevision !== revision
            || clean(certified.athleteId) !== athleteId
            || normalizeDiscipline(certified.discipline) !== discipline
            || clean(certified.manifestId) !== manifestId
            || JSON.stringify(certifiedPaths) !== JSON.stringify(manifestPaths)
            || JSON.stringify(certified.declaredPriorLocationIds) !== JSON.stringify(latestLocations))
          blockers.push("independent-full-history-certification-required");
        // Transactional source reads protect against evidence changing between
        // the previous receipt and this acceptance attempt.
        const entries: Record<string, unknown>[] = Array.isArray(manifest.records)
          ? manifest.records : [];
        if (!entries.length || entries.length > 50) {
          blockers.push("manifest-source-count-invalid-for-atomic-recheck");
        } else {
          const sourcePaths = new Set<string>();
          for (const entry of entries) {
            const practiceId = clean(entry.practiceId);
            const evidencePath = clean(entry.skillEvidencePath);
            const base = `practiceSessions/${practiceId}/athletes/${athleteId}`;
            if (!/^[a-zA-Z0-9_-]{1,160}$/.test(practiceId)
                || evidencePath.split("/").length !== 6
                || !evidencePath.startsWith(base + "/verifiedSkills/")
                || clean(entry.attendancePath) !== `attendance_sessions/${practiceId}`
                || clean(entry.athleteMemoryPath) !== base
                || sourcePaths.has(evidencePath)) {
              blockers.push("invalid-or-duplicate-atomic-source-path");
              continue;
            }
            sourcePaths.add(evidencePath);
            const [practiceSnap, attendanceSnap, memorySnap, evidenceSnap] =
              await Promise.all([
                tx.get(db.doc(`practiceSessions/${practiceId}`)),
                tx.get(db.doc(`attendance_sessions/${practiceId}`)),
                tx.get(db.doc(base)),
                tx.get(db.doc(evidencePath)),
              ]);
            const practice = practiceSnap.data() || {};
            const attendance = attendanceSnap.data() || {};
            const memory = memorySnap.data() || {};
            const evidence = evidenceSnap.data() || {};
            const scope = clean(entry.scope);
            const sourceLocation = clean(practice.locationId);
            const locationValid =
              (scope === "athlete-location" && !!clean(athleteCurrent.locationId)
                && sourceLocation === clean(athleteCurrent.locationId))
              || (scope === "athlete-academy" && !sourceLocation
                && !!clean(athleteCurrent.academyId)
                && clean(practice.academyId) === clean(athleteCurrent.academyId))
              || (scope.startsWith("prior-location:")
                && sourceLocation === scope.slice("prior-location:".length)
                && latestLocations.includes(sourceLocation))
              || (scope === "coach" && (
                (!!clean(athleteCurrent.locationId)
                  && sourceLocation === clean(athleteCurrent.locationId))
                || (!sourceLocation && !!clean(athleteCurrent.academyId)
                  && clean(practice.academyId) === clean(athleteCurrent.academyId))));
            const valid = practiceSnap.exists && locationValid
              && normalizeDiscipline(practice.discipline) === discipline
              && clean(practice.sessionDateKey) === clean(entry.sessionDateKey)
              && attendanceSnap.exists && clean(attendance.practiceId) === practiceId
              && normalizeDiscipline(attendance.discipline) === discipline
              && clean(attendance.status).toLowerCase() === "finalized"
              && attendance.finalized === true && attendanceIncludesAthlete(attendance, athleteId)
              && memorySnap.exists && clean(memory.practiceId) === practiceId
              && clean(memory.athleteId).toUpperCase() === athleteId
              && normalizeDiscipline(memory.discipline) === discipline
              && clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() === "present"
              && evidenceSnap.exists && normalizeDiscipline(evidence.discipline) === discipline
              && normalizeFamily(evidence.familyId) === clean(entry.familyId)
              && normalizeState(evidence.state) === clean(entry.state)
              && clean(evidence.coachUid) === clean(entry.coachUid)
              && evidence.verifiedAt instanceof Timestamp
              && evidence.verifiedAt.toDate().toISOString() === clean(entry.verifiedAt);
            if (!valid) blockers.push("atomic-source-recheck-failed:" + practiceId);
          }
        }
        return {accepted: false, blockers: [...new Set(blockers)].sort()};
      });
      return {ok: true, diagnosticOnly: true, kind: "TRANSFER_ACCEPTANCE_TRANSACTION",
        ...result, coverageComplete: false, evidenceApproved: false, eligibleForAuto: false};
    }

    if (action === "check-transfer-acceptance") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer acceptance checks require Admin authority.");
      }
      const snap = await db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`).get();
      const review = snap.data() || {};
      const recorded = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort()
        : [];
      const current = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort()
        : [];
      const blockers: string[] = [];
      if (!snap.exists) blockers.push("transfer-review-not-opened");
      else if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") blockers.push("transfer-review-not-pending");
      if (JSON.stringify(recorded) !== JSON.stringify(current)) blockers.push("transfer-review-stale");
      if (current.length === 0) blockers.push("no-declared-prior-locations");
      if (current.length > 10) blockers.push("prior-location-scan-limit-exceeded");
      // No durable signed coverage manifest or per-practice acceptance chain exists yet.
      // Never trust client-provided eligibility fields or previously stored booleans.
      blockers.push("verified-historical-coverage-manifest-required");
      blockers.push("verified-evidence-acceptance-chain-required");
      return {
        ok: true, diagnosticOnly: true, canAccept: false,
        blockers: [...new Set(blockers)].sort(),
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
      };
    }

    if (action === "reject-transfer-review") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer review rejection requires Admin authority.");
      }
      const reason = clean(data.reason);
      if (reason.length < 10 || reason.length > 500) {
        throw new HttpsError("invalid-argument", "Rejection reason must be 10–500 characters.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const result = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("failed-precondition", "Open a review before rejecting it.");
        const review = snap.data() || {};
        if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") {
          throw new HttpsError("failed-precondition", "Only pending reviews can be rejected.");
        }
        const recorded = Array.isArray(review.declaredPriorLocationIds)
          ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort()
          : [];
        const current = Array.isArray(athlete.previousLocationIds)
          ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
            .filter(id => id !== clean(athlete.locationId)).sort()
          : [];
        if (JSON.stringify(recorded) !== JSON.stringify(current)) {
          throw new HttpsError("failed-precondition", "Refresh stale transfer history before making a decision.");
        }
        const auditRef = ref.collection("decisions").doc();
        tx.create(auditRef, {
          action: "REJECTED", reason, actorUid: actor.uid,
          athleteId, discipline, createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(ref, {
          status: "REJECTED", rejectedReason: reason,
          decidedBy: actor.uid, decidedAt: FieldValue.serverTimestamp(),
          evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
        });
        return auditRef.id;
      });
      return { ok: true, status: "REJECTED", decisionId: result,
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
    }

    if (action === "refresh-transfer-review") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer review refresh requires Admin authority.");
      }
      const locations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort()
        : [];
      if (!locations.length || locations.length > 100) {
        throw new HttpsError("failed-precondition", "Declared transfer locations must contain 1–100 locations.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const refreshed = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) {
          throw new HttpsError("failed-precondition", "Open a transfer review before refreshing it.");
        }
        const current = snap.data() || {};
        const prior = Array.isArray(current.declaredPriorLocationIds)
          ? [...new Set(current.declaredPriorLocationIds.map(clean).filter(Boolean))].sort()
          : [];
        if (JSON.stringify(prior) === JSON.stringify(locations)) return false;
        const revision = typeof current.revision === "number" && Number.isSafeInteger(current.revision)
          && current.revision > 0 ? current.revision + 1 : 2;
        tx.update(ref, {
          declaredPriorLocationIds: locations,
          status: "PENDING_MANAGEMENT_REVIEW",
          revision,
          updatedBy: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
          evidenceApproved: false,
          coverageComplete: false,
          eligibleForAuto: false,
        });
        return true;
      });
      return { ok: true, refreshed, status: "PENDING_MANAGEMENT_REVIEW",
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
    }

    if (action === "open-transfer-review") {
      // This is an audit-only handoff, not historical evidence approval.
      // Management approval will require separate complete-coverage validation.
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Transfer review intake requires Admin authority.");
      }
      const locations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId))
        : [];
      if (!locations.length) {
        throw new HttpsError("failed-precondition", "No declared prior locations require review.");
      }
      if (locations.length > 100) {
        throw new HttpsError("failed-precondition", "Transfer location history exceeds review intake limit.");
      }
      const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const created = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) return false;
        tx.create(ref, {
          athleteId, discipline, status: "PENDING_MANAGEMENT_REVIEW",
          declaredPriorLocationIds: locations,
          createdBy: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          evidenceApproved: false,
          coverageComplete: false,
          eligibleForAuto: false,
          schemaVersion: 1,
        });
        return true;
      });
      return {
        ok: true, diagnosticOnly: true, created,
        status: "PENDING_MANAGEMENT_REVIEW",
        evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
      };
    }

    if (action === "advance-server-history-traversal") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Only Admin may advance historical traversal.");
      }
      const scope = clean(data.scope);
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const declared = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== locationId).sort() : [];
      let field = "";
      let value = "";
      if (scope === "athlete-location" && locationId) {
        field = "locationId"; value = locationId;
      } else if (scope === "athlete-academy" && academyId) {
        field = "academyId"; value = academyId;
      } else if (scope.startsWith("prior-location:") && declared.includes(scope.slice(15))) {
        field = "locationId"; value = scope.slice(15);
      } else {
        throw new HttpsError("invalid-argument", "Unauthorized or unavailable historical scope.");
      }
      const reviewRef = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const reviewSnap = await reviewRef.get();
      const review = reviewSnap.data() || {};
      const recorded = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
      if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW"
          || JSON.stringify(declared) !== JSON.stringify(recorded)) {
        throw new HttpsError("failed-precondition", "Current pending transfer review is required.");
      }
      const revision = typeof review.revision === "number" ? review.revision : 1;
      const traversalId = encodeURIComponent(scope).replace(/%/g, "_");
      const progressRef = reviewRef.collection("scopeTraversals").doc(traversalId);
      const progressSnap = await progressRef.get();
      const prior = progressSnap.data() || {};
      if (progressSnap.exists && (prior.reviewRevision !== revision
          || clean(prior.scope) !== scope || clean(prior.locationId) !== locationId
          || clean(prior.academyId) !== academyId)) {
        throw new HttpsError("failed-precondition", "Traversal context changed; start a new review.");
      }
      if (prior.exhausted === true) {
        return {ok: true, scope, alreadyExhausted: true,
          scannedCandidates: prior.scannedCandidates ?? 0,
          pagesRead: prior.pagesRead ?? 0,
          scopeExhausted: true, coverageComplete: false,
          evidenceApproved: false, eligibleForAuto: false};
      }
      const previousCursor = clean(prior.nextCursor);
      let query = db.collection("practiceSessions").where(field, "==", value)
        .orderBy(FieldPath.documentId()).limit(51);
      if (previousCursor) query = query.startAfter(previousCursor);
      const snapshot = await query.get();
      const candidates = snapshot.docs.slice(0, 50);
      const nextCursor = snapshot.size > 50 ? candidates[candidates.length - 1].id : null;
      const pageNumber = (Number(prior.pagesRead) || 0) + 1;
      const pageRef = progressRef.collection("pages").doc(String(pageNumber).padStart(8, "0"));
      const result = await db.runTransaction(async tx => {
        const [currentReview, currentAthlete, currentProgress] = await Promise.all([
          tx.get(reviewRef), tx.get(db.doc(`athletes/${athleteId}`)), tx.get(progressRef),
        ]);
        const current = currentProgress.data() || {};
        const currentReviewData = currentReview.data() || {};
        const currentAthleteData = currentAthlete.data() || {};
        const currentPrior = Array.isArray(currentAthleteData.previousLocationIds)
          ? [...new Set(currentAthleteData.previousLocationIds.map(clean).filter(Boolean))]
            .filter(id => id !== clean(currentAthleteData.locationId)).sort() : [];
        if (clean(currentReviewData.status) !== "PENDING_MANAGEMENT_REVIEW"
            || (typeof currentReviewData.revision === "number" ? currentReviewData.revision : 1) !== revision
            || JSON.stringify(currentPrior) !== JSON.stringify(declared)
            || clean(currentAthleteData.locationId) !== locationId
            || clean(currentAthleteData.academyId) !== academyId
            || clean(current.nextCursor) !== previousCursor
            || (Number(current.pagesRead) || 0) !== pageNumber - 1 || current.exhausted === true) {
          throw new HttpsError("aborted", "History traversal changed concurrently; retry.");
        }
        const total = (Number(current.scannedCandidates) || 0) + candidates.length;
        tx.create(pageRef, {
          kind: "SERVER_OBSERVED_HISTORY_SCOPE_PAGE", scope, reviewRevision: revision,
          pageNumber, inputCursor: previousCursor || null, nextCursor,
          candidateIds: candidates.map(doc => doc.id), observedAt: Timestamp.now(),
        });
        tx.set(progressRef, {kind: "SERVER_OWNED_SCOPE_TRAVERSAL",
          scope, field, value, reviewRevision: revision,
          locationId, academyId, nextCursor, pagesRead: pageNumber,
          scannedCandidates: total, exhausted: !nextCursor,
          coverageComplete: false, evidenceApproved: false, eligibleForAuto: false});
        return {pagesRead: pageNumber, scannedCandidates: total};
      });
      return {ok: true, scope, ...result, nextCursor, scopeExhausted: !nextCursor,
        coverageComplete: false, evidenceApproved: false, eligibleForAuto: false};
    }

    if (action === "verify-server-history-inventory") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Inventory verification requires Admin authority.");
      }
      const scope = clean(data.scope);
      const scopeId = encodeURIComponent(scope).replace(/%/g, "_");
      const reviewRef = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const progressRef = reviewRef.collection("scopeTraversals").doc(scopeId);
      const [reviewSnap, progressSnap] = await Promise.all([reviewRef.get(), progressRef.get()]);
      const review = reviewSnap.data() || {};
      const progress = progressSnap.data() || {};
      const expectedPrior = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== clean(athlete.locationId)).sort() : [];
      const declared = Array.isArray(review.declaredPriorLocationIds)
        ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
      const revision = typeof review.revision === "number" ? review.revision : 1;
      const blockers: string[] = [];
      if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW"
          || JSON.stringify(expectedPrior) !== JSON.stringify(declared)) blockers.push("review-not-current");
      if (!progressSnap.exists || clean(progress.scope) !== scope
          || progress.reviewRevision !== revision
          || clean(progress.locationId) !== clean(athlete.locationId)
          || clean(progress.academyId) !== clean(athlete.academyId)) blockers.push("traversal-not-current");
      if (progress.exhausted !== true) blockers.push("scope-not-exhausted");
      const field = clean(progress.field);
      const value = clean(progress.value);
      const authorized = (scope === "athlete-location" && field === "locationId"
        && !!clean(athlete.locationId) && value === clean(athlete.locationId))
        || (scope === "athlete-academy" && field === "academyId"
          && !!clean(athlete.academyId) && value === clean(athlete.academyId))
        || (scope.startsWith("prior-location:") && field === "locationId"
          && value === scope.slice("prior-location:".length) && expectedPrior.includes(value));
      if (!authorized) blockers.push("scope-not-authorized");
      const pageCount = Number(progress.pagesRead) || 0;
      if (pageCount < 1 || pageCount > 20) blockers.push("inventory-verification-page-limit");
      const inventory: Array<{practiceId: string; verifiedSkillPaths: string[]}> = [];
      if (blockers.length === 0) {
        let cursor = "";
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
          const saved = await progressRef.collection("pages")
            .doc(String(pageNumber).padStart(8, "0")).get();
          const page = saved.data() || {};
          const query = db.collection("practiceSessions").where(field, "==", value)
            .orderBy(FieldPath.documentId()).limit(51);
          const now = await (cursor ? query.startAfter(cursor) : query).get();
          const ids = now.docs.slice(0, 50).map(doc => doc.id);
          const stored = Array.isArray(page.candidateIds) ? page.candidateIds : [];
          const next = now.size > 50 ? ids[ids.length - 1] : null;
          if (!saved.exists || page.kind !== "SERVER_OBSERVED_HISTORY_SCOPE_PAGE"
              || page.reviewRevision !== revision || page.pageNumber !== pageNumber
              || clean(page.inputCursor) !== cursor
              || JSON.stringify(stored) !== JSON.stringify(ids)
              || clean(page.nextCursor) !== clean(next)) {
            blockers.push("historical-page-changed:" + pageNumber);
            break;
          }
          for (const practiceSnap of now.docs.slice(0, 50)) {
            const practice = practiceSnap.data() || {};
            if (normalizeDiscipline(practice.discipline) !== discipline) continue;
            if (scope === "athlete-academy" && clean(practice.locationId)) continue;
            const [attendanceSnap, memorySnap] = await Promise.all([
              db.doc(`attendance_sessions/${practiceSnap.id}`).get(),
              db.doc(`practiceSessions/${practiceSnap.id}/athletes/${athleteId}`).get(),
            ]);
            const attendance = attendanceSnap.data() || {};
            const memory = memorySnap.data() || {};
            const present = attendanceSnap.exists
              && clean(attendance.practiceId) === practiceSnap.id
              && normalizeDiscipline(attendance.discipline) === discipline
              && clean(attendance.status).toLowerCase() === "finalized"
              && attendance.finalized === true && attendanceIncludesAthlete(attendance, athleteId);
            const remembered = memorySnap.exists
              && clean(memory.practiceId) === practiceSnap.id
              && clean(memory.athleteId).toUpperCase() === athleteId
              && normalizeDiscipline(memory.discipline) === discipline
              && clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() === "present";
            if (present !== remembered) blockers.push("attendance-memory-mismatch:" + practiceSnap.id);
            if (!present || !remembered) continue;
            const evidence = await db.collection(`practiceSessions/${practiceSnap.id}/athletes/${athleteId}/verifiedSkills`).get();
            const paths: string[] = [];
            for (const doc of evidence.docs) {
              const skill = doc.data() || {};
              if (normalizeDiscipline(skill.discipline) !== discipline
                  || !familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
                  || !ALLOWED_STATES.includes(normalizeState(skill.state))
                  || !clean(skill.coachUid) || !(skill.verifiedAt instanceof Timestamp)) {
                blockers.push("invalid-skill-source:" + doc.ref.path);
              } else paths.push(doc.ref.path);
            }
            if (!paths.length) blockers.push("missing-verified-skill:" + practiceSnap.id);
            inventory.push({practiceId: practiceSnap.id, verifiedSkillPaths: paths.sort()});
          }
          cursor = next || "";
          if (!next && pageNumber !== pageCount) blockers.push("extra-pages-after-end");
        }
        if (cursor) blockers.push("scope-not-fully-replayed");
        if (Number(progress.scannedCandidates) !== undefined
            && Number(progress.scannedCandidates) < inventory.length) blockers.push("inventory-count-invalid");
      }
      // Read-only replay is not a consistent transaction-wide snapshot. A
      // successful replay is a useful audit result, not a coverage certificate.
      return {ok: true, kind: "SERVER_HISTORY_INVENTORY_RECHECK",
        scope, inventory, blockers: [...new Set(blockers)].sort(),
        replayMatched: blockers.length === 0, snapshotConsistent: false,
        certificateIssued: false, evidenceApproved: false,
        coverageComplete: false, eligibleForAuto: false};
    }

    if (action === "scan-history-scope-page") {
      if (normalizeStaffRole(actor.role) !== "admin") {
        throw new HttpsError("permission-denied", "Resumable history scans require Admin authority.");
      }
      const scope = clean(data.scope);
      const cursor = clean(data.cursor);
      if (cursor && !/^[a-zA-Z0-9_-]{1,160}$/.test(cursor)) {
        throw new HttpsError("invalid-argument", "Invalid history scan cursor.");
      }
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const priorLocations = Array.isArray(athlete.previousLocationIds)
        ? [...new Set(athlete.previousLocationIds.map(clean).filter(Boolean))]
          .filter(id => id !== locationId) : [];
      let field = "";
      let value = "";
      if (scope === "athlete-location" && locationId) {
        field = "locationId"; value = locationId;
      } else if (scope === "athlete-academy" && academyId) {
        field = "academyId"; value = academyId;
      } else if (scope.startsWith("prior-location:")) {
        value = scope.slice("prior-location:".length);
        if (!priorLocations.includes(value)) {
          throw new HttpsError("permission-denied", "Prior location is not declared for this athlete.");
        }
        field = "locationId";
      } else {
        throw new HttpsError("invalid-argument", "Unknown or unavailable history scope.");
      }
      // Server-controlled multi-page handoff: never trust a client assertion
      // that pages were traversed or that history is complete.
      const requestedPages = data.pages === undefined ? 1 : Number(data.pages);
      if (!Number.isInteger(requestedPages) || requestedPages < 1 || requestedPages > 3) {
        throw new HttpsError("invalid-argument", "pages must be between 1 and 3.");
      }
      const practices: Array<{practiceId: string; sessionDateKey: string; verifiedSkillCount: number}> = [];
      const blockers: string[] = [];
      let position = cursor;
      let scannedPages = 0;
      let scannedCandidates = 0;
      let exhausted = false;
      for (let page = 0; page < requestedPages; page++) {
        let query = db.collection("practiceSessions")
          .where(field, "==", value).orderBy(FieldPath.documentId()).limit(51);
        if (position) query = query.startAfter(position);
        const snapshot = await query.get();
        const candidates = snapshot.docs.slice(0, 50);
        scannedPages++;
        scannedCandidates += candidates.length;
        for (const doc of candidates) {
        const practice = doc.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline) continue;
        if (scope === "athlete-academy" && clean(practice.locationId)) continue;
        requireHistoricalPracticeReadAccess(actor, practice, locationId, academyId,
          scope.startsWith("prior-location:") ? priorLocations : []);
        const [attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`attendance_sessions/${doc.id}`).get(),
          db.doc(`practiceSessions/${doc.id}/athletes/${athleteId}`).get(),
        ]);
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        const present = attendanceSnap.exists
          && clean(attendance.practiceId) === doc.id
          && normalizeDiscipline(attendance.discipline) === discipline
          && clean(attendance.status).toLowerCase() === "finalized"
          && attendance.finalized === true
          && attendanceIncludesAthlete(attendance, athleteId);
        const memoryValid = memorySnap.exists
          && clean(memory.practiceId) === doc.id
          && clean(memory.athleteId).toUpperCase() === athleteId
          && normalizeDiscipline(memory.discipline) === discipline
          && clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() === "present";
        if (present !== memoryValid) blockers.push("attendance-memory-mismatch:" + doc.id);
        if (!present || !memoryValid) continue;
        const evidence = await db.collection(`practiceSessions/${doc.id}/athletes/${athleteId}/verifiedSkills`).get();
        if (!evidence.size) blockers.push("no-verified-skills:" + doc.id);
        practices.push({practiceId: doc.id, sessionDateKey: clean(practice.sessionDateKey),
          verifiedSkillCount: evidence.size});
        }
        const hasMore = snapshot.size > 50;
        if (!hasMore) { exhausted = true; position = ""; break; }
        position = candidates[candidates.length - 1].id;
      }
      return {ok: true, diagnosticOnly: true, scope, inputCursor: cursor || null,
        nextCursor: exhausted ? null : position,
        scopeExhausted: exhausted, scannedPages, scannedCandidates, practices,
        blockers: [...new Set(blockers)].sort(),
        coverageComplete: false, evidenceApproved: false, eligibleForAuto: false};
    }

    if (action === "reconcile-server-history-scopes" || action === "build-verified-evidence-manifest" || action === "evaluate-integrated-history-coverage") {
      // Bounded server-owned traversal (up to five pages per authorized scope).
      // A truncated scan never claims exhaustive athlete history.
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const admin = normalizeStaffRole(actor.role) === "admin";
      const buildManifest = action === "build-verified-evidence-manifest";
      const integratedCoverage = action === "evaluate-integrated-history-coverage";
      if (integratedCoverage && !admin) throw new HttpsError("permission-denied", "Integrated historical coverage review requires Admin authority.");
      if (buildManifest && !admin) throw new HttpsError("permission-denied", "Evidence manifests require Admin authority.");
      // Explicit location history is a diagnostic signal only; never expands
      // Coach read permissions without a separate authorized transfer pathway.
      const previousLocations = Array.isArray(athlete.previousLocationIds)
        ? athlete.previousLocationIds.map(clean).filter(Boolean)
        : [];
      const unresolvedTransferLocations = [...new Set(previousLocations)]
        .filter(id => id !== locationId);
      // A single callable must not fan out across an unbounded number of
      // user-declared prior locations. Remaining scopes stay unverified.
      const priorLocationScanLimit = 10;
      const priorLocationsToScan = unresolvedTransferLocations.slice(0, priorLocationScanLimit);
      const specs = [
        { scope: "coach", field: "coachUid", value: actor.uid, authorized: true },
        { scope: "athlete-location", field: "locationId", value: locationId,
          authorized: Boolean(locationId) && (admin || staffHasLocation(actor.staff, locationId)) },
        { scope: "athlete-academy", field: "academyId", value: academyId,
          authorized: Boolean(academyId) && (admin || normalizeStaffScope(actor.staff).academyIds.includes(academyId)) },
        ...priorLocationsToScan.map(id => ({
          scope: "prior-location:" + id, field: "locationId", value: id,
          authorized: admin,
        })),
      ];
      const pages: HistoryPage[] = [];
      const manifestEntries: Array<{ practiceId: string; sessionDateKey: string; scope: string; attendancePath: string; athleteMemoryPath: string; skillEvidencePath: string; familyId: string; state: string; coachUid: string; verifiedAt: string }> = [];
      const blockers = new Set<string>();
      if (unresolvedTransferLocations.length) blockers.add("prior-location-management-verification-required");
      if (unresolvedTransferLocations.length > priorLocationScanLimit) {
        blockers.add("prior-location-scan-limit-exceeded");
      }
      for (const spec of specs) {
        if (!spec.authorized) {
          blockers.add("scope-unavailable:" + spec.scope);
          continue;
        }
        let cursor = "";
        let exhausted = false;
        for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
          let query = db.collection("practiceSessions")
            .where(spec.field, "==", spec.value)
            .orderBy(FieldPath.documentId()).limit(51);
          if (cursor) query = query.startAfter(cursor);
          const snapshot = await query.get();
          const candidates = snapshot.docs.slice(0, 50);
          const history: HistoryPage["history"] = [];
          for (const doc of candidates) {
          const practice = doc.data() || {};
          if (normalizeDiscipline(practice.discipline) !== discipline) continue;
          if (spec.scope === "athlete-academy" && clean(practice.locationId)) continue;
          // Historical reads use read authorization even for the originating
          // Coach; only Skill Check writes require practice ownership.
          requireHistoricalPracticeReadAccess(
            actor, practice, locationId, academyId,
            spec.scope.startsWith("prior-location:") && admin ? unresolvedTransferLocations : []
          );
          const [attendanceSnap, memorySnap] = await Promise.all([
            db.doc(`attendance_sessions/${doc.id}`).get(),
            db.doc(`practiceSessions/${doc.id}/athletes/${athleteId}`).get(),
          ]);
          const attendance = attendanceSnap.data() || {};
          const memory = memorySnap.data() || {};
          if (attendanceSnap.exists && clean(attendance.practiceId) === doc.id
              && normalizeDiscipline(attendance.discipline) === discipline
              && clean(attendance.status).toLowerCase() === "finalized"
              && attendance.finalized === true
              && attendanceIncludesAthlete(attendance, athleteId)
              && !memorySnap.exists) {
            blockers.add("missing-athlete-session-memory:" + doc.id);
          }
          // An existing athlete memory with unresolved attendance is a
          // coverage failure, not proof that this athlete never participated.
          if (memorySnap.exists && clean(memory.athleteId).toUpperCase() === athleteId
              && normalizeDiscipline(memory.discipline) === discipline
              && (!attendanceSnap.exists
                || clean(attendance.practiceId) !== doc.id
                || clean(attendance.status).toLowerCase() !== "finalized"
                || attendance.finalized !== true
                || !attendanceIncludesAthlete(attendance, athleteId))) {
            blockers.add("unresolved-athlete-attendance:" + doc.id);
          }
          if (!attendanceSnap.exists || !memorySnap.exists
            || clean(attendance.practiceId) !== doc.id
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== doc.id
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") continue;
          const evidence = await db.collection(`practiceSessions/${doc.id}/athletes/${athleteId}/verifiedSkills`).get();
          const verifiedSkills = evidence.docs.map(item => item.data() || {})
            .filter(skill => normalizeDiscipline(skill.discipline) === discipline
              && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
              && ALLOWED_STATES.includes(normalizeState(skill.state)))
            .map(skill => ({
              familyId: normalizeFamily(skill.familyId),
              state: normalizeState(skill.state),
              coachUid: clean(skill.coachUid),
              verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
            }));
          if (!verifiedSkills.length || verifiedSkills.length !== evidence.size
            || verifiedSkills.some(skill => !skill.verifiedAt || !skill.coachUid)) {
            blockers.add("evidence-incomplete:" + doc.id);
          }
          if (buildManifest) {
            for (const skillDoc of evidence.docs) {
              const skill = skillDoc.data() || {};
              if (normalizeDiscipline(skill.discipline) !== discipline
                || !familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
                || !ALLOWED_STATES.includes(normalizeState(skill.state))
                || !clean(skill.coachUid)
                || !(skill.verifiedAt instanceof Timestamp)) continue;
              manifestEntries.push({
                practiceId: doc.id,
                sessionDateKey: clean(practice.sessionDateKey),
                scope: spec.scope,
                attendancePath: `attendance_sessions/${doc.id}`,
                athleteMemoryPath: `practiceSessions/${doc.id}/athletes/${athleteId}`,
                skillEvidencePath: skillDoc.ref.path,
                familyId: normalizeFamily(skill.familyId), state: normalizeState(skill.state),
                coachUid: clean(skill.coachUid), verifiedAt: skill.verifiedAt.toDate().toISOString(),
              });
            }
          }
          if (verifiedSkills.length) history.push({
            practiceId: doc.id, sessionDateKey: clean(practice.sessionDateKey), verifiedSkills,
          });
        }
          const hasMore = snapshot.size > 50;
          const nextCursor = hasMore ? candidates[candidates.length - 1].id : null;
          pages.push({
            athleteId, discipline, scope: spec.scope, cursor: cursor || null,
            nextCursor, scopeExhausted: !hasMore, history,
          });
          if (!hasMore) {
            exhausted = true;
            break;
          }
          cursor = nextCursor!;
        }
        if (!exhausted) blockers.add("additional-pages-required:" + spec.scope);
      }
      const summary = reconcileHistoryPages(pages, [...new Set(pages.map(page => page.scope))], athleteId, discipline);
      if (integratedCoverage) {
        const requiredScopes = specs.map(spec => {
          const scanned = pages.filter(page => page.scope === spec.scope);
          const exhausted = scanned.some(page => page.scopeExhausted);
          return {
            scope: spec.scope,
            authorized: spec.authorized,
            pagesRead: scanned.length,
            scanExhausted: exhausted,
            status: !spec.authorized ? "UNAUTHORIZED"
              : exhausted ? "SCANNED_TO_END" : "MORE_PAGES_REQUIRED",
            continuationCursor: scanned.length
              ? scanned[scanned.length - 1].nextCursor ?? null : null,
            evidencePracticeCount: new Set(scanned.flatMap(page =>
              (page.history ?? []).map(item => item.practiceId))).size,
          };
        });
        const allScopesScanned = requiredScopes.every(scope => scope.authorized && scope.scanExhausted)
          && unresolvedTransferLocations.length <= priorLocationScanLimit;
        const unresolvedBlockers = [...new Set([...summary.blockers, ...blockers])].sort();
        // Scan exhaustion is only technical discovery coverage, not proof
        // that declared locations represent the athlete's entire history.
        return {
          ok: true, diagnosticOnly: true, kind: "INTEGRATED_HISTORY_COVERAGE_REVIEW",
          athleteId, discipline, requiredScopes, allScopesScanned,
          evidencePracticeCount: new Set(pages.flatMap(page =>
            (page.history ?? []).map(item => item.practiceId))).size,
          unresolvedBlockers,
          transferHistoryAttested: false, sourceEvidenceAccepted: false,
          coverageComplete: false, evidenceApproved: false, eligibleForAuto: false,
        };
      }
      if (buildManifest) {
        const unique = new Map<string, typeof manifestEntries[number]>();
        for (const entry of manifestEntries) {
          const key = entry.skillEvidencePath;
          const existing = unique.get(key);
          if (existing && (existing.state !== entry.state || existing.verifiedAt !== entry.verifiedAt)) {
            blockers.add("conflicting-source-evidence:" + entry.practiceId);
          } else if (!existing) unique.set(key, entry);
        }
        const records = [...unique.values()].sort((a,b) => a.skillEvidencePath.localeCompare(b.skillEvidencePath));
        if (records.length > 100) throw new HttpsError("resource-exhausted", "Manifest exceeds 100 evidence entries; partitioned export is required.");
        const ref = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
        const manifestId = await db.runTransaction(async tx => {
          const reviewSnap = await tx.get(ref);
          if (!reviewSnap.exists) throw new HttpsError("failed-precondition", "Open a transfer review first.");
          const review = reviewSnap.data() || {};
          if (clean(review.status) !== "PENDING_MANAGEMENT_REVIEW") {
            throw new HttpsError("failed-precondition", "Only pending reviews can record evidence manifests.");
          }
          const recorded = Array.isArray(review.declaredPriorLocationIds)
            ? [...new Set(review.declaredPriorLocationIds.map(clean).filter(Boolean))].sort() : [];
          const current = [...unresolvedTransferLocations].sort();
          if (JSON.stringify(recorded) !== JSON.stringify(current)) {
            throw new HttpsError("failed-precondition", "Refresh stale transfer review first.");
          }
          const manifestRef = ref.collection("evidenceManifests").doc();
          tx.create(manifestRef, {
            kind: "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST",
            schemaVersion: 1, athleteId, discipline,
            reviewRevision: typeof review.revision === "number" ? review.revision : 1,
            records, blockers: [...new Set([...summary.blockers, ...blockers])].sort(),
            checkedScopes: specs.map(spec => {
              const scanned = pages.filter(page => page.scope === spec.scope);
              const exhausted = scanned.some(page => page.scopeExhausted);
              return {
                scope: spec.scope, authorized: spec.authorized,
                exhausted, pagesRead: scanned.length,
                status: !spec.authorized ? "UNAUTHORIZED"
                  : exhausted ? "BOUNDED_SCAN_EXHAUSTED" : "INCOMPLETE_PAGINATION",
                nextCursor: scanned.length ? scanned[scanned.length - 1].nextCursor ?? null : null,
              };
            }),
            createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(),
            evidenceApproved: false, coverageComplete: false, eligibleForAuto: false,
          });
          return manifestRef.id;
        });
        return { ok: true, manifestId, recordCount: records.length,
          kind: "SERVER_SOURCED_UNAPPROVED_EVIDENCE_MANIFEST",
          blockers: [...new Set([...summary.blockers, ...blockers])].sort(),
          evidenceApproved: false, coverageComplete: false, eligibleForAuto: false };
      }
      return {
        ok: true, diagnosticOnly: true, source: "server-verified-firestore",
        ...summary,
        transferCoverage: {
          priorLocationCount: unresolvedTransferLocations.length,
          priorLocationsNotScanned: Math.max(0, unresolvedTransferLocations.length - priorLocationScanLimit),
          priorLocationsVerified: false,
          priorLocationsScanned: specs.filter(spec => spec.scope.startsWith("prior-location:")
            && spec.authorized && pages.some(page => page.scope === spec.scope && page.scopeExhausted)).length,
          requiresManagementReview: unresolvedTransferLocations.length > 0,
        },
        // Explicit Management review packet: discovery never means approval.
        // Prior-location IDs and per-location findings are Admin-only.
        // Server-derived coverage snapshot for Admin inspection only.
        // This is not a signed or durable manifest and cannot authorize approval.
        coverageSnapshot: admin ? {
          kind: "UNATTESTED_SERVER_DIAGNOSTIC",
          discipline,
          scopes: specs.map(spec => {
            const scanned = pages.filter(page => page.scope === spec.scope);
            return {
              scope: spec.scope,
              authorized: spec.authorized,
              exhausted: scanned.some(page => page.scopeExhausted),
              pagesRead: scanned.length,
              evidencePracticeCount: new Set(scanned.flatMap(page =>
                (page.history ?? []).map(item => item.practiceId))).size,
            };
          }),
          unresolvedBlockers: [...new Set([...summary.blockers, ...blockers])].sort(),
          usableForAcceptance: false,
          coverageComplete: false,
        } : undefined,
        transferReview: admin ? {
          status: unresolvedTransferLocations.length ? "PENDING_MANAGEMENT_REVIEW" : "NO_DECLARED_TRANSFER",
          evidenceApproved: false,
          locations: unresolvedTransferLocations.map(id => {
            const scope = "prior-location:" + id;
            const spec = specs.find(entry => entry.scope === scope);
            const found = pages.filter(page => page.scope === scope);
            return {
              locationId: id,
              scanAuthorized: Boolean(spec?.authorized),
              scanCompleted: found.some(page => page.scopeExhausted),
              additionalPagesRequired: found.length > 0 && !found.some(page => page.scopeExhausted),
              practiceCount: new Set(found.flatMap(page => (page.history ?? []).map(item => item.practiceId))).size,
              reviewRequired: true,
            };
          }),
        } : {
          status: unresolvedTransferLocations.length ? "ADMIN_REVIEW_REQUIRED" : "NO_DECLARED_TRANSFER",
          evidenceApproved: false,
        },
        checkedScopes: specs.filter(spec => admin || !spec.scope.startsWith("prior-location:")).map(spec => ({
          scope: spec.scope,
          authorized: spec.authorized,
          pagesRead: pages.filter(page => page.scope === spec.scope).length,
          scopeExhausted: pages.some(page => page.scope === spec.scope && page.scopeExhausted),
          nextCursor: [...pages].reverse().find(page => page.scope === spec.scope)?.nextCursor ?? null,
        })),
        blockers: [...new Set([...summary.blockers, ...blockers])].sort(),
        coverageComplete: false, eligibleForAuto: false,
      };
    }

    if (action === "historical-scope-traversal") {
      // Each invocation traverses a bounded number of pages on the server.
      // Cursors are hints only; no result establishes complete athlete history.
      const scope = clean(data.scope).toLowerCase();
      if (!["coach", "athlete-location", "athlete-academy"].includes(scope)) {
        throw new HttpsError("invalid-argument", "Unsupported traversal scope.");
      }
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const admin = normalizeStaffRole(actor.role) === "admin";
      if (scope === "athlete-location" && (!locationId
          || (!admin && !staffHasLocation(actor.staff, locationId)))) {
        throw new HttpsError("permission-denied", "Location history is outside authorized scope.");
      }
      if (scope === "athlete-academy" && (!academyId
          || (!admin && !normalizeStaffScope(actor.staff).academyIds.includes(academyId)))) {
        throw new HttpsError("permission-denied", "Academy history is outside authorized scope.");
      }
      const cursor = clean(data.cursor);
      if (cursor) optionalPracticeId(cursor);
      const field = scope === "coach" ? "coachUid" : scope === "athlete-location" ? "locationId" : "academyId";
      const value = scope === "coach" ? actor.uid : scope === "athlete-location" ? locationId : academyId;
      const visited: { practiceId: string; sessionDateKey: string }[] = [];
      const history: { practiceId: string; sessionDateKey: string; verifiedSkills: {
        familyId: string; state: string; verifiedAt: string | null; coachUid: string
      }[] }[] = [];
      const evidenceBlockers = new Set<string>();
      let position = cursor;
      let exhausted = false;
      for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
        let query = db.collection("practiceSessions")
          .where(field, "==", value)
          .orderBy(FieldPath.documentId())
          .limit(51);
        if (position) query = query.startAfter(position);
        const snapshot = await query.get();
        const pageDocs = snapshot.docs.slice(0, 50);
        for (const doc of pageDocs) {
          const practice = doc.data() || {};
          if (normalizeDiscipline(practice.discipline) !== discipline) continue;
          if (scope === "athlete-academy" && clean(practice.locationId)) continue;
          requireHistoricalPracticeReadAccess(actor, practice, locationId, academyId);
          const [attendanceSnap, memorySnap] = await Promise.all([
            db.doc(`attendance_sessions/${doc.id}`).get(),
            db.doc(`practiceSessions/${doc.id}/athletes/${athleteId}`).get(),
          ]);
          const attendance = attendanceSnap.data() || {};
          const memory = memorySnap.data() || {};
          if (!attendanceSnap.exists || !memorySnap.exists
              || clean(attendance.practiceId) !== doc.id
              || normalizeDiscipline(attendance.discipline) !== discipline
              || clean(attendance.status).toLowerCase() !== "finalized"
              || attendance.finalized !== true
              || !attendanceIncludesAthlete(attendance, athleteId)
              || clean(memory.practiceId) !== doc.id
              || clean(memory.athleteId).toUpperCase() !== athleteId
              || normalizeDiscipline(memory.discipline) !== discipline
              || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") continue;
          const evidence = await db.collection(`practiceSessions/${doc.id}/athletes/${athleteId}/verifiedSkills`).get();
          if (evidence.empty) {
            evidenceBlockers.add("missing-verified-skills");
            continue;
          }
          const verifiedSkills = evidence.docs.map(item => item.data() || {})
            .filter(skill => normalizeDiscipline(skill.discipline) === discipline
              && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
              && ALLOWED_STATES.includes(normalizeState(skill.state)))
            .map(skill => ({
              familyId: normalizeFamily(skill.familyId),
              state: normalizeState(skill.state),
              coachUid: clean(skill.coachUid),
              verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
            }));
          if (verifiedSkills.length !== evidence.size || verifiedSkills.some(skill => !skill.coachUid || !skill.verifiedAt)) {
            evidenceBlockers.add("incomplete-verified-skill-evidence");
          }
          if (!verifiedSkills.length) continue;
          const sessionDateKey = clean(practice.sessionDateKey);
          visited.push({ practiceId: doc.id, sessionDateKey });
          history.push({ practiceId: doc.id, sessionDateKey, verifiedSkills });
        }
        if (snapshot.size <= 50) {
          exhausted = true;
          position = "";
          break;
        }
        position = pageDocs[pageDocs.length - 1].id;
      }
      // Reconcile only the server-fetched observations from this invocation.
      // A single scope traversal does not prove global history completeness.
      const reconciliation = reconcileHistoryPages([{
        athleteId, discipline, scope,
        cursor: cursor || null,
        nextCursor: exhausted ? null : position,
        scopeExhausted: exhausted,
        history,
      }], [scope], athleteId, discipline);
      return {
        ok: true, athleteId, discipline, scope,
        practices: visited, history, scopeExhausted: exhausted,
        reconciliation: {
          practiceCount: reconciliation.practices.length,
          skillTimelines: reconciliation.skillTimelines,
          blockers: [...new Set([
            ...reconciliation.blockers,
            ...evidenceBlockers,
            ...(exhausted ? [] : ["additional-scope-pages-required"]),
            "other-authorized-scopes-not-reconciled",
          ])].sort(),
          coverageComplete: false,
          eligibleForAuto: false,
        },
        nextCursor: exhausted ? null : position,
        diagnosticOnly: true, coverageComplete: false,
        eligibleForAuto: false,
        blockers: [
          ...(exhausted ? [] : ["further-traversal-pages-required"]),
          ...evidenceBlockers,
          "cross-scope-reconciliation-required",
          "historical-transfer-coverage-unverified",
        ],
      };
    }

    if (action === "historical-coverage-preflight") {
      // Server-owned discovery inventory. This deliberately does not claim
      // completeness from a bounded query or infer any development state.
      const locationId = clean(athlete.locationId);
      const academyId = clean(athlete.academyId);
      const admin = normalizeStaffRole(actor.role) === "admin";
      const authorizedLocation = Boolean(locationId)
        && (admin || staffHasLocation(actor.staff, locationId));
      const authorizedAcademy = Boolean(academyId)
        && (admin || normalizeStaffScope(actor.staff).academyIds.includes(academyId));
      const specifications = [
        { scope: "coach", field: "coachUid", value: actor.uid, enabled: true },
        { scope: "athlete-location", field: "locationId", value: locationId, enabled: authorizedLocation },
        { scope: "athlete-academy", field: "academyId", value: academyId, enabled: authorizedAcademy },
      ];
      const scopes = [];
      for (const spec of specifications) {
        if (!spec.enabled) {
          scopes.push({ scope: spec.scope, accessible: false, sampled: 0, morePages: null });
          continue;
        }
        const snapshot = await db.collection("practiceSessions")
          .where(spec.field, "==", spec.value)
          .orderBy(FieldPath.documentId())
          .limit(51)
          .get();
        const candidates = snapshot.docs.slice(0, 50)
          .filter(doc => normalizeDiscipline(doc.data().discipline) === discipline)
          .filter(doc => spec.scope !== "athlete-academy" || !clean(doc.data().locationId));
        scopes.push({
          scope: spec.scope, accessible: true, sampled: snapshot.size > 50 ? 50 : snapshot.size,
          matchingDisciplineSample: candidates.length,
          morePages: snapshot.size > 50,
          // This cursor is a discovery hint, not proof of coverage.
          nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null,
        });
      }
      return {
        ok: true, athleteId, discipline, diagnosticOnly: true,
        scopes, coverageComplete: false, eligibleForAuto: false,
        blockers: [
          "sampled-scope-inventory-only",
          "complete-historical-pagination-required",
          "cross-scope-evidence-reconciliation-required",
          "historical-transfers-unverified",
        ],
      };
    }

    if (action === "verify-historical-evidence-batch") {
      // Re-read authoritative Firestore records for explicitly requested
      // practices. This does not assert that other historical records do not exist.
      const ids: unknown = data.practiceIds;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20
          || ids.some(id => typeof id !== "string")) {
        throw new HttpsError("invalid-argument", "Supply 1–20 practice IDs.");
      }
      const practiceIds = ids.map(id => optionalPracticeId(id));
      if (practiceIds.some(id => !id) || new Set(practiceIds).size !== practiceIds.length) {
        throw new HttpsError("invalid-argument", "Historical practice IDs must be unique.");
      }
      const verifiedHistory = [];
      for (const practiceId of practiceIds) {
        const [practiceSnap, attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`practiceSessions/${practiceId}`).get(),
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!practiceSnap.exists || !attendanceSnap.exists || !memorySnap.exists) {
          throw new HttpsError("failed-precondition", "Historical practice evidence is missing.");
        }
        const practice = practiceSnap.data() || {};
        requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline
            || clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Historical attendance and session memory do not agree.");
        }
        const evidence = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
        if (evidence.empty) throw new HttpsError("failed-precondition", "No verified skills in historical practice.");
        const verifiedSkills = evidence.docs.map(item => item.data() || {})
          .filter(skill => normalizeDiscipline(skill.discipline) === discipline
            && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
            && ALLOWED_STATES.includes(normalizeState(skill.state)))
          .map(skill => ({
            familyId: normalizeFamily(skill.familyId),
            state: normalizeState(skill.state),
            coachUid: clean(skill.coachUid),
            verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
          }));
        if (!verifiedSkills.length) {
          throw new HttpsError("failed-precondition", "No matching verified skill observations.");
        }
        verifiedHistory.push({
          practiceId, sessionDateKey: clean(practice.sessionDateKey), verifiedSkills,
        });
      }
      const summary = reconcileHistoryPages([{
        athleteId, discipline, scope: "verified-batch",
        cursor: null, nextCursor: null, scopeExhausted: true,
        history: verifiedHistory,
      }], ["verified-batch"], athleteId, discipline);
      return {
        ok: true, diagnosticOnly: true, source: "server-verified-firestore",
        ...summary, coverageComplete: false, eligibleForAuto: false,
        blockers: [...new Set([...summary.blockers,
          "explicit-practice-batch-does-not-prove-complete-history"])].sort(),
      };
    }

    if (action === "reconcile-verified-history-preview") {
      // Diagnostic only: caller-provided discovery pages are untrusted and
      // cannot authorize curriculum, progression or XP changes.
      const rawPages: unknown = data.pages;
      const rawScopes: unknown = data.scopes;
      if (!Array.isArray(rawPages) || rawPages.length > 100
          || !Array.isArray(rawScopes) || rawScopes.length > 3
          || rawScopes.some(scope => !["coach", "athlete-location", "athlete-academy"].includes(scope))
          || new Set(rawScopes).size !== rawScopes.length) {
        throw new HttpsError("invalid-argument", "Invalid reconciliation preview inputs.");
      }
      const pages: HistoryPage[] = [];
      for (const raw of rawPages) {
        if (!raw || typeof raw !== "object") {
          throw new HttpsError("invalid-argument", "Invalid history page.");
        }
        const page = raw as Record<string, unknown>;
        if (typeof page.scope !== "string"
            || !rawScopes.includes(page.scope)
            || page.athleteId !== athleteId || page.discipline !== discipline
            || typeof page.scopeExhausted !== "boolean"
            || !Array.isArray(page.history) || page.history.length > 50
            || page.history.some((item: unknown) => {
              if (!item || typeof item !== "object") return true;
              const entry = item as Record<string, unknown>;
              return typeof entry.practiceId !== "string"
                || typeof entry.sessionDateKey !== "string"
                || !Array.isArray(entry.verifiedSkills)
                || entry.verifiedSkills.length > 100
                || entry.verifiedSkills.some((skill: unknown) => {
                  if (!skill || typeof skill !== "object") return true;
                  const value = skill as Record<string, unknown>;
                  return typeof value.familyId !== "string"
                    || typeof value.state !== "string"
                    || typeof value.coachUid !== "string"
                    || (value.verifiedAt !== null && typeof value.verifiedAt !== "string");
                });
            })) {
          throw new HttpsError("invalid-argument", "History preview page mismatch.");
        }
        pages.push(page as unknown as HistoryPage);
      }
      const summary = reconcileHistoryPages(pages, rawScopes as string[], athleteId, discipline);
      return {
        ok: true,
        diagnosticOnly: true,
        ...summary,
        // These inputs are supplied by the client rather than re-fetched
        // from Firestore; they are never verified source-of-truth evidence.
        coverageComplete: false,
        eligibleForAuto: false,
        blockers: [...new Set([...summary.blockers, "client-supplied-pages-untrusted"])].sort(),
      };
    }

    if (action === "discover-verified-practices") {
      // Deterministic, cursor-paged discovery within the requesting Coach's
      // scope. Exhaustive history remains unproven until cross-Coach
      // discovery, page traversal, and chronology are reconciled.
      const cursor = clean(data.cursor);
      if (cursor) optionalPracticeId(cursor);
      const pageSize = 50;
      const scope = clean(data.scope).toLowerCase() || "coach";
      if (!["coach", "athlete-location", "athlete-academy"].includes(scope)) {
        throw new HttpsError("invalid-argument", "Unsupported history scope.");
      }
      const athleteLocationId = clean(athlete.locationId);
      const athleteAcademyId = clean(athlete.academyId);
      if (scope === "athlete-academy" && (!athleteAcademyId
          || (normalizeStaffRole(actor.role) !== "admin"
            && !normalizeStaffScope(actor.staff).academyIds.includes(athleteAcademyId)))) {
        throw new HttpsError("permission-denied", "Athlete academy is not authorized for historical discovery.");
      }
      if (scope === "athlete-location" && (!athleteLocationId
          || (normalizeStaffRole(actor.role) !== "admin"
            && !staffHasLocation(actor.staff, athleteLocationId)))) {
        throw new HttpsError("permission-denied", "Athlete location is not authorized for historical discovery.");
      }
      let query = db.collection("practiceSessions")
        .where(scope === "coach" ? "coachUid" : scope === "athlete-location" ? "locationId" : "academyId", "==",
          scope === "coach" ? actor.uid : scope === "athlete-location" ? athleteLocationId : athleteAcademyId)
        .orderBy(FieldPath.documentId())
        .limit(pageSize + 1);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const hasMore = page.size > pageSize;
      const candidates = page.docs.slice(0, pageSize);
      const nextCursor = hasMore ? candidates[candidates.length - 1].id : null;
      const includeEvidence = data.includeEvidence === true;
      const matching: { practiceId: string; sessionDateKey: string }[] = [];
      const history: { practiceId: string; sessionDateKey: string; verifiedSkills: { familyId: string; state: string; verifiedAt: string | null; coachUid: string }[] }[] = [];
      for (const candidate of candidates) {
        const practiceId = candidate.id;
        const practice = candidate.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline) continue;
        if (scope === "athlete-academy" && clean(practice.locationId)) continue;
        if (scope === "athlete-location") {
          requireHistoricalPracticeReadAccess(actor, practice, athleteLocationId, athleteAcademyId);
        } else if (scope === "athlete-academy") {
          // Legacy academy-only records are accepted only when their location
          // is absent and the actor has explicit academy access.
          if (clean(practice.locationId) || clean(practice.academyId) !== athleteAcademyId
              || (normalizeStaffRole(actor.role) !== "admin"
                && !normalizeStaffScope(actor.staff).academyIds.includes(athleteAcademyId))) {
            throw new HttpsError("permission-denied", "Legacy practice academy is outside authorized scope.");
          }
        } else {
          requirePracticeVerificationAccess(actor, practice);
        }
        const [attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!attendanceSnap.exists || !memorySnap.exists) continue;
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") continue;
        const verified = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`)
          .get();
        if (verified.empty) continue;
        const sessionDateKey = clean(practice.sessionDateKey);
        matching.push({ practiceId, sessionDateKey });
        if (includeEvidence) {
          history.push({
            practiceId,
            sessionDateKey,
            verifiedSkills: verified.docs.map(docSnap => docSnap.data() || {})
              .filter(skill => normalizeDiscipline(skill.discipline) === discipline
                && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
                && ALLOWED_STATES.includes(normalizeState(skill.state)))
              .map(skill => ({
                familyId: normalizeFamily(skill.familyId),
                state: normalizeState(skill.state),
                verifiedAt: skill.verifiedAt instanceof Timestamp ? skill.verifiedAt.toDate().toISOString() : null,
                coachUid: clean(skill.coachUid),
              })),
          });
        }
      }
      // A deterministic evidence inventory only; conflicting states are never
      // silently reduced to a presumed mastery level or a latest progression.
      const families = new Map<string, { states: Set<string>; observations: number }>();
      for (const practice of history) {
        for (const skill of practice.verifiedSkills) {
          const previous = families.get(skill.familyId) || { states: new Set<string>(), observations: 0 };
          previous.states.add(skill.state);
          previous.observations += 1;
          families.set(skill.familyId, previous);
        }
      }
      const familyEvidence = [...families.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([familyId, record]) => ({
          familyId,
          states: [...record.states].sort(),
          observations: record.observations,
          conflictingStates: record.states.size > 1,
          // Partial historical coverage cannot establish the current state,
          // even when all sampled observations happen to agree.
          currentState: null,
          progressionStatus: record.states.size > 1 ? "conflicting-history" : "incomplete-history",
          eligibleForAuto: false,
        }));
      const chronologyComplete = history.length > 0 && history.every(practice => {
        const date = practice.sessionDateKey;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
          || Number.isNaN(Date.parse(date + "T00:00:00.000Z"))
          || new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) !== date) {
          return false;
        }
        return practice.verifiedSkills.length > 0
          && practice.verifiedSkills.every(skill => Boolean(skill.verifiedAt)
            && !Number.isNaN(Date.parse(skill.verifiedAt as string)));
      });
      const progressionAssessment = {
        status: familyEvidence.some(item => item.conflictingStates)
          ? "requires-evidence-reconciliation" : "requires-complete-history",
        evaluatedAthleteCount: 1,
        historyExhaustive: false,
        chronologyComplete,
        autoEligible: false,
        reason: "Historical discovery is bounded and has no verified chronology for current skill state.",
      };
      return {
        ok: true, athleteId, discipline, practiceIds: matching.map(item => item.practiceId),
        practices: matching, scanned: candidates.length,
        scope, cursor: cursor || null, nextCursor, pageComplete: true,
        scopeExhausted: !hasMore,
        coverageComplete: false,
        coverageBlockers: [
          ...(hasMore ? ["additional-pages-required"] : []),
          "cross-scope-reconciliation-required",
          "historical-transfer-coverage-unverified",
          "historical-chronology-unresolved",
        ],
        coachScopeExhausted: scope === "coach" && !hasMore,
        ...(includeEvidence ? { history, familyEvidence, progressionAssessment } : {}),
        exhaustive: false,
        // Callers must not infer athlete mastery from this partial search.
        evidenceReadyForAuto: false,
        limitation: "Each discovery scope is separately paginated, and only athlete-location or explicitly authorized legacy academy-only records are eligible. Scope overlap, transfers, unindexed practices, and chronological state resolution remain unproven."
      };
    }

    if (action === "load-verified-history") {
      // Explicit practice IDs prevent unbounded collection-group searches and
      // require authorization, finalized attendance, and matching session memory
      // separately for every historical record.
      const practiceIds = Array.isArray(data.practiceIds) ? data.practiceIds : [];
      if (!practiceIds.length || practiceIds.length > 20) {
        throw new HttpsError("invalid-argument", "Supply 1–20 historical practice IDs.");
      }
      const uniqueIds = [...new Set(practiceIds.map(optionalPracticeId))];
      if (uniqueIds.length !== practiceIds.length || uniqueIds.some(id => !id)) {
        throw new HttpsError("invalid-argument", "Historical practice IDs must be unique and valid.");
      }
      const history = [];
      for (const practiceId of uniqueIds) {
        const [practiceSnap, attendanceSnap, memorySnap] = await Promise.all([
          db.doc(`practiceSessions/${practiceId}`).get(),
          db.doc(`attendance_sessions/${practiceId}`).get(),
          db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get(),
        ]);
        if (!practiceSnap.exists || !attendanceSnap.exists || !memorySnap.exists) {
          throw new HttpsError("failed-precondition", "Historical evidence is incomplete.");
        }
        const practice = practiceSnap.data() || {};
        requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
        const attendance = attendanceSnap.data() || {};
        const memory = memorySnap.data() || {};
        if (normalizeDiscipline(practice.discipline) !== discipline
            || clean(attendance.practiceId) !== practiceId
            || normalizeDiscipline(attendance.discipline) !== discipline
            || clean(attendance.status).toLowerCase() !== "finalized"
            || attendance.finalized !== true
            || !attendanceIncludesAthlete(attendance, athleteId)
            || clean(memory.practiceId) !== practiceId
            || clean(memory.athleteId).toUpperCase() !== athleteId
            || normalizeDiscipline(memory.discipline) !== discipline
            || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Historical practice verification is inconsistent.");
        }
        const snap = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
        history.push({
          practiceId,
          verifiedSkills: snap.docs.map(docSnap => docSnap.data() || {})
            .filter(skill => normalizeDiscipline(skill.discipline) === discipline
              && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId))
              && ALLOWED_STATES.includes(normalizeState(skill.state)))
            .map(skill => ({
              familyId: normalizeFamily(skill.familyId),
              state: normalizeState(skill.state),
              coachUid: clean(skill.coachUid),
              verifiedAt: skill.verifiedAt || null,
            })),
        });
      }
      return { ok: true, athleteId, discipline, history };
    }

    if (action === "load-verified-practice") {
      const practiceId = optionalPracticeId(data.practiceId);
      if (!practiceId) {
        throw new HttpsError("invalid-argument", "A practiceId is required for verified evidence.");
      }
      const practiceSnap = await db.doc(`practiceSessions/${practiceId}`).get();
      if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
      const practice = practiceSnap.data() || {};
      requireHistoricalPracticeReadAccess(actor, practice, clean(athlete.locationId), clean(athlete.academyId));
      if (normalizeDiscipline(practice.discipline) !== discipline) {
        throw new HttpsError("failed-precondition", "Practice discipline does not match the requested evidence.");
      }
      const attendanceSnap = await db.doc(`attendance_sessions/${practiceId}`).get();
      const attendance = attendanceSnap.data() || {};
      if (!attendanceSnap.exists || clean(attendance.practiceId) !== practiceId
          || normalizeDiscipline(attendance.discipline) !== discipline
          || clean(attendance.status).toLowerCase() !== "finalized"
          || attendance.finalized !== true || !attendanceIncludesAthlete(attendance, athleteId)) {
        throw new HttpsError("failed-precondition", "Finalized attendance for this athlete is required.");
      }
      const memorySnap = await db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`).get();
      const memory = memorySnap.data() || {};
      if (!memorySnap.exists || clean(memory.practiceId) !== practiceId
          || clean(memory.athleteId).toUpperCase() !== athleteId
          || normalizeDiscipline(memory.discipline) !== discipline
          || clean((memory.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
        throw new HttpsError("failed-precondition", "Matching athlete-session memory is required.");
      }
      const verifiedSnap = await db.collection(`practiceSessions/${practiceId}/athletes/${athleteId}/verifiedSkills`).get();
      return {
        ok: true, practiceId, athleteId, discipline,
        verifiedSkills: verifiedSnap.docs
          .map(docSnap => docSnap.data() || {})
          .filter(skill => normalizeDiscipline(skill.discipline) === discipline
            && familiesForDiscipline(discipline).includes(normalizeFamily(skill.familyId)))
          .map(skill => ({
            familyId: normalizeFamily(skill.familyId),
            state: normalizeState(skill.state),
            coachUid: clean(skill.coachUid),
            verifiedAt: skill.verifiedAt || null
          }))
      };
    }

    if (action === "load") {
      const snap = await db
        .collection("athletes")
        .doc(athleteId)
        .collection("skills")
        .get();

      return {
        ok: true,
        athlete: {
          id: athleteId,
          name:
            clean(athlete.publicName) ||
            clean(athlete.fullName) ||
            clean(athlete.name) ||
            athleteId,
          tier:
            clean(athlete.tier) ||
            clean(athlete.progressionTier),
          rankName:
            clean(athlete.rankName) ||
            clean(athlete.tierName),
          journey:
            clean(athlete.journey) ||
            clean(athlete.program) ||
            clean(athlete.track),
        },
        discipline,
        skills: Array.from(
          snap.docs.reduce((map, docSnap) => {
            const skillData =
              docSnap.data() || {};

            const docDiscipline =
              skillDocDiscipline(
                docSnap.id,
                skillData
              );

            if (docDiscipline !== discipline) {
              return map;
            }

            const familyId =
              skillDocFamilyId(
                docSnap.id,
                skillData
              );

            const isCanonical =
              docSnap.id ===
              `${discipline}__${familyId}`;

            const existing =
              map.get(familyId);

            if (!existing || isCanonical) {
              map.set(familyId, {
                id: docSnap.id,
                ...skillData,
                familyId,
                discipline: docDiscipline,
              });
            }

            return map;
          }, new Map<string, Record<string, unknown>>())
          .values()
        ),
      };
    }

    if (action !== "save") {
      throw new HttpsError(
        "invalid-argument",
        "Unsupported Skill Check action."
      );
    }

    const familyId =
      normalizeFamily(data.familyId);

    const allowedFamilies =
      familiesForDiscipline(discipline);

    if (!allowedFamilies.includes(familyId)) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown ${discipline} skill family.`
      );
    }

    const state =
      normalizeState(data.state);
    const practiceId = optionalPracticeId(data.practiceId);

    if (!ALLOWED_STATES.includes(
      state as typeof ALLOWED_STATES[number]
    )) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid development state."
      );
    }

    const ref = db.doc(
      `athletes/${athleteId}/skills/${discipline}__${familyId}`
    );

    const record = {
      familyId,
      discipline,
      state,
      needsReview: data.needsReview === true,

      name: clean(data.name) || familyId,

      lastJourney: clean(data.lastJourney),
      lastTier: clean(data.lastTier),
      lastCard: clean(data.lastCard),
      lastCardHref: clean(data.lastCardHref),

      coachUid: req.auth.uid,
      coachNotes: clean(data.coachNotes),

      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!practiceId) {
      await ref.set(record, { merge: true });
    } else {
      const practiceRef = db.doc(`practiceSessions/${practiceId}`);
      const attendanceRef = db.doc(`attendance_sessions/${practiceId}`);
      const athleteSessionRef = db.doc(`practiceSessions/${practiceId}/athletes/${athleteId}`);
      const verificationRef = athleteSessionRef.collection("verifiedSkills").doc(`${discipline}__${familyId}`);

      await db.runTransaction(async (tx) => {
        const [practiceSnap, attendanceSnap, athleteSessionSnap, verificationSnap] = await Promise.all([
          tx.get(practiceRef),
          tx.get(attendanceRef),
          tx.get(athleteSessionRef),
          tx.get(verificationRef),
        ]);
        if (!practiceSnap.exists) throw new HttpsError("not-found", "Practice not found.");
        const practice = practiceSnap.data() || {};
        requirePracticeVerificationAccess(actor, practice);
        const practiceDiscipline = normalizeDiscipline(practice.discipline);
        if (practiceDiscipline !== discipline) {
          throw new HttpsError("failed-precondition", "Skill Check discipline must match the practice discipline.");
        }

        if (!attendanceSnap.exists) throw new HttpsError("failed-precondition", "Finalized practice attendance is required.");
        const attendance = attendanceSnap.data() || {};
        if (clean(attendance.practiceId) !== practiceId
          || clean(attendance.status).toLowerCase() !== "finalized"
          || attendance.finalized !== true
          || normalizeDiscipline(attendance.discipline) !== discipline
          || !attendanceIncludesAthlete(attendance, athleteId)) {
          throw new HttpsError("failed-precondition", "Athlete must be present in finalized attendance for this practice.");
        }

        if (!athleteSessionSnap.exists) {
          throw new HttpsError("failed-precondition", "Finalized athlete-session memory is required.");
        }
        const athleteSession = athleteSessionSnap.data() || {};
        if (clean(athleteSession.practiceId) !== practiceId
          || clean(athleteSession.athleteId).toUpperCase() !== athleteId
          || normalizeDiscipline(athleteSession.discipline) !== discipline
          || clean((athleteSession.attendance as Record<string, unknown> | undefined)?.status).toLowerCase() !== "present") {
          throw new HttpsError("failed-precondition", "Athlete-session memory does not match this verification.");
        }

        tx.set(ref, record, { merge: true });
        const existing = verificationSnap.data() || {};
        const identical = verificationSnap.exists
          && clean(existing.skillId) === familyId
          && normalizeFamily(existing.familyId) === familyId
          && normalizeDiscipline(existing.discipline) === discipline
          && normalizeState(existing.state) === state
          && clean(existing.coachUid) === actor.uid;
        if (!identical) {
          tx.set(verificationRef, {
            skillId: familyId,
            familyId,
            discipline,
            state,
            coachUid: actor.uid,
            verifiedAt: FieldValue.serverTimestamp(),
            sourceVersion: 1,
          });
        }
      });
    }

    return {
      ok: true,
      athleteId,
      discipline,
      familyId,
      state,
      needsReview: record.needsReview,
      ...(practiceId ? { practiceId } : {}),
    };
  });
