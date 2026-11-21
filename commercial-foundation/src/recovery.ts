import { AuthorizationContext, CommercialAthlete, PracticeSession, ProgressionCycle, RecoveryCase, RecoveryPenaltyEvent, RecoveryPracticeEvidence, VerifiedIdentity } from "./contracts";
import { CommercialFoundation } from "./foundation";
import { PATH2LEGEND_RANKS, ROAD2CHAMPION_RANKS } from "./progression";

type Action = "xp.manage" | "xp.coach";
function authorized<T>(foundation: CommercialFoundation, ctx: AuthorizationContext, action: Action, type: string, id: string, org: string, run: (identity: VerifiedIdentity) => T, academy?: string, locations: string[] = []) {
  const identity = foundation.authorizeOperational(ctx, action, type, id, org, academy, locations);
  try { const result=run(identity); foundation.auditOperational(identity,action,type,id,"permitted"); return result; }
  catch(error){ foundation.auditOperational(identity,action,type,id,"rejected",error instanceof Error?error.message:"UNKNOWN"); throw error; }
}

export const INACTIVITY_PENALTY_DAYS=Object.freeze([28,35,49,63,77] as const);
export const INACTIVITY_PENALTY_XP=30;
export const MAX_INACTIVITY_EXPOSURE_XP=150;
const dayMs=86_400_000;

/** Approved policy: floor-blocked penalty XP is forgiven and never becomes debt. */
export class RecoveryEvidenceService {
  constructor(private readonly foundation:CommercialFoundation,private readonly now=()=>new Date()){}

  open(ctx:AuthorizationContext,input:{id:string;organizationId:string;athleteId:string;inactivityStartedAt?:string}) {
    const athlete=this.athlete(input.organizationId,input.athleteId);
    return authorized(this.foundation,ctx,"xp.manage","recoveryCase",input.id,input.organizationId,identity=>{
      const cycle=this.cycle(input.organizationId,input.athleteId),started=input.inactivityStartedAt??this.now().toISOString();
      if(!Number.isFinite(Date.parse(started))||Date.parse(started)>this.now().getTime()) throw new Error("INVALID_INACTIVITY_START");
      if(this.foundation.store.list<RecoveryCase>("recoveryCases",input.organizationId).some(c=>c.athleteId===input.athleteId&&c.state==="evidence_pending")) throw new Error("ACTIVE_RECOVERY_CASE_EXISTS");
      const record:RecoveryCase={id:input.id,organizationId:input.organizationId,athleteId:input.athleteId,cycleId:cycle.id,state:"evidence_pending",openedByUserId:identity.userId,openedAt:this.now().toISOString(),inactivityStartedAt:started,verifiedPracticeIds:[],penaltyDaysApplied:[],totalPenaltyXp:0,deductedXp:0,forgivenXp:0,policyActivated:true};
      this.foundation.store.put("recoveryCases",record); return record;
    },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);
  }

  applyPenalty(ctx:AuthorizationContext,input:{organizationId:string;caseId:string;inactivityDay:28|35|49|63|77}) {
    const record=this.required(input.organizationId,input.caseId),athlete=this.athlete(input.organizationId,record.athleteId);
    return authorized(this.foundation,ctx,"xp.manage","recoveryPenalty",`${record.id}:day-${input.inactivityDay}`,input.organizationId,identity=>this.foundation.transaction(()=>{
      const cycle=this.cycle(input.organizationId,athlete.id);
      if(record.state!=="evidence_pending"||record.cycleId!==cycle.id||record.penaltyDaysApplied.includes(input.inactivityDay)||record.totalPenaltyXp+30>150||this.now().getTime()<Date.parse(record.inactivityStartedAt)+input.inactivityDay*dayMs) throw new Error("INACTIVITY_PENALTY_NOT_DUE");
      const ranks=cycle.pathway==="road2champion"?ROAD2CHAMPION_RANKS:PATH2LEGEND_RANKS;
      const floor=Math.ceil(ranks[cycle.rankIndex].requiredXp*cycle.earnedStripes/4),deducted=Math.min(30,Math.max(0,cycle.activeXp-floor)),forgiven=30-deducted;
      const event:RecoveryPenaltyEvent={id:`${record.id}:day-${input.inactivityDay}`,organizationId:input.organizationId,recoveryCaseId:record.id,athleteId:athlete.id,cycleId:cycle.id,rankIndexAtPenalty:cycle.rankIndex,inactivityDay:input.inactivityDay,penaltyXp:30,deductedXp:deducted,forgivenXp:forgiven,appliedByUserId:identity.userId,appliedAt:this.now().toISOString()};
      this.foundation.store.put("recoveryPenalties",event);
      this.foundation.store.put("progressionCycles",{...cycle,activeXp:cycle.activeXp-deducted},true);
      this.foundation.store.put("recoveryCases",{...record,penaltyDaysApplied:[...record.penaltyDaysApplied,input.inactivityDay],totalPenaltyXp:record.totalPenaltyXp+30,deductedXp:record.deductedXp+deducted,forgivenXp:record.forgivenXp+forgiven},true);
      return event;
    }),athlete.academyId,athlete.locationId?[athlete.locationId]:[]);
  }

  verifyPractice(ctx:AuthorizationContext,input:{organizationId:string;caseId:string;sessionId:string;fullParticipation:boolean}) {
    const record=this.required(input.organizationId,input.caseId),athlete=this.athlete(input.organizationId,record.athleteId);
    return authorized(this.foundation,ctx,"xp.coach","recoveryEvidence",input.sessionId,input.organizationId,identity=>this.foundation.transaction(()=>{
      const session=this.foundation.store.get<PracticeSession>("sessions",input.organizationId,input.sessionId),attendance=this.foundation.store.get("attendance",input.organizationId,`${input.sessionId}--${athlete.id}`) as {state?:string}|undefined;
      if(record.state!=="evidence_pending"||record.cycleId!==this.cycle(input.organizationId,athlete.id).id||input.fullParticipation!==true||!session||session.state!=="completed"||!athlete.academyId||!athlete.locationId||session.academyId!==athlete.academyId||session.locationId!==athlete.locationId||session.programId!==athlete.programId||!session.coachUserIds.includes(identity.userId)||!(athlete.assignedCoachUserIds||[]).includes(identity.userId)||attendance?.state!=="present"||!Number.isFinite(Date.parse(session.startsAt))||!Number.isFinite(Date.parse(session.endsAt))||Date.parse(session.endsAt)<=Date.parse(session.startsAt)||Date.parse(session.startsAt)<Date.parse(record.inactivityStartedAt)||Date.parse(session.endsAt)>this.now().getTime()) throw new Error("RECOVERY_PRACTICE_EVIDENCE_UNVERIFIED");
      const evidence:RecoveryPracticeEvidence={id:`${record.id}--${session.id}`,organizationId:input.organizationId,recoveryCaseId:record.id,athleteId:athlete.id,sessionId:session.id,coachUserId:identity.userId,fullParticipation:true,verifiedAt:this.now().toISOString()};
      this.foundation.store.put("recoveryEvidence",evidence);
      this.foundation.store.put("recoveryCases",{...record,state:"completed",returnPracticeSessionId:session.id,verifiedPracticeIds:[...record.verifiedPracticeIds,session.id]},true);
      return evidence;
    }),athlete.academyId,athlete.locationId?[athlete.locationId]:[]);
  }
  activateRecovery():never { throw new Error("MANUAL_RECOVERY_AWARD_FORBIDDEN"); }
  private required(org:string,id:string){const value=this.foundation.store.get<RecoveryCase>("recoveryCases",org,id);if(!value)throw new Error("RECOVERY_CASE_NOT_FOUND");return value;}
  private athlete(org:string,id:string){const value=this.foundation.store.get<CommercialAthlete>("athletes",org,id);if(!value||value.participationState!=="active")throw new Error("ATHLETE_NOT_ACTIVE");return value;}
  private cycle(org:string,athleteId:string){const values=this.foundation.store.list<ProgressionCycle>("progressionCycles",org).filter(c=>c.athleteId===athleteId&&c.state==="active");if(values.length!==1)throw new Error("ACTIVE_PROGRESSION_CYCLE_REQUIRED");return values[0];}
}
