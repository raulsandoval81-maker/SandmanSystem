import { AttendanceRecord, AttendanceState, AuthorizationContext, CommercialAthlete, Membership, PracticeNote, PracticeSession, PracticeSessionState, Program } from "./contracts";
import { CommercialFoundation } from "./foundation";
import { assertId } from "./validation";

const validDate = (value: string) => typeof value === "string" && !Number.isNaN(Date.parse(value));

export class ManagementService {
  constructor(private readonly foundation: CommercialFoundation) {}
  overview(ctx: AuthorizationContext, organizationId: string) {
    return this.foundation.runAuthorized(ctx,"management.overview","organization",organizationId,organizationId,() => ({
      organization: this.foundation.store.getOrganization(organizationId),
      academies: this.foundation.store.list("academies",organizationId), locations: this.foundation.store.list("locations",organizationId),
      programs: this.foundation.store.list("programs",organizationId), staff: this.foundation.store.list("memberships",organizationId),
      entitlements: this.foundation.store.list("entitlements",organizationId), audits: this.foundation.store.listAudits(organizationId)
    }));
  }
  assignStaff(ctx: AuthorizationContext, membership: Membership) { return this.foundation.assignMembership(ctx,membership); }
  revokeStaff(ctx: AuthorizationContext, organizationId: string, membershipId: string) { return this.foundation.revokeMembership(ctx,organizationId,membershipId); }
}

export class SchedulingService {
  constructor(private readonly foundation: CommercialFoundation) {}
  create(ctx: AuthorizationContext, session: PracticeSession): PracticeSession {
    this.requireCapability(ctx,"schedule.manage");
    return this.foundation.runAuthorized(ctx,"management.schedule","session",session.id,session.organizationId,() => {
      this.validate(session);
      this.foundation.store.put("sessions",session); return structuredClone(session);
    },session.academyId,[session.locationId]);
  }
  list(ctx: AuthorizationContext, organizationId: string): PracticeSession[] {
    this.requireCapability(ctx,"schedule.manage");
    // Check each existing resource against its actual scope, then expose only permitted sessions.
    const sessions = this.foundation.store.list<PracticeSession>("sessions",organizationId);
    return sessions.filter(session => {
      try {
        this.foundation.runAuthorized(ctx,"management.schedule","session",session.id,organizationId,() => true,session.academyId,[session.locationId]);
        return true;
      } catch (error) {
        if (error instanceof Error && ["ROLE_DENIED", "MEMBERSHIP_REQUIRED"].includes(error.message)) return false;
        throw error;
      }
    });
  }
  read(ctx: AuthorizationContext, organizationId: string, sessionId: string): PracticeSession {
    const session = this.required(organizationId,sessionId);
    return this.foundation.runAuthorized(ctx,"session.read","session",sessionId,organizationId,identity => {
      if (session.coachUserIds.includes(identity.userId) || this.isManagement(identity.userId,organizationId,session)) return session;
      throw new Error("COACH_NOT_ASSIGNED");
    },session.academyId,[session.locationId]);
  }
  update(ctx: AuthorizationContext, session: PracticeSession): PracticeSession {
    this.requireCapability(ctx,"schedule.manage");
    // Authorize the ORIGINAL record before authorizing the requested destination.
    // A location manager must never move a foreign session into their own scope.
    const existing = this.required(session.organizationId,session.id);
    return this.foundation.runAuthorized(ctx,"management.schedule","session",session.id,session.organizationId,() =>
      this.foundation.runAuthorized(ctx,"management.schedule","session",session.id,session.organizationId,() => {
        this.validate(session);
        this.foundation.store.put("sessions",session,true);
        return structuredClone(session);
      },session.academyId,[session.locationId])
    ,existing.academyId,[existing.locationId]);
  }
  cancel(ctx: AuthorizationContext, organizationId: string, sessionId: string): PracticeSession {
    const session = this.required(organizationId,sessionId); return this.update(ctx,{...session,state:"cancelled"});
  }
  private required(organizationId: string,id: string) { const value=this.foundation.store.get<PracticeSession>("sessions",organizationId,id); if(!value) throw new Error("SESSION_NOT_FOUND"); return value; }
  private requireCapability(ctx:AuthorizationContext,id:string){if(!this.foundation.hasCapability(ctx,id))throw new Error("ENTITLEMENT_REQUIRED");}
  private isManagement(userId: string,organizationId: string,session:PracticeSession) { return this.foundation.store.list<Membership>("memberships",organizationId).some(m=>m.userId===userId&&m.state==="active"&&(m.role==="management"||m.role==="organization_admin")&&(m.scopeType==="organization"||(m.scopeType==="academy"&&m.scopeId===session.academyId)||(m.scopeType==="location"&&m.scopeId===session.locationId))); }
  private validate(session: PracticeSession) {
    assertId(session.id); assertId(session.organizationId,"organizationId"); assertId(session.academyId,"academyId"); assertId(session.locationId,"locationId"); assertId(session.programId,"programId");
    if (!validDate(session.startsAt)||!validDate(session.endsAt)||Date.parse(session.endsAt)<=Date.parse(session.startsAt)||!["scheduled","completed","cancelled"].includes(session.state)) throw new Error("INVALID_SESSION_TIME_OR_STATE");
    const academy=this.foundation.store.get("academies",session.organizationId,session.academyId) as {id:string}|undefined;
    const location=this.foundation.store.get("locations",session.organizationId,session.locationId) as {academyId:string}|undefined;
    const program=this.foundation.store.get<Program>("programs",session.organizationId,session.programId);
    if(!academy||!location||!program||location.academyId!==academy.id||program.academyId!==academy.id||!program.locationIds.includes(session.locationId)) throw new Error("INVALID_SESSION_RELATIONSHIP");
    if(!session.coachUserIds.length||new Set(session.coachUserIds).size!==session.coachUserIds.length||session.coachUserIds.some(userId=>!this.coachAllowed(userId,session))) throw new Error("INVALID_SESSION_COACH");
  }
  private coachAllowed(userId:string,session:PracticeSession){return this.foundation.store.list<Membership>("memberships",session.organizationId).some(m=>m.userId===userId&&m.role==="coach"&&m.state==="active"&&(m.scopeType==="organization"||(m.scopeType==="academy"&&m.scopeId===session.academyId)||(m.scopeType==="location"&&m.scopeId===session.locationId)));}
}

export class AttendanceService {
  constructor(private readonly foundation: CommercialFoundation,private readonly now=()=>new Date()) {}
  createSyntheticAthlete(ctx: AuthorizationContext, athlete: CommercialAthlete) {
    return this.foundation.runAuthorized(ctx,"management.athlete","athlete",athlete.id,athlete.organizationId,()=>{ assertId(athlete.id); if(!athlete.synthetic||!athlete.displayName.trim()||!this.foundation.store.get("programs",athlete.organizationId,athlete.programId)) throw new Error("INVALID_SYNTHETIC_ATHLETE"); this.foundation.store.put("athletes",athlete); return structuredClone(athlete); });
  }
  record(ctx: AuthorizationContext, organizationId: string, sessionId: string, athleteId: string, state: AttendanceState): AttendanceRecord {
    if(!this.foundation.hasCapability(ctx,"attendance.manage"))throw new Error("ENTITLEMENT_REQUIRED");
    if(!["present","absent","excused"].includes(state))throw new Error("INVALID_ATTENDANCE_STATE");
    const session=this.session(organizationId,sessionId); const id=`${sessionId}--${athleteId}`;
    return this.foundation.runAuthorized(ctx,"attendance.record","attendance",id,organizationId,identity=>{
      if(!session.coachUserIds.includes(identity.userId)&&!this.isManagement(identity.userId,organizationId,session)) throw new Error("COACH_NOT_ASSIGNED");
      const athlete=this.foundation.store.get<CommercialAthlete>("athletes",organizationId,athleteId); if(!athlete||athlete.programId!==session.programId) throw new Error("INVALID_ATTENDANCE_RELATIONSHIP");
      if(this.foundation.store.get("attendance",organizationId,id)) throw new Error("DUPLICATE_ATTENDANCE");
      const record={id,organizationId,sessionId,athleteId,state,recordedByUserId:identity.userId,recordedAt:this.now().toISOString()}; this.foundation.store.put("attendance",record); return record;
    },session.academyId,[session.locationId]);
  }
  correct(ctx: AuthorizationContext, organizationId:string, id:string, state:AttendanceState) {
    if(!this.foundation.hasCapability(ctx,"attendance.manage"))throw new Error("ENTITLEMENT_REQUIRED");
    if(!["present","absent","excused"].includes(state))throw new Error("INVALID_ATTENDANCE_STATE");
    const existing=this.foundation.store.get<AttendanceRecord>("attendance",organizationId,id); if(!existing) throw new Error("ATTENDANCE_NOT_FOUND"); const session=this.session(organizationId,existing.sessionId);
    return this.foundation.runAuthorized(ctx,"attendance.record","attendance",id,organizationId,identity=>{if(!session.coachUserIds.includes(identity.userId)&&!this.isManagement(identity.userId,organizationId,session))throw new Error("COACH_NOT_ASSIGNED");const updated={...existing,state,recordedByUserId:identity.userId,correctedAt:this.now().toISOString()}; this.foundation.store.put("attendance",updated,true); return updated; },session.academyId,[session.locationId]);
  }
  private session(org:string,id:string){const value=this.foundation.store.get<PracticeSession>("sessions",org,id);if(!value)throw new Error("SESSION_NOT_FOUND");return value;}
  private isManagement(userId:string,org:string,session:PracticeSession){return this.foundation.store.list<Membership>("memberships",org).some(m=>m.userId===userId&&m.state==="active"&&(m.role==="management"||m.role==="organization_admin")&&(m.scopeType==="organization"||(m.scopeType==="academy"&&m.scopeId===session.academyId)||(m.scopeType==="location"&&m.scopeId===session.locationId)));}
}

export class CoachService {
  constructor(private readonly foundation: CommercialFoundation,private readonly scheduling:SchedulingService) {}
  workspace(ctx:AuthorizationContext,organizationId:string,coachUserId:string){
    if(!this.foundation.hasCapability(ctx,"coach.workspace"))throw new Error("ENTITLEMENT_REQUIRED");
    const memberships=this.foundation.store.list<Membership>("memberships",organizationId)
      .filter(m=>m.userId===coachUserId&&m.role==="coach"&&m.state==="active");
    // Validate the request against an actual coach membership scope, not a missing scope.
    const first=memberships[0];
    const academyId=first?.scopeType==="academy"?first.scopeId:undefined;
    const locationIds=first?.scopeType==="location"?[first.scopeId]:[];
    return this.foundation.runAuthorized(ctx,"coach.workspace","coach",coachUserId,organizationId,identity=>{
      if(identity.userId!==coachUserId)throw new Error("COACH_IDENTITY_MISMATCH");
      if(!memberships.length)throw new Error("COACH_MEMBERSHIP_REQUIRED");
      const inScope=(session:PracticeSession)=>memberships.some(m=>
        m.scopeType==="organization"||
        (m.scopeType==="academy"&&m.scopeId===session.academyId)||
        (m.scopeType==="location"&&m.scopeId===session.locationId));
      const sessions=this.foundation.store.list<PracticeSession>("sessions",organizationId)
        .filter(s=>s.coachUserIds.includes(coachUserId)&&inScope(s));
      const programs=this.foundation.store.list<Program>("programs",organizationId)
        .filter(p=>sessions.some(s=>s.programId===p.id));
      return{memberships,sessions,programs};
    },academyId,locationIds);
  }
  note(ctx:AuthorizationContext,organizationId:string,sessionId:string,noteId:string,body:string):PracticeNote{if(!this.foundation.hasCapability(ctx,"coach.workspace"))throw new Error("ENTITLEMENT_REQUIRED");const session=this.scheduling.read(ctx,organizationId,sessionId);return this.foundation.runAuthorized(ctx,"practice-note.manage","practiceNote",noteId,organizationId,identity=>{if(!body.trim()||body.length>2000)throw new Error("INVALID_PRACTICE_NOTE");const note={id:noteId,organizationId,sessionId,authorUserId:identity.userId,body:body.trim(),createdAt:new Date().toISOString()};this.foundation.store.put("practiceNotes",note);return note;},session.academyId,[session.locationId]);}
}
