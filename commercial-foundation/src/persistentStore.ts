import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AuditEvent, Organization, VerifiedIdentity } from "./contracts";
import { InMemoryCommercialStore, StoreKind, TenantRecord } from "./foundation";
import { assertId, validateEntitlement, validateMembership, validateProgram } from "./validation";

interface PersistedState {
  schema: "sandman.commercial.local-store.v1";
  organizations: Organization[];
  academies: TenantRecord[]; locations: TenantRecord[]; programs: TenantRecord[];
  memberships: TenantRecord[]; entitlements: TenantRecord[]; sessions: TenantRecord[]; athletes: TenantRecord[]; attendance: TenantRecord[]; practiceNotes: TenantRecord[]; guardians: TenantRecord[]; guardianLinks: TenantRecord[]; athleteIdentityLinks: TenantRecord[]; curricula: TenantRecord[]; curriculumAssignments: TenantRecord[]; skillEvaluations: TenantRecord[]; progressionCycles: TenantRecord[]; xpEvents: TenantRecord[]; promotions: TenantRecord[]; audits: AuditEvent[];
}

/**
 * Durable local reference adapter for isolated development and restart tests.
 * It atomically replaces one mode-0600 JSON file and never connects to Firebase.
 * This single-process adapter is not a production database or concurrency boundary.
 */
export class PersistentJsonCommercialStore extends InMemoryCommercialStore {
  readonly filePath: string;
  private inTransaction = false;
  constructor(filePath: string) {
    super();
    this.filePath = resolve(filePath);
    if (!existsSync(dirname(this.filePath))) throw new Error("PERSISTENCE_DIRECTORY_NOT_FOUND");
    if (existsSync(this.filePath)) this.load();
  }
  private load(): void {
    const state = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedState;
    if (state.schema !== "sandman.commercial.local-store.v1") throw new Error("INVALID_PERSISTENCE_SCHEMA");
    if (![state.organizations, state.academies, state.locations, state.programs, state.memberships, state.entitlements, state.sessions, state.athletes, state.attendance, state.practiceNotes, state.guardians, state.guardianLinks, state.athleteIdentityLinks, state.curricula, state.curriculumAssignments, state.skillEvaluations, state.progressionCycles, state.xpEvents, state.promotions, state.audits].every(Array.isArray)) throw new Error("INVALID_PERSISTENCE_SHAPE");
    for (const record of state.organizations) { assertId(record.id); if (!record.displayName?.trim() || !["active","suspended","archived"].includes(record.state)) throw new Error("INVALID_PERSISTED_ORGANIZATION"); super.createOrganization(record); }
    for (const record of state.academies as TenantRecord[]) { assertId(record.id); assertId(record.organizationId,"organizationId"); if (!this.getOrganization(record.organizationId)) throw new Error("INVALID_PERSISTED_TENANT_REFERENCE"); super.put("academies",record); }
    for (const record of state.locations as TenantRecord[]) { assertId(record.id); const value = record as import("./contracts").Location; if (!this.get<import("./contracts").Academy>("academies",value.organizationId,value.academyId)) throw new Error("INVALID_PERSISTED_ACADEMY_REFERENCE"); super.put("locations",record); }
    for (const record of state.programs as TenantRecord[]) { validateProgram(record as import("./contracts").Program); super.put("programs",record); }
    for (const record of state.memberships as TenantRecord[]) { validateMembership(record as import("./contracts").Membership); super.put("memberships",record); }
    for (const record of state.entitlements as TenantRecord[]) { validateEntitlement(record as import("./contracts").Entitlement); super.put("entitlements",record); }
    for (const record of state.sessions as TenantRecord[]) super.put("sessions", record);
    for (const record of state.athletes as TenantRecord[]) super.put("athletes", record);
    for (const record of state.attendance as TenantRecord[]) super.put("attendance", record);
    for (const record of state.practiceNotes as TenantRecord[]) super.put("practiceNotes", record);
    for (const record of state.guardians as TenantRecord[]) super.put("guardians",record);
    for (const record of state.guardianLinks as TenantRecord[]) super.put("guardianLinks",record);
    for (const record of state.athleteIdentityLinks as TenantRecord[]) super.put("athleteIdentityLinks",record);
    for (const record of state.curricula as TenantRecord[]) super.put("curricula",record);
    for (const record of state.curriculumAssignments as TenantRecord[]) super.put("curriculumAssignments",record);
    for (const record of state.skillEvaluations as TenantRecord[]) super.put("skillEvaluations",record);
    for (const record of state.progressionCycles as TenantRecord[]) super.put("progressionCycles",record);
    for (const record of state.xpEvents as TenantRecord[]) super.put("xpEvents",record);
    for (const record of state.promotions as TenantRecord[]) super.put("promotions",record);
    // Loading is fail-closed: every child and authorization scope must resolve inside its own tenant.
    for (const academy of this.academies.values()) {
      if (!this.getOrganization(academy.organizationId) || !academy.name?.trim() || !["active", "suspended", "archived"].includes(academy.state)) throw new Error("INVALID_PERSISTED_ACADEMY");
    }
    for (const location of this.locations.values()) {
      const parent = this.get<import("./contracts").Academy>("academies", location.organizationId, location.academyId);
      if (!parent || !location.name?.trim() || !["active", "suspended", "archived"].includes(location.state)) throw new Error("INVALID_PERSISTED_LOCATION");
    }
    for (const program of this.programs.values()) {
      const academy = this.get<import("./contracts").Academy>("academies", program.organizationId, program.academyId);
      if (!academy || program.locationIds.some(id => {
        const location = this.get<import("./contracts").Location>("locations", program.organizationId, id);
        return !location || location.academyId !== program.academyId;
      }) || !["active", "suspended", "archived"].includes(program.state)) throw new Error("INVALID_PERSISTED_PROGRAM_REFERENCE");
    }
    for (const member of this.memberships.values()) {
      if (!this.getOrganization(member.organizationId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_ORGANIZATION");
      if (member.scopeType === "academy" && !this.get("academies", member.organizationId, member.scopeId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_SCOPE");
      if (member.scopeType === "location" && !this.get("locations", member.organizationId, member.scopeId)) throw new Error("INVALID_PERSISTED_MEMBERSHIP_SCOPE");
    }
    for (const grant of this.entitlements.values()) {
      if (!this.getOrganization(grant.organizationId)) throw new Error("INVALID_PERSISTED_ENTITLEMENT_ORGANIZATION");
    }
    for (const session of this.sessions.values()) {
      const academy = this.get("academies", session.organizationId, session.academyId) as import("./contracts").Academy | undefined;
      const location = this.get("locations", session.organizationId, session.locationId) as import("./contracts").Location | undefined;
      const program = this.get("programs", session.organizationId, session.programId) as import("./contracts").Program | undefined;
      if (!academy || !location || !program || location.academyId !== academy.id || program.academyId !== academy.id || !program.locationIds.includes(location.id)) throw new Error("INVALID_PERSISTED_SESSION_REFERENCE");
    }
    for (const athlete of this.athletes.values()) {
      const program = this.get<import("./contracts").Program>("programs", athlete.organizationId, athlete.programId);
      if (!program || athlete.synthetic !== true || typeof athlete.displayName !== "string" || !athlete.displayName.trim()) throw new Error("INVALID_PERSISTED_ATHLETE_REFERENCE");
    }
    const validDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
    for (const session of this.sessions.values()) {
      if (!["scheduled", "completed", "cancelled"].includes(session.state) || !validDate(session.startsAt) || !validDate(session.endsAt) || Date.parse(session.endsAt) <= Date.parse(session.startsAt) ||
        !Array.isArray(session.coachUserIds) || !session.coachUserIds.length || new Set(session.coachUserIds).size !== session.coachUserIds.length ||
        session.coachUserIds.some(userId => typeof userId !== "string" || !this.list<import("./contracts").Membership>("memberships", session.organizationId).some(m =>
          m.userId === userId && m.role === "coach" && (m.scopeType === "organization" || (m.scopeType === "academy" && m.scopeId === session.academyId) || (m.scopeType === "location" && m.scopeId === session.locationId))))) {
        throw new Error("INVALID_PERSISTED_SESSION_STATE");
      }
    }
    for (const attendance of this.attendance.values()) {
      const session = this.get<import("./contracts").PracticeSession>("sessions", attendance.organizationId, attendance.sessionId);
      const athlete = this.get<import("./contracts").CommercialAthlete>("athletes", attendance.organizationId, attendance.athleteId);
      if (!session || !athlete || athlete.programId !== session.programId) throw new Error("INVALID_PERSISTED_ATTENDANCE_REFERENCE");
      if (attendance.id !== `${attendance.sessionId}--${attendance.athleteId}` || !["present", "absent", "excused"].includes(attendance.state) ||
        typeof attendance.recordedByUserId !== "string" || !attendance.recordedByUserId || !validDate(attendance.recordedAt) ||
        (attendance.correctedAt !== undefined && !validDate(attendance.correctedAt))) throw new Error("INVALID_PERSISTED_ATTENDANCE_STATE");
    }
    for (const note of this.practiceNotes.values()) {
      const session = this.get<import("./contracts").PracticeSession>("sessions", note.organizationId, note.sessionId);
      if (!session) throw new Error("INVALID_PERSISTED_NOTE_REFERENCE");
      if (typeof note.authorUserId !== "string" || !note.authorUserId || typeof note.body !== "string" || !note.body.trim() || note.body.length > 2000 || !validDate(note.createdAt)) throw new Error("INVALID_PERSISTED_NOTE_STATE");
    }
    for (const guardian of this.guardians.values()) {
      if (!guardian.synthetic || typeof guardian.userId !== "string" || !guardian.userId.trim() ||
        typeof guardian.displayName !== "string" || !guardian.displayName.trim() ||
        !this.getOrganization(guardian.organizationId) || !["active","suspended","revoked"].includes(guardian.state)) {
        throw new Error("INVALID_PERSISTED_GUARDIAN");
      }
    }
    for (const link of this.guardianLinks.values()) {
      const guardian = this.get<import("./contracts").GuardianProfile>("guardians",link.organizationId,link.guardianId);
      const athlete = this.get<import("./contracts").CommercialAthlete>("athletes",link.organizationId,link.athleteId);
      const program = athlete && this.get<import("./contracts").Program>("programs",link.organizationId,athlete.programId);
      const hasParentMembership = guardian && this.list<import("./contracts").Membership>("memberships",link.organizationId).some(m=>
        m.userId===guardian.userId && m.role==="parent" &&
        (m.scopeType==="organization" || m.scopeType==="academy" && m.scopeId===program?.academyId ||
        m.scopeType==="location" && !!program?.locationIds.includes(m.scopeId)));
      if (!guardian || !athlete || !program || !hasParentMembership ||
        !["active","suspended","revoked"].includes(link.state) ||
        (link.state==="active" && guardian.state!=="active") ||
        !Array.isArray(link.permissions) || link.permissions.length===0 ||
        new Set(link.permissions).size!==link.permissions.length ||
        link.permissions.some(p=>!["profile","schedule","attendance","progression"].includes(p))) {
        throw new Error("INVALID_PERSISTED_GUARDIAN_LINK");
      }
    }
    const activeIdentityUsers=new Set<string>();
    for (const link of this.athleteIdentityLinks.values()) {
      const athlete = this.get<import("./contracts").CommercialAthlete>("athletes",link.organizationId,link.athleteId);
      const expectedRole = link.access==="adult_self"?"adult_athlete":"athlete";
      const membership=this.list<import("./contracts").Membership>("memberships",link.organizationId).some(m=>m.userId===link.userId&&m.role===expectedRole);
      const identityKey=JSON.stringify([link.organizationId,link.userId]);
      if (!athlete || !membership || typeof link.userId!=="string" || !link.userId.trim() ||
        !["active","suspended","revoked"].includes(link.state) ||
        !["adult_self","minor_read_only"].includes(link.access) ||
        (link.access==="adult_self" && !athlete.adult) ||
        (link.access==="minor_read_only" && !!athlete.adult) ||
        (link.state==="active" && activeIdentityUsers.has(identityKey))) {
        throw new Error("INVALID_PERSISTED_ATHLETE_IDENTITY");
      }
      if(link.state==="active") activeIdentityUsers.add(identityKey);
    }
    const expectedRanks:Record<string,number[]>={road2champion:[800,1600,2400,2800,3200],path2legend:[1000,1600,2400,2800,3000]};
    const approvedDisciplines=new Set(["wrestling","boxing","muay_thai"]);
    const canonicalRanks:Record<string,{key:string;name:string;requiredXp:number;order:number}[]>={
      road2champion:["Shadow","Prospect","Competitor","Contender","Champion"].map((name,order)=>({key:name.toLowerCase(),name,requiredXp:expectedRanks.road2champion[order],order})),
      path2legend:["Apprentice","Warrior","Hero","Veteran","Legend"].map((name,order)=>({key:name.toLowerCase(),name,requiredXp:expectedRanks.path2legend[order],order}))
    };
    for(const curriculum of this.curricula.values()){
      const required=canonicalRanks[curriculum.pathway];
      if(!this.get("academies",curriculum.organizationId,curriculum.academyId)||
        curriculum.state!=="active"&&curriculum.state!=="retired"||
        typeof curriculum.version!=="string"||!curriculum.version.trim()||
        !approvedDisciplines.has(curriculum.discipline)||
        !required||JSON.stringify(curriculum.ranks)!==JSON.stringify(required)||
        !Array.isArray(curriculum.skills)||!curriculum.skills.length||
        !curriculum.skills.some(s=>s.required===true)||
        new Set(curriculum.skills.map(s=>s.id)).size!==curriculum.skills.length||
        curriculum.skills.some(s=>typeof s.id!=="string"||!s.id.trim()||
          typeof s.name!=="string"||!s.name.trim()||
          typeof s.category!=="string"||!s.category.trim()||
          typeof s.required!=="boolean"))
        throw new Error("INVALID_PERSISTED_CURRICULUM");
    }
    for(const assignment of this.curriculumAssignments.values()){const athlete=this.get("athletes",assignment.organizationId,assignment.athleteId);const curriculum=this.get("curricula",assignment.organizationId,assignment.curriculumId);if(!athlete||!curriculum||!["active","completed","revoked"].includes(assignment.state)||!validDate(assignment.assignedAt))throw new Error("INVALID_PERSISTED_CURRICULUM_ASSIGNMENT");}
    const activeCycles=new Set<string>();
    for(const assignment of this.curriculumAssignments.values()){
      const athlete=this.get<import("./contracts").CommercialAthlete>("athletes",assignment.organizationId,assignment.athleteId);
      const curriculum=this.get<import("./contracts").CurriculumDefinition>("curricula",assignment.organizationId,assignment.curriculumId);
      if(!athlete||!curriculum||athlete.academyId!==curriculum.academyId)throw new Error("INVALID_PERSISTED_CURRICULUM_ASSIGNMENT");
    }
    for(const evaluation of this.skillEvaluations.values()){
      const assignment=this.get<import("./contracts").CurriculumAssignment>("curriculumAssignments",evaluation.organizationId,evaluation.assignmentId);
      const curriculum=assignment&&this.get<import("./contracts").CurriculumDefinition>("curricula",evaluation.organizationId,assignment.curriculumId);
      if(!assignment||!curriculum||assignment.athleteId!==evaluation.athleteId||
        !curriculum.skills.some(s=>s.id===evaluation.skillId)||
        !["introduced","developing","approved"].includes(evaluation.status)||!validDate(evaluation.evaluatedAt)||
        (evaluation.rankIndexAtEvaluation!==undefined&&(!Number.isInteger(evaluation.rankIndexAtEvaluation)||evaluation.rankIndexAtEvaluation<0||evaluation.rankIndexAtEvaluation>4)))
        throw new Error("INVALID_PERSISTED_SKILL_EVALUATION");
    }
    for(const cycle of this.progressionCycles.values()){
      const athlete=this.get<import("./contracts").CommercialAthlete>("athletes",cycle.organizationId,cycle.athleteId);
      const assignment=this.get<import("./contracts").CurriculumAssignment>("curriculumAssignments",cycle.organizationId,cycle.assignmentId);
      const curriculum=assignment&&this.get<import("./contracts").CurriculumDefinition>("curricula",cycle.organizationId,assignment.curriculumId);
      const key=JSON.stringify([cycle.organizationId,cycle.athleteId]);
      if(!athlete||!assignment||!curriculum||assignment.athleteId!==cycle.athleteId||
        curriculum.pathway!==cycle.pathway||!expectedRanks[cycle.pathway]||
        !Number.isInteger(cycle.rankIndex)||cycle.rankIndex<0||cycle.rankIndex>4||
        !Number.isInteger(cycle.activeXp)||cycle.activeXp<0||
        !Number.isInteger(cycle.lifetimeXp)||cycle.lifetimeXp<0||
        !Number.isInteger(cycle.earnedStripes)||cycle.earnedStripes<0||cycle.earnedStripes>4||
        !Number.isInteger(cycle.sequence)||cycle.sequence<0||
        !["preseason","in_season","postseason"].includes(cycle.seasonPhase)||
        !["active","completed","suspended"].includes(cycle.state)||
        (cycle.state==="active"&&(assignment.state!=="active"||activeCycles.has(key))))
        throw new Error("INVALID_PERSISTED_PROGRESSION_CYCLE");
      if(cycle.state==="active")activeCycles.add(key);
    }
    const eventIds=new Set<string>();
    for(const event of this.xpEvents.values()){
      const athlete=this.get<import("./contracts").CommercialAthlete>("athletes",event.organizationId,event.athleteId);
      const cycle=this.get<import("./contracts").ProgressionCycle>("progressionCycles",event.organizationId,event.cycleId);
      const key=JSON.stringify([event.organizationId,event.sourceEventId]);
      if(!athlete||!cycle||cycle.athleteId!==event.athleteId||
        !Number.isInteger(event.rankIndexAtAward)||event.rankIndexAtAward<0||event.rankIndexAtAward>4||
        event.id!==event.sourceEventId||!/^[a-zA-Z0-9._:-]+$/.test(event.sourceEventId)||
        !Number.isInteger(event.amount)||event.amount===0||
        !["strength","honor","adjustment"].includes(event.lane)||
        (event.lane==="strength"&&(![5,10].includes(event.amount)||event.source!=="structured-strength"))||
        (event.lane==="honor"&&(event.amount!==5||event.source!=="verified-honor"))||
        (event.lane==="adjustment"&&(!event.reason?.trim()||event.source!=="management-adjustment"))||
        (event.correctionOf!==undefined&&!this.get("xpEvents",event.organizationId,event.correctionOf))||
        eventIds.has(key)||!validDate(event.occurredAt))
        throw new Error("INVALID_PERSISTED_XP_EVENT");
      eventIds.add(key);
    }
    const promotionKeys=new Set<string>();
    for(const promotion of this.promotions.values()){
      const athlete=this.get<import("./contracts").CommercialAthlete>("athletes",promotion.organizationId,promotion.athleteId);
      const cycle=this.get<import("./contracts").ProgressionCycle>("progressionCycles",promotion.organizationId,promotion.cycleId);
      const key=JSON.stringify([promotion.organizationId,promotion.athleteId,promotion.fromRank,promotion.toRank]);
      if(!athlete||!cycle||cycle.athleteId!==promotion.athleteId||cycle.pathway!==promotion.pathway||
        promotion.requirementsVerified!==true||!Number.isInteger(promotion.historicalXpAtPromotion)||
        !validDate(promotion.promotedAt)||promotionKeys.has(key))
        throw new Error("INVALID_PERSISTED_PROMOTION");
      promotionKeys.add(key);
    }
    // Deterministic local ledger replay: events are append-only and tagged with the
    // rank cycle in which they were awarded. Rank transitions reset only active XP.
    for(const cycle of this.progressionCycles.values()){
      const org=cycle.organizationId;
      const curriculumAssignment=this.get<import("./contracts").CurriculumAssignment>("curriculumAssignments",org,cycle.assignmentId);
      const definition=curriculumAssignment&&this.get<import("./contracts").CurriculumDefinition>("curricula",org,curriculumAssignment.curriculumId);
      const ranks=definition?.ranks;
      if(!ranks||ranks.length!==5)throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
      const events=this.list<import("./contracts").XpEvent>("xpEvents",org).filter(e=>e.cycleId===cycle.id);
      const promotions=this.list<import("./contracts").PromotionRecord>("promotions",org).filter(p=>p.cycleId===cycle.id);
      if(promotions.length!==cycle.rankIndex||cycle.sequence!==promotions.length)
        throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
      let lifetime=0,active=0,stripes=0,previousLifetimeFloor=0;
      for(let stage=0;stage<=cycle.rankIndex;stage++){
        active=0;stripes=0;
        const threshold=ranks[stage].requiredXp;
        for(const event of events.filter(e=>e.rankIndexAtAward===stage)){
          if(event.correctionOf){
            const original=this.get<import("./contracts").XpEvent>("xpEvents",org,event.correctionOf);
            if(!original||original.athleteId!==cycle.athleteId)throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
          }
          const next=active+event.amount;
          lifetime+=event.amount;
          if(next<Math.ceil(threshold*stripes/4)||lifetime<previousLifetimeFloor||next<0)
            throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
          active=next;
          stripes=Math.max(stripes,Math.min(4,Math.floor(active/(threshold/4))));
        }
        if(stage<cycle.rankIndex){
          const promotion=promotions.find(p=>p.fromRank===ranks[stage].key&&p.toRank===ranks[stage+1].key);
          const required=definition!.skills.filter(skill=>skill.required);
          const approvals=this.list<import("./contracts").SkillEvaluation>("skillEvaluations",org).filter(e=>
            e.athleteId===cycle.athleteId&&e.assignmentId===cycle.assignmentId&&e.status==="approved"&&
            (e.rankIndexAtEvaluation===stage||(stage===0&&e.rankIndexAtEvaluation===undefined)));
          if(!promotion||active<threshold||promotion.historicalXpAtPromotion!==lifetime||
            !required.length||required.some(skill=>!approvals.some(e=>e.skillId===skill.id)))
            throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
          previousLifetimeFloor=lifetime;
        }
      }
      if(events.some(e=>e.athleteId!==cycle.athleteId||e.rankIndexAtAward>cycle.rankIndex)||
        cycle.lifetimeXp!==lifetime||cycle.activeXp!==active||cycle.earnedStripes!==stripes)
        throw new Error("INVALID_PERSISTED_PROGRESSION_LEDGER");
    }
    if (state.audits.some(event => !event || typeof event.id !== "string" || !/^audit-[1-9][0-9]*$/.test(event.id) || !this.getOrganization(event.selectedOrganizationId) ||
      typeof event.actorUserId !== "string" || !["permitted", "rejected"].includes(event.outcome))) throw new Error("INVALID_PERSISTED_AUDIT");
    if (new Set(state.audits.map(event => event.id)).size !== state.audits.length) throw new Error("DUPLICATE_PERSISTED_AUDIT");
    this.audits = state.audits.map(event => structuredClone(event));
    this.sequence = this.audits.reduce((max, event) => Math.max(max, Number(event.id.replace(/^audit-/, "")) || 0), 0);
  }
  private flush(): void {
    const state: PersistedState = {
      schema: "sandman.commercial.local-store.v1",
      organizations: [...this.organizations.values()],
      academies: [...this.academies.values()], locations: [...this.locations.values()], programs: [...this.programs.values()],
      memberships: [...this.memberships.values()], entitlements: [...this.entitlements.values()], sessions: [...this.sessions.values()], athletes: [...this.athletes.values()], attendance: [...this.attendance.values()], practiceNotes: [...this.practiceNotes.values()], guardians:[...this.guardians.values()], guardianLinks:[...this.guardianLinks.values()], athleteIdentityLinks:[...this.athleteIdentityLinks.values()], curricula:[...this.curricula.values()],curriculumAssignments:[...this.curriculumAssignments.values()],skillEvaluations:[...this.skillEvaluations.values()],progressionCycles:[...this.progressionCycles.values()],xpEvents:[...this.xpEvents.values()],promotions:[...this.promotions.values()], audits: this.audits
    };
    const temporary = `${this.filePath}.${globalThis.crypto.randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporary, this.filePath);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  /** Single-process all-or-nothing batch: no file is changed until the full operation succeeds. */
  override transaction<T>(work: () => T): T {
    if (this.inTransaction) throw new Error("NESTED_TRANSACTION_UNSUPPORTED");
    const previous = this.snapshotState();
    this.inTransaction = true;
    try {
      const result = work();
      this.flush();
      return result;
    } catch (error) {
      this.restoreState(previous);
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
  /** Roll back in-memory state when disk replacement fails; never acknowledge unpersisted writes. */
  private mutate(work: () => void): void {
    const previous = this.snapshotState();
    try {
      work();
      if (!this.inTransaction) this.flush();
    } catch (error) {
      this.restoreState(previous);
      throw error;
    }
  }
  override createOrganization(record: Organization): void { this.mutate(() => super.createOrganization(record)); }
  override updateOrganization(record: Organization): void { this.mutate(() => super.updateOrganization(record)); }
  override put(kind: StoreKind, record: TenantRecord, replace = false): void {
    this.mutate(() => super.put(kind, record, replace));
  }
  override audit(identity: VerifiedIdentity, action: string, resourceType: string, resourceId: string, outcome: AuditEvent["outcome"], reason?: string): void {
    this.mutate(() => super.audit(identity, action, resourceType, resourceId, outcome, reason));
  }
}
