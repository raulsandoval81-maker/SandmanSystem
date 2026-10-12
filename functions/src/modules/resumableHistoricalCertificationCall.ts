import {FieldPath, FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {normalizeStaffRole, requireActiveStaff} from "../services/staffAuthorization";
import {
  LARGE_HISTORY_MAX_PAGES,
  LARGE_HISTORY_PAGE_SIZE,
  LARGE_HISTORY_SCHEMA_VERSION,
  compareHistoricalPasses,
  createHistoricalChainPage,
  historicalChainHash,
  resolveHistoricalSkillStates,
  verifyHistoricalPageChain,
  type HistoricalChainPage,
  type HistoricalInventoryRecord,
} from "./resumableHistoricalCertification";

const db = getFirestore();
const ADMIN_ROLES = ["admin", "system_admin"];
const STATES = new Set(["NOT_INTRODUCED", "LEARNED", "APPLIED", "MASTERED", "REFINED"]);

function clean(value: unknown): string { return String(value ?? "").trim(); }
function disciplineId(value: unknown): string {
  const normalized = clean(value).toLowerCase().replace(/[\s_]+/g, "-");
  return ["kickboxing", "kick-boxing", "muaythai"].includes(normalized) ? "muay-thai" : normalized;
}
function documentId(value: unknown, field: string): string {
  const result = clean(value);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(result)) throw new HttpsError("invalid-argument", field + " is invalid.");
  return result;
}
function attendanceIncludes(record: Record<string, unknown>, athleteId: string): boolean {
  const ids = Array.isArray(record.presentIds) ? record.presentIds.map(item => clean(item).toUpperCase()) : [];
  const present = Array.isArray(record.present) ? record.present : [];
  return ids.includes(athleteId) || present.some(item => item && typeof item === "object"
    && clean((item as Record<string,unknown>).id || (item as Record<string,unknown>).uid).toUpperCase() === athleteId);
}

type Scope = {scopeId:string; kind:"location"|"academy"; value:string; origins:string[]};

async function deriveScopes(tx: FirebaseFirestore.Transaction, athleteId: string, discipline: string) {
  // Keep transaction reads strictly ordered. The Firestore emulator can close a
  // transaction when document and query reads are issued concurrently.
  const athleteSnap = await tx.get(db.doc(`athletes/${athleteId}`));
  const revisionSnap = await tx.get(db.doc(`athletes/${athleteId}/historyRevisions/${discipline}`));
  const assignments = await tx.get(db.collection("athleteCrossTrainingAssignments")
    .where("athleteId", "==", athleteId).limit(101));
  if (!athleteSnap.exists) throw new HttpsError("not-found", "Athlete not found.");
  const athlete = athleteSnap.data() || {};
  const revision = Number(revisionSnap.data()?.revision);
  if (!revisionSnap.exists || !Number.isSafeInteger(revision) || revision < 1)
    throw new HttpsError("failed-precondition", "Tracked historical source revision required.");
  if (assignments.size > 100) throw new HttpsError("resource-exhausted", "Too many cross-training assignments for one certification run.");
  const scopes = new Map<string, Scope>();
  const add = (kind: Scope["kind"], value: unknown, origin: string) => {
    const normalized = clean(value);
    if (!normalized) return;
    const scopeId = `${kind}:${normalized}`;
    const prior = scopes.get(scopeId);
    scopes.set(scopeId, {scopeId,kind,value:normalized,
      origins:[...new Set([...(prior?.origins || []),origin])].sort()});
  };
  add("location", athlete.locationId, "current-location");
  add("academy", athlete.academyId, "current-academy");
  const previous = Array.isArray(athlete.previousLocationIds) ? athlete.previousLocationIds : [];
  if (previous.length > 100) throw new HttpsError("resource-exhausted", "More than 100 historical locations require manual partition review.");
  previous.forEach(value => add("location", value, "declared-prior-location"));
  const assignmentIdentity: Record<string,unknown>[] = [];
  assignments.docs.forEach(doc => {
    const assignment = doc.data() || {};
    const disciplines = Array.isArray(assignment.disciplineIds)
      ? assignment.disciplineIds.map(disciplineId) : [];
    if (!disciplines.includes(discipline)) return;
    add("location", assignment.hostLocationId, "cross-training-host");
    add("location", assignment.homeLocationId, "cross-training-home");
    assignmentIdentity.push({assignmentId:doc.id,homeLocationId:clean(assignment.homeLocationId),
      hostLocationId:clean(assignment.hostLocationId),disciplineIds:disciplines.sort(),
      status:clean(assignment.status),activeFrom:assignment.activeFrom instanceof Timestamp
        ? assignment.activeFrom.toDate().toISOString() : null,
      activeTo:assignment.activeTo instanceof Timestamp
        ? assignment.activeTo.toDate().toISOString() : null});
  });
  const scopeInventory = [...scopes.values()].sort((a,b) => a.scopeId.localeCompare(b.scopeId));
  if (!scopeInventory.length) throw new HttpsError("failed-precondition", "At least one historical source scope is required.");
  const scopeFingerprint = historicalChainHash({scopeInventory,
    assignments:assignmentIdentity.sort((a,b) => clean(a.assignmentId).localeCompare(clean(b.assignmentId)))});
  return {athlete, revision, scopeInventory, scopeFingerprint};
}

function sourceScope(practice: Record<string,unknown>, scopes: Scope[]): string {
  const location = clean(practice.locationId);
  const academy = clean(practice.academyId);
  if (location && scopes.some(scope => scope.kind === "location" && scope.value === location)) return `location:${location}`;
  if (!location && academy && scopes.some(scope => scope.kind === "academy" && scope.value === academy)) return `academy:${academy}`;
  return "";
}

async function readInventoryPage(tx: FirebaseFirestore.Transaction, input: {
  athleteId:string; discipline:string; cursor:string; scopes:Scope[];
}) {
  let query = db.collection("attendance_sessions")
    .where("presentIds", "array-contains", input.athleteId)
    .orderBy(FieldPath.documentId()).limit(LARGE_HISTORY_PAGE_SIZE + 1);
  if (input.cursor) query = query.startAfter(input.cursor);
  const snapshot = await tx.get(query);
  const docs = snapshot.docs.slice(0, LARGE_HISTORY_PAGE_SIZE);
  const hasMore = snapshot.size > LARGE_HISTORY_PAGE_SIZE;
  const records: HistoricalInventoryRecord[] = [];
  const blockers: string[] = [];
  for (const attendanceDoc of docs) {
    const attendance = attendanceDoc.data() || {};
    if (disciplineId(attendance.discipline) !== input.discipline) continue;
    const practiceId = attendanceDoc.id;
    const base = `practiceSessions/${practiceId}/athletes/${input.athleteId}`;
    const practiceSnap = await tx.get(db.doc(`practiceSessions/${practiceId}`));
    const memorySnap = await tx.get(db.doc(base));
    const evidenceSnap = await tx.get(db.collection(base + "/verifiedSkills")
      .orderBy(FieldPath.documentId()).limit(101));
    const practice = practiceSnap.data() || {};
    const memory = memorySnap.data() || {};
    const scopeId = sourceScope(practice, input.scopes);
    if (!practiceSnap.exists || attendance.finalized !== true
        || clean(attendance.status).toLowerCase() !== "finalized"
        || !attendanceIncludes(attendance, input.athleteId)
        || clean(attendance.practiceId || practiceId) !== practiceId
        || !memorySnap.exists || clean(memory.practiceId) !== practiceId
        || clean(memory.athleteId).toUpperCase() !== input.athleteId
        || disciplineId(memory.discipline) !== input.discipline
        || clean((memory.attendance as Record<string,unknown> | undefined)?.status).toLowerCase() !== "present"
        || disciplineId(practice.discipline) !== input.discipline || !scopeId) {
      blockers.push("source-record-invalid:" + practiceId);
      continue;
    }
    if (evidenceSnap.size > 100) {
      blockers.push("practice-evidence-limit-exceeded:" + practiceId);
      continue;
    }
    const observations = evidenceSnap.docs.map(doc => {
      const evidence = doc.data() || {};
      const familyId = clean(evidence.familyId);
      const state = clean(evidence.state).toUpperCase();
      if (disciplineId(evidence.discipline) !== input.discipline || !familyId
          || !STATES.has(state) || !clean(evidence.coachUid)
          || !(evidence.verifiedAt instanceof Timestamp)) {
        blockers.push("verified-evidence-invalid:" + doc.ref.path);
      }
      return {evidencePath:doc.ref.path,familyId,state,coachUid:clean(evidence.coachUid),
        verifiedAt:evidence.verifiedAt instanceof Timestamp ? evidence.verifiedAt.toDate().toISOString() : ""};
    }).sort((a,b) => a.evidencePath.localeCompare(b.evidencePath));
    if (new Set(observations.map(item => item.familyId)).size !== observations.length)
      blockers.push("duplicate-practice-family:" + practiceId);
    records.push({practiceId,practicePath:`practiceSessions/${practiceId}`,
      attendancePath:attendanceDoc.ref.path,athleteMemoryPath:base,
      sessionDateKey:clean(practice.sessionDateKey),discipline:input.discipline,
      locationId:clean(practice.locationId),academyId:clean(practice.academyId),scopeId,observations});
  }
  return {records,blockers:[...new Set(blockers)].sort(),
    cursorAfter:docs.length ? docs[docs.length-1].id : input.cursor,
    exhausted:!hasMore, scannedAttendanceCount:docs.length};
}

export const resumableHistoricalCertificationCall = onCall(async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const actor = await requireActiveStaff(request.auth.uid, ADMIN_ROLES, "Active Admin authority required.");
  if (normalizeStaffRole(actor.role) !== "admin") throw new HttpsError("permission-denied", "Admin authority required.");
  const data = request.data || {};
  const action = clean(data.action);
  const athleteId = documentId(data.athleteId, "athleteId").toUpperCase();
  const discipline = disciplineId(data.discipline);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(discipline)) throw new HttpsError("invalid-argument", "discipline is invalid.");

  if (action === "open") {
    const runRef = db.collection(`athletes/${athleteId}/largeHistoryCertificationRuns`).doc();
    const result = await db.runTransaction(async tx => {
      const reviewRef = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
      const reviewSnap = await tx.get(reviewRef);
      const review = reviewSnap.data() || {};
      if (!reviewSnap.exists || clean(review.status) !== "PENDING_MANAGEMENT_REVIEW")
        throw new HttpsError("failed-precondition", "Open a pending historical review first.");
      const scope = await deriveScopes(tx, athleteId, discipline);
      const openedAt = Timestamp.now();
      tx.create(runRef, {kind:"LARGE_HISTORY_CERTIFICATION_RUN",schemaVersion:LARGE_HISTORY_SCHEMA_VERSION,
        athleteId,discipline,reviewRevision:Number(review.revision || 1),sourceRevision:scope.revision,
        scopeInventory:scope.scopeInventory,scopeFingerprint:scope.scopeFingerprint,
        phase:"INVENTORY",status:"PENDING",inventorySequence:0,inventoryCursor:"",
        inventoryPreviousHash:"GENESIS",inventoryExhausted:false,
        reconciliationSequence:0,reconciliationCursor:"",reconciliationPreviousHash:"GENESIS",
        reconciliationExhausted:false,openedBy:actor.uid,openedAt,updatedAt:openedAt,
        evidenceApproved:false,coverageComplete:false,eligibleForAuto:false});
      return {runId:runRef.id,sourceRevision:scope.revision,scopeCount:scope.scopeInventory.length};
    });
    return {ok:true,...result,status:"PENDING",eligibleForAuto:false};
  }

  const runId = documentId(data.runId, "runId");
  const runRef = db.doc(`athletes/${athleteId}/largeHistoryCertificationRuns/${runId}`);
  if (action === "get") {
    const snap = await runRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Certification run not found.");
    const run = snap.data() || {};
    return {ok:true,runId,status:run.status,phase:run.phase,
      inventorySequence:run.inventorySequence,reconciliationSequence:run.reconciliationSequence,
      inventoryExhausted:run.inventoryExhausted,reconciliationExhausted:run.reconciliationExhausted,
      sourceRevision:run.sourceRevision,coverageComplete:run.status === "CERTIFIED",
      evidenceApproved:false,eligibleForAuto:false};
  }

  if (action === "advance-inventory" || action === "advance-reconciliation") {
    const phase = action === "advance-inventory" ? "inventory" : "reconciliation";
    const expectedSequence = Number(data.expectedSequence);
    if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 0)
      throw new HttpsError("invalid-argument", "expectedSequence is required.");
    const result = await db.runTransaction(async tx => {
      const runSnap = await tx.get(runRef);
      if (!runSnap.exists) throw new HttpsError("not-found", "Certification run not found.");
      const run = runSnap.data() || {};
      if (run.athleteId !== athleteId || run.discipline !== discipline
          || run.schemaVersion !== LARGE_HISTORY_SCHEMA_VERSION)
        throw new HttpsError("failed-precondition", "Certification run identity mismatch.");
      if (run.status !== "PENDING" || (phase === "inventory" && run.phase !== "INVENTORY")
          || (phase === "reconciliation" && run.phase !== "RECONCILIATION"))
        throw new HttpsError("failed-precondition", "Certification run is not in the requested phase.");
      const sequence = Number(run[phase + "Sequence"] || 0);
      if (sequence === expectedSequence + 1) {
        const priorPage = await tx.get(runRef.collection(phase === "inventory"
          ? "inventoryPages" : "reconciliationPages").doc(String(expectedSequence).padStart(6,"0")));
        if (!priorPage.exists) throw new HttpsError("failed-precondition", "Retry checkpoint page is missing.");
        const prior = priorPage.data() || {};
        return {blocked:false,idempotent:true,sequence:expectedSequence,pageHash:prior.pageHash,
          records:prior.verifiedRecordCount,evidence:prior.evidenceCount,exhausted:prior.exhausted};
      }
      if (sequence !== expectedSequence)
        throw new HttpsError("aborted", "Certification checkpoint advanced; reload the run before continuing.");
      const scope = await deriveScopes(tx, athleteId, discipline);
      if (scope.revision !== run.sourceRevision || scope.scopeFingerprint !== run.scopeFingerprint)
        throw new HttpsError("failed-precondition", "Historical source or scope changed. Start a new run.");
      const cursor = clean(run[phase + "Cursor"]);
      const previousHash = clean(run[phase + "PreviousHash"] || "GENESIS");
      if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= LARGE_HISTORY_MAX_PAGES)
        throw new HttpsError("resource-exhausted", "Certification page limit exceeded.");
      if (run[phase + "Exhausted"] === true) throw new HttpsError("failed-precondition", "This pass is already exhausted.");
      const pageData = await readInventoryPage(tx, {athleteId,discipline,cursor,scopes:scope.scopeInventory});
      if (pageData.blockers.length) {
        tx.update(runRef,{status:"BLOCKED",blockers:pageData.blockers,
          blockedAt:Timestamp.now(),blockedBy:actor.uid,updatedAt:Timestamp.now()});
        return {blocked:true,blockers:pageData.blockers,sequence};
      }
      const recordedAt = Timestamp.now().toDate().toISOString();
      const inventoryPageRef = runRef.collection("inventoryPages").doc(String(sequence).padStart(6,"0"));
      const inventoryPageSnap = phase === "reconciliation" ? await tx.get(inventoryPageRef) : null;
      if (phase === "reconciliation" && !inventoryPageSnap?.exists)
        throw new HttpsError("failed-precondition", "Matching inventory page is missing.");
      const kind = phase === "inventory" ? "LARGE_HISTORY_INVENTORY_PAGE" : "LARGE_HISTORY_RECONCILIATION_PAGE";
      const page = createHistoricalChainPage({kind,schemaVersion:LARGE_HISTORY_SCHEMA_VERSION,
        athleteId,discipline,runId,sourceRevision:run.sourceRevision,
        scopeFingerprint:run.scopeFingerprint,sequence,previousPageHash:previousHash,
        cursorBefore:cursor,cursorAfter:pageData.cursorAfter,exhausted:pageData.exhausted,
        records:pageData.records,verifiedRecordCount:pageData.records.length,
        evidenceCount:pageData.records.reduce((sum,item)=>sum+item.observations.length,0),
        ...(phase === "reconciliation" ? {inventoryPageHash:clean(inventoryPageSnap?.data()?.pageHash)} : {}),
        recordedAt,authorizedBy:actor.uid});
      if (phase === "reconciliation") {
        const original = inventoryPageSnap?.data() as HistoricalChainPage;
        if (historicalChainHash(page.records) !== historicalChainHash(original.records)
            || page.cursorBefore !== original.cursorBefore || page.cursorAfter !== original.cursorAfter
            || page.exhausted !== original.exhausted) {
          tx.update(runRef,{status:"BLOCKED",blockers:["independent-reconciliation-mismatch:"+sequence],
            blockedAt:Timestamp.now(),blockedBy:actor.uid,updatedAt:Timestamp.now()});
          return {blocked:true,blockers:["independent-reconciliation-mismatch:"+sequence],sequence};
        }
      }
      const pageRef = runRef.collection(phase === "inventory" ? "inventoryPages" : "reconciliationPages")
        .doc(String(sequence).padStart(6,"0"));
      tx.create(pageRef,page);
      tx.update(runRef,{[phase+"Sequence"]:sequence+1,[phase+"Cursor"]:page.cursorAfter,
        [phase+"PreviousHash"]:page.pageHash,[phase+"Exhausted"]:page.exhausted,
        updatedAt:Timestamp.now(),lastAdvancedBy:actor.uid});
      return {blocked:false,sequence,pageHash:page.pageHash,records:page.verifiedRecordCount,
        evidence:page.evidenceCount,exhausted:page.exhausted};
    });
    return {ok:true,runId,phase,...result,coverageComplete:false,evidenceApproved:false,eligibleForAuto:false};
  }

  if (action === "begin-reconciliation") {
    await db.runTransaction(async tx => {
      const runSnap = await tx.get(runRef);
      const run = runSnap.data() || {};
      if (!runSnap.exists || run.status !== "PENDING" || run.phase !== "INVENTORY"
          || run.inventoryExhausted !== true)
        throw new HttpsError("failed-precondition", "Complete inventory discovery first.");
      const scope = await deriveScopes(tx,athleteId,discipline);
      if (scope.revision !== run.sourceRevision || scope.scopeFingerprint !== run.scopeFingerprint)
        throw new HttpsError("failed-precondition", "Historical source or scope changed. Start a new run.");
      tx.update(runRef,{phase:"RECONCILIATION",reconciliationSequence:0,
        reconciliationCursor:"",reconciliationPreviousHash:"GENESIS",reconciliationExhausted:false,
        reconciliationStartedAt:Timestamp.now(),reconciliationStartedBy:actor.uid,updatedAt:Timestamp.now()});
    });
    return {ok:true,runId,phase:"RECONCILIATION",coverageComplete:false,evidenceApproved:false,eligibleForAuto:false};
  }

  if (action === "finalize") {
    const certificateRef = db.doc(`athletes/${athleteId}/largeHistoryCertificates/${runId}`);
    const result = await db.runTransaction(async tx => {
      const runSnap = await tx.get(runRef);
      const inventorySnap = await tx.get(runRef.collection("inventoryPages")
        .orderBy("sequence").limit(LARGE_HISTORY_MAX_PAGES+1));
      const reconciliationSnap = await tx.get(runRef.collection("reconciliationPages")
        .orderBy("sequence").limit(LARGE_HISTORY_MAX_PAGES+1));
      const existingCertificate = await tx.get(certificateRef);
      const revocationSnap = await tx.get(db.doc(`athletes/${athleteId}/largeHistoryRevocations/${runId}`));
      const run = runSnap.data() || {};
      if (!runSnap.exists || run.status !== "PENDING" || run.phase !== "RECONCILIATION"
          || run.inventoryExhausted !== true || run.reconciliationExhausted !== true)
        throw new HttpsError("failed-precondition", "Both inventory passes must be exhausted.");
      if (inventorySnap.size > LARGE_HISTORY_MAX_PAGES || reconciliationSnap.size > LARGE_HISTORY_MAX_PAGES)
        throw new HttpsError("resource-exhausted", "Certification page limit exceeded.");
      if (revocationSnap.exists) throw new HttpsError("failed-precondition", "Certification run is revoked.");
      const scope = await deriveScopes(tx,athleteId,discipline);
      if (scope.revision !== run.sourceRevision || scope.scopeFingerprint !== run.scopeFingerprint)
        throw new HttpsError("failed-precondition", "Historical source or scope changed. Start a new run.");
      const inventory = inventorySnap.docs.map(doc=>doc.data() as HistoricalChainPage);
      const reconciliation = reconciliationSnap.docs.map(doc=>doc.data() as HistoricalChainPage);
      const expected = {athleteId,discipline,runId,sourceRevision:run.sourceRevision,
        scopeFingerprint:run.scopeFingerprint};
      const inventoryCheck = verifyHistoricalPageChain(inventory,{...expected,kind:"LARGE_HISTORY_INVENTORY_PAGE"});
      const reconciliationCheck = verifyHistoricalPageChain(reconciliation,{...expected,kind:"LARGE_HISTORY_RECONCILIATION_PAGE"});
      const blockers = [...inventoryCheck.blockers,...reconciliationCheck.blockers,
        ...compareHistoricalPasses(inventory,reconciliation)];
      const states = resolveHistoricalSkillStates(inventory);
      blockers.push(...states.blockers);
      if (blockers.length) throw new HttpsError("failed-precondition",
        "Large-history chain validation failed: "+[...new Set(blockers)].sort().join(","));
      const certificate = {kind:"SERVER_CERTIFIED_LARGE_HISTORY_COVERAGE",schemaVersion:LARGE_HISTORY_SCHEMA_VERSION,
        athleteId,discipline,runId,sourceRevision:run.sourceRevision,reviewRevision:run.reviewRevision,
        scopeInventory:run.scopeInventory,scopeFingerprint:run.scopeFingerprint,
        inventoryRootHash:inventoryCheck.rootHash,reconciliationRootHash:reconciliationCheck.rootHash,
        inventoryPageCount:inventory.length,verifiedPracticeCount:inventoryCheck.recordCount,
        verifiedEvidenceCount:inventoryCheck.evidenceCount,skillStates:states.skillStates,
        reconciliationResult:"MATCHED_INDEPENDENT_SOURCE_PASS",certifiedBy:actor.uid,
        certifiedAt:Timestamp.now(),evidenceApproved:false,coverageComplete:true,eligibleForAuto:false};
      if (existingCertificate.exists) {
        const existing = existingCertificate.data() || {};
        if (existing.inventoryRootHash !== certificate.inventoryRootHash
            || existing.reconciliationRootHash !== certificate.reconciliationRootHash
            || existing.sourceRevision !== certificate.sourceRevision)
          throw new HttpsError("already-exists", "A different immutable certificate already exists.");
      } else tx.create(certificateRef,certificate);
      tx.update(runRef,{status:"CERTIFIED",phase:"COMPLETE",certificateId:runId,
        inventoryRootHash:inventoryCheck.rootHash,reconciliationRootHash:reconciliationCheck.rootHash,
        certifiedAt:Timestamp.now(),certifiedBy:actor.uid,coverageComplete:true,
        evidenceApproved:false,eligibleForAuto:false,updatedAt:Timestamp.now()});
      return {certificateId:runId,idempotent:existingCertificate.exists,
        verifiedPracticeCount:inventoryCheck.recordCount,verifiedEvidenceCount:inventoryCheck.evidenceCount};
    });
    return {ok:true,...result,coverageComplete:true,evidenceApproved:false,eligibleForAuto:false};
  }

  if (action === "accept") {
    const reviewRef = db.doc(`athletes/${athleteId}/historicalTransferReviews/${discipline}`);
    const certificateRef = db.doc(`athletes/${athleteId}/largeHistoryCertificates/${runId}`);
    await db.runTransaction(async tx => {
      const reviewSnap = await tx.get(reviewRef);
      const runSnap = await tx.get(runRef);
      const certificateSnap = await tx.get(certificateRef);
      const revocationSnap = await tx.get(db.doc(`athletes/${athleteId}/largeHistoryRevocations/${runId}`));
      const review=reviewSnap.data()||{},run=runSnap.data()||{},certificate=certificateSnap.data()||{};
      if (!reviewSnap.exists || clean(review.status)!=="PENDING_MANAGEMENT_REVIEW"
          || !runSnap.exists || run.status!=="CERTIFIED" || !certificateSnap.exists
          || certificate.kind!=="SERVER_CERTIFIED_LARGE_HISTORY_COVERAGE" || revocationSnap.exists)
        throw new HttpsError("failed-precondition","Current unrevoked large-history certificate required.");
      const scope=await deriveScopes(tx,athleteId,discipline);
      if (scope.revision!==certificate.sourceRevision || scope.scopeFingerprint!==certificate.scopeFingerprint)
        throw new HttpsError("failed-precondition","Certificate source or scope is stale.");
      const acceptanceRef=reviewRef.collection("largeHistoryAcceptanceDecisions").doc(runId);
      tx.create(acceptanceRef,{kind:"LARGE_HISTORY_EVIDENCE_ACCEPTANCE",schemaVersion:1,
        athleteId,discipline,runId,certificateId:runId,sourceRevision:certificate.sourceRevision,
        inventoryRootHash:certificate.inventoryRootHash,acceptedBy:actor.uid,acceptedAt:Timestamp.now(),
        evidenceApproved:true,coverageComplete:true,eligibleForAuto:false,xpAwarded:false});
      tx.update(reviewRef,{status:"ACCEPTED_HISTORICAL_EVIDENCE",acceptedLargeCertificateId:runId,
        acceptedLargeRunId:runId,acceptedSourceRevision:certificate.sourceRevision,
        evidenceApproved:true,coverageComplete:true,acceptedBy:actor.uid,acceptedAt:Timestamp.now(),
        eligibleForAuto:false});
    });
    return {ok:true,accepted:true,certificateId:runId,evidenceApproved:true,
      coverageComplete:true,eligibleForAuto:false,xpAwarded:false};
  }

  if (action === "revoke") {
    const reason=clean(data.reason);
    if (reason.length<10 || reason.length>500) throw new HttpsError("invalid-argument","Revocation reason required.");
    const revocationRef=db.doc(`athletes/${athleteId}/largeHistoryRevocations/${runId}`);
    await db.runTransaction(async tx=>{
      const runSnap=await tx.get(runRef);
      const existing=await tx.get(revocationRef);
      if (!runSnap.exists) throw new HttpsError("not-found","Certification run not found.");
      if (!existing.exists) tx.create(revocationRef,{kind:"LARGE_HISTORY_CERTIFICATION_REVOCATION",
        schemaVersion:1,athleteId,discipline,runId,reason,revokedBy:actor.uid,revokedAt:Timestamp.now()});
      tx.update(runRef,{status:"REVOKED",revokedAt:Timestamp.now(),revokedBy:actor.uid,
        coverageComplete:false,evidenceApproved:false,eligibleForAuto:false,updatedAt:Timestamp.now()});
    });
    return {ok:true,revoked:true,runId,eligibleForAuto:false};
  }

  throw new HttpsError("invalid-argument","Unsupported resumable historical certification action.");
});
