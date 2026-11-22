import {
  Academy, AthleteIdentityLink, AuthorizationContext, CommercialAthlete, CurriculumAssignment,
  CurriculumDefinition, CurriculumRank, DevelopmentPathway, GuardianAthleteLink,
  GuardianProfile, PracticeSession, Program, ProgressionCycle, PromotionRecord, RecoveryCase, SkillEvaluation, VerifiedIdentity,
  XpEvent, XpLane,
} from "./contracts";
import { CommercialFoundation } from "./foundation";
import { APPROVED_COMMERCIAL_DISCIPLINES, assertId } from "./validation";

export const ROAD2CHAMPION_RANKS: readonly CurriculumRank[] = Object.freeze([
  { key:"shadow",name:"Shadow",requiredXp:800,order:0 },
  { key:"prospect",name:"Prospect",requiredXp:1600,order:1 },
  { key:"competitor",name:"Competitor",requiredXp:2400,order:2 },
  { key:"contender",name:"Contender",requiredXp:2800,order:3 },
  { key:"champion",name:"Champion",requiredXp:3200,order:4 },
]);
export const PATH2LEGEND_RANKS: readonly CurriculumRank[] = Object.freeze([
  { key:"apprentice",name:"Apprentice",requiredXp:1000,order:0 },
  { key:"warrior",name:"Warrior",requiredXp:1600,order:1 },
  { key:"hero",name:"Hero",requiredXp:2400,order:2 },
  { key:"veteran",name:"Veteran",requiredXp:2800,order:3 },
  { key:"legend",name:"Legend",requiredXp:3000,order:4 },
]);

type ProgressionAction="xp.manage"|"xp.coach"|"athlete.self"|"parent.hub";
function authorized<T>(foundation:CommercialFoundation,ctx:AuthorizationContext,action:ProgressionAction,type:string,id:string,org:string,operation:(identity:VerifiedIdentity)=>T,academyId?:string,locations:string[]=[]):T{
  const identity=foundation.authorizeOperational(ctx,action,type,id,org,academyId,locations);
  try{const result=operation(identity);foundation.auditOperational(identity,action,type,id,"permitted");return result;}
  catch(error){foundation.auditOperational(identity,action,type,id,"rejected",error instanceof Error?error.message:"UNKNOWN");throw error;}
}
const ranksFor=(pathway:DevelopmentPathway)=>pathway==="road2champion"?ROAD2CHAMPION_RANKS:PATH2LEGEND_RANKS;
const sameRanks=(actual:CurriculumRank[],expected:readonly CurriculumRank[])=>JSON.stringify(actual)===JSON.stringify(expected);
// Only approved combat disciplines enter Commercial's active curriculum pipeline.
// Future disciplines remain unpublished until separately approved and verified.
const approvedDisciplines = new Set<string>(APPROVED_COMMERCIAL_DISCIPLINES);
const validSkills = (skills:CurriculumDefinition["skills"]) =>
  Array.isArray(skills) && skills.length > 0 && skills.some(s=>s.required===true) &&
  skills.every(s=>typeof s.id==="string" && s.id.trim().length>0 &&
    typeof s.name==="string" && s.name.trim().length>0 &&
    typeof s.category==="string" && s.category.trim().length>0 &&
    typeof s.required==="boolean") &&
  new Set(skills.map(s=>s.id)).size===skills.length;

export class CurriculumService{
  constructor(private readonly foundation:CommercialFoundation,private readonly now=()=>new Date()){}
  createDefinition(ctx:AuthorizationContext,definition:CurriculumDefinition){return authorized(this.foundation,ctx,"xp.manage","curriculum",definition.id,definition.organizationId,()=>{
    assertId(definition.id);const academy=this.foundation.store.get("academies",definition.organizationId,definition.academyId);
    if(!academy||!definition.version.trim()||definition.state!=="active"||!approvedDisciplines.has(definition.discipline)||!sameRanks(definition.ranks,ranksFor(definition.pathway))||!validSkills(definition.skills))throw new Error("INVALID_OR_UNVERIFIED_CURRICULUM");
    this.foundation.store.put("curricula",definition);return structuredClone(definition);
  },definition.academyId);}
  /** Coach-authored material uses the same verified Sandman pathway and curriculum safeguards. */
  createCoachDefinition(ctx:AuthorizationContext,definition:CurriculumDefinition){
    if(!this.foundation.hasCapability(ctx,"coach.workspace"))throw new Error("ENTITLEMENT_REQUIRED");
    return authorized(this.foundation,ctx,"xp.coach","curriculum",definition.id,definition.organizationId,()=>{
      assertId(definition.id);
      const academy=this.foundation.store.get<Academy>("academies",definition.organizationId,definition.academyId);
      const eligibleProgram=this.foundation.store.list<Program>("programs",definition.organizationId).some(program=>
        program.state==="active"&&program.academyId===definition.academyId&&
        program.disciplines.includes(definition.discipline));
      if(!academy||academy.state!=="active"||!eligibleProgram||!definition.version.trim()||
        definition.state!=="active"||!approvedDisciplines.has(definition.discipline)||
        !sameRanks(definition.ranks,ranksFor(definition.pathway))||!validSkills(definition.skills))
        throw new Error("INVALID_OR_UNVERIFIED_CURRICULUM");
      this.foundation.store.put("curricula",definition);
      return structuredClone(definition);
    },definition.academyId);
  }
  readDefinition(ctx:AuthorizationContext,org:string,id:string){const definition=this.foundation.store.get<CurriculumDefinition>("curricula",org,id);if(!definition)throw new Error("CURRICULUM_NOT_FOUND");return authorized(this.foundation,ctx,"xp.manage","curriculum",id,org,()=>definition,definition.academyId);}
  assign(ctx:AuthorizationContext,assignment:Omit<CurriculumAssignment,"assignedByUserId"|"assignedAt">){const athlete=this.athlete(assignment.organizationId,assignment.athleteId);return authorized(this.foundation,ctx,"xp.manage","curriculumAssignment",assignment.id,assignment.organizationId,identity=>this.foundation.transaction(()=>{
    const curriculum=this.foundation.store.get<CurriculumDefinition>("curricula",assignment.organizationId,assignment.curriculumId);
    if(!curriculum||!approvedDisciplines.has(curriculum.discipline)||!sameRanks(curriculum.ranks,ranksFor(curriculum.pathway))||!validSkills(curriculum.skills)||curriculum.academyId!==athlete.academyId||assignment.state!=="active"||this.foundation.store.list<CurriculumAssignment>("curriculumAssignments",assignment.organizationId).some(a=>a.athleteId===athlete.id&&a.state==="active"))throw new Error("INVALID_CURRICULUM_ASSIGNMENT");
    const record={...assignment,assignedByUserId:identity.userId,assignedAt:this.now().toISOString()};this.foundation.store.put("curriculumAssignments",record);
    const cycle:ProgressionCycle={id:`cycle-${assignment.id}`,organizationId:assignment.organizationId,athleteId:athlete.id,assignmentId:assignment.id,pathway:curriculum.pathway,rankIndex:0,activeXp:0,lifetimeXp:0,earnedStripes:0,seasonPhase:"preseason",sequence:0,state:"active"};this.foundation.store.put("progressionCycles",cycle);return record;
  }),athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  evaluate(ctx:AuthorizationContext,evaluation:Omit<SkillEvaluation,"coachUserId"|"evaluatedAt">){const athlete=this.athlete(evaluation.organizationId,evaluation.athleteId);return authorized(this.foundation,ctx,"xp.coach","skillEvaluation",evaluation.id,evaluation.organizationId,identity=>{
    const assignment=this.foundation.store.get<CurriculumAssignment>("curriculumAssignments",evaluation.organizationId,evaluation.assignmentId);const curriculum=assignment&&this.foundation.store.get<CurriculumDefinition>("curricula",evaluation.organizationId,assignment.curriculumId);
    if(!assignment||assignment.state!=="active"||assignment.athleteId!==athlete.id||
      this.foundation.store.list<ProgressionCycle>("progressionCycles",evaluation.organizationId).filter(c=>c.athleteId===athlete.id&&c.state==="active"&&c.assignmentId===assignment.id).length!==1||
      !curriculum?.skills.some(s=>s.id===evaluation.skillId)||!(athlete.assignedCoachUserIds||[]).includes(identity.userId)||
      !["introduced","developing","approved"].includes(evaluation.status)||
      (evaluation.note!==undefined&&(typeof evaluation.note!=="string"||evaluation.note.length>2000)))throw new Error("INVALID_SKILL_EVALUATION");
    const activeCycle=this.foundation.store.list<ProgressionCycle>("progressionCycles",evaluation.organizationId)
      .find(c=>c.athleteId===athlete.id&&c.state==="active"&&c.assignmentId===assignment.id);
    if(!activeCycle)throw new Error("ACTIVE_PROGRESSION_CYCLE_REQUIRED");
    // The server, not the coach's request, records which rank was evaluated.
    const record={...evaluation,coachUserId:identity.userId,evaluatedAt:this.now().toISOString(),rankIndexAtEvaluation:activeCycle.rankIndex};
    this.foundation.store.put("skillEvaluations",record);return record;
  },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  private athlete(org:string,id:string){const athlete=this.foundation.store.get<CommercialAthlete>("athletes",org,id);if(!athlete||athlete.participationState!=="active")throw new Error("ATHLETE_NOT_ACTIVE");return athlete;}
}

export class XpLedgerService{
  constructor(private readonly foundation:CommercialFoundation,private readonly now=()=>new Date()){}
  submitCoach(ctx:AuthorizationContext,input:{organizationId:string;athleteId:string;sourceEventId:string;lane:"strength"|"honor";amount:number;source:string;reason?:string;practiceSessionId?:string}){const athlete=this.athlete(input.organizationId,input.athleteId);return authorized(this.foundation,ctx,"xp.coach","xpEvent",input.sourceEventId,input.organizationId,identity=>{
    if(!(athlete.assignedCoachUserIds||[]).includes(identity.userId))throw new Error("COACH_NOT_ASSIGNED");
    if(input.lane==="strength"&&![5,10].includes(input.amount)||input.lane==="honor"&&input.amount!==5)throw new Error("UNAPPROVED_XP_AMOUNT");
    if(input.lane==="strength"&&input.source!=="structured-strength"||input.lane==="honor"&&input.source!=="verified-honor")throw new Error("UNVERIFIED_XP_SOURCE");
    return this.append(input,identity.userId);
  },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  setSeasonPhase(ctx:AuthorizationContext,org:string,athleteId:string,phase:"preseason"|"in_season"|"postseason"){const athlete=this.athlete(org,athleteId);return authorized(this.foundation,ctx,"xp.coach","progressionCycle",athleteId,org,identity=>{if(!(athlete.assignedCoachUserIds||[]).includes(identity.userId))throw new Error("COACH_NOT_ASSIGNED");const cycle=this.cycle(org,athleteId),updated={...cycle,seasonPhase:phase};this.foundation.store.put("progressionCycles",updated,true);return updated;},athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  coachHistory(ctx:AuthorizationContext,org:string,athleteId:string){const athlete=this.athlete(org,athleteId);return authorized(this.foundation,ctx,"xp.coach","xpHistory",athleteId,org,identity=>{if(!(athlete.assignedCoachUserIds||[]).includes(identity.userId))throw new Error("COACH_NOT_ASSIGNED");return this.foundation.store.list<XpEvent>("xpEvents",org).filter(e=>e.athleteId===athleteId);},athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  adjust(ctx:AuthorizationContext,input:{organizationId:string;athleteId:string;sourceEventId:string;amount:number;reason:string;correctionOf?:string}){const athlete=this.athlete(input.organizationId,input.athleteId);return authorized(this.foundation,ctx,"xp.manage","xpEvent",input.sourceEventId,input.organizationId,identity=>{
    if(!Number.isInteger(input.amount)||input.amount===0||!input.reason.trim())throw new Error("INVALID_XP_ADJUSTMENT");
    return this.append({...input,lane:"adjustment",source:"management-adjustment"},identity.userId);
  },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  applyDecay(ctx:AuthorizationContext,input:{organizationId:string;athleteId:string;sourceEventId:string;amount:number;reason:string}){const athlete=this.athlete(input.organizationId,input.athleteId);return authorized(this.foundation,ctx,"xp.manage","xpEvent",input.sourceEventId,input.organizationId,identity=>{
    // Do not treat a Management-supplied reason as evidence that decay is policy-approved.
    throw new Error("DECAY_POLICY_UNVERIFIED");
  },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  /**
   * Non-mutating evidence check for a possible return practice. Attendance alone
   * cannot prove full participation or clear a decay/recovery status.
   */
  previewRecoveryAttendance(ctx:AuthorizationContext,input:{
    organizationId:string;athleteId:string;sessionId:string
  }){
    const athlete=this.athlete(input.organizationId,input.athleteId);
    return authorized(this.foundation,ctx,"xp.manage","recoveryEvidence",input.sessionId,input.organizationId,()=>{
      const session=this.foundation.store.get<import("./contracts").PracticeSession>(
        "sessions",input.organizationId,input.sessionId);
      const attendance=this.foundation.store.get<import("./contracts").AttendanceRecord>(
        "attendance",input.organizationId,`${input.sessionId}--${input.athleteId}`);
      if(!session||session.state!=="completed"||
        session.programId!==athlete.programId||
        (athlete.locationId!==undefined&&session.locationId!==athlete.locationId)||
        (athlete.academyId!==undefined&&session.academyId!==athlete.academyId)||
        !attendance||attendance.sessionId!==session.id||
        attendance.athleteId!==athlete.id||attendance.state!=="present"||
        !Number.isFinite(Date.parse(session.endsAt))||
        Date.parse(session.endsAt)>this.now().getTime())
        throw new Error("RECOVERY_PRACTICE_EVIDENCE_UNVERIFIED");
      return {
        athleteId:athlete.id,sessionId:session.id,attendanceVerified:true,
        fullPracticeVerified:false,recoveryCleared:false,combatXpAwarded:0,readOnly:true
      };
    },athlete.academyId,athlete.locationId?[athlete.locationId]:[]);
  }
  recordRecoveryCandidate():never{throw new Error("RECOVERY_POLICY_UNVERIFIED");}
  history(ctx:AuthorizationContext,org:string,athleteId:string){const athlete=this.athlete(org,athleteId);return authorized(this.foundation,ctx,"xp.manage","xpHistory",athleteId,org,()=>this.foundation.store.list<XpEvent>("xpEvents",org).filter(e=>e.athleteId===athleteId),athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  eligibility(ctx:AuthorizationContext,org:string,athleteId:string){const athlete=this.athlete(org,athleteId);return authorized(this.foundation,ctx,"xp.manage","rankEligibility",athleteId,org,()=>{const cycle=this.cycle(org,athleteId),rank=ranksFor(cycle.pathway)[cycle.rankIndex];return{athleteId,rank:rank.name,xpEligible:cycle.activeXp>=rank.requiredXp,additionalRequirementsRequired:cycle.rankIndex<ranksFor(cycle.pathway).length-1};},athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  promote(ctx:AuthorizationContext,input:{organizationId:string;athleteId:string;promotionId:string;requirementsVerified:boolean}){const athlete=this.athlete(input.organizationId,input.athleteId);return authorized(this.foundation,ctx,"xp.manage","promotion",input.promotionId,input.organizationId,identity=>this.foundation.transaction(()=>{
    const cycle=this.cycle(input.organizationId,input.athleteId),ranks=ranksFor(cycle.pathway),current=ranks[cycle.rankIndex],next=ranks[cycle.rankIndex+1];
    if(this.foundation.store.get("promotions",input.organizationId,input.promotionId))throw new Error("DUPLICATE_PROMOTION");
    if(!next)throw new Error("FINAL_RANK_CANNOT_PROMOTE");
    if(cycle.activeXp<current.requiredXp)throw new Error("PREMATURE_PROMOTION");
    if(input.requirementsVerified!==true)throw new Error("ADVANCEMENT_REQUIREMENTS_UNVERIFIED");
    const assignment=this.foundation.store.get<CurriculumAssignment>("curriculumAssignments",input.organizationId,cycle.assignmentId);
    const curriculum=assignment&&this.foundation.store.get<CurriculumDefinition>("curricula",input.organizationId,assignment.curriculumId);
    if(!assignment||assignment.state!=="active"||!curriculum||curriculum.state!=="active"||
      curriculum.pathway!==cycle.pathway||!approvedDisciplines.has(curriculum.discipline)||
      !sameRanks(curriculum.ranks,ranks)||!validSkills(curriculum.skills))throw new Error("PROMOTION_EVIDENCE_UNVERIFIED");
    const approvals=this.foundation.store.list<SkillEvaluation>("skillEvaluations",input.organizationId).filter(e=>
      e.athleteId===athlete.id&&e.assignmentId===assignment.id&&e.status==="approved"&&
      (e.rankIndexAtEvaluation===cycle.rankIndex||(cycle.rankIndex===0&&e.rankIndexAtEvaluation===undefined)));
    if(curriculum.skills.filter(skill=>skill.required).some(skill=>!approvals.some(e=>e.skillId===skill.id)))
      throw new Error("PROMOTION_EVIDENCE_UNVERIFIED");
    // The existing generic attestation remains additional to the independently stored skill evidence.
    // A complete production advancement policy remains a separate release gate.
    const record:PromotionRecord={id:input.promotionId,organizationId:input.organizationId,athleteId:athlete.id,cycleId:cycle.id,pathway:cycle.pathway,fromRank:current.key,toRank:next.key,historicalXpAtPromotion:cycle.lifetimeXp,promotedByUserId:identity.userId,promotedAt:this.now().toISOString(),requirementsVerified:true};
    this.foundation.store.put("promotions",record);this.foundation.store.put("progressionCycles",{...cycle,rankIndex:cycle.rankIndex+1,activeXp:0,earnedStripes:0,sequence:cycle.sequence+1},true);return record;
  }),athlete.academyId,athlete.locationId?[athlete.locationId]:[]);}
  private append(input:{organizationId:string;athleteId:string;sourceEventId:string;lane:XpLane;amount:number;source:string;reason?:string;correctionOf?:string;practiceSessionId?:string},actor:string){return this.foundation.transaction(()=>{
    if(!/^[a-zA-Z0-9._:-]+$/.test(input.sourceEventId)||this.foundation.store.list<XpEvent>("xpEvents",input.organizationId).some(e=>e.sourceEventId===input.sourceEventId))throw new Error("DUPLICATE_OR_INVALID_XP_EVENT");
    if(!Number.isInteger(input.amount))throw new Error("INVALID_XP_AMOUNT");const cycle=this.cycle(input.organizationId,input.athleteId),rank=ranksFor(cycle.pathway)[cycle.rankIndex];
    if(input.correctionOf){const original=this.foundation.store.get<XpEvent>("xpEvents",input.organizationId,input.correctionOf);if(!original||original.athleteId!==input.athleteId)throw new Error("INVALID_CORRECTION_REFERENCE");}
    const operationalAmount=input.amount;
    if(input.lane==="strength"||input.lane==="honor"){
      const recoveries=this.foundation.store.list<RecoveryCase>("recoveryCases",input.organizationId).filter(c=>c.athleteId===input.athleteId&&c.state==="evidence_pending");
      if(recoveries.length>1)throw new Error("AMBIGUOUS_RECOVERY_CASE");const recovery=recoveries[0];
      if(recovery)throw new Error("RECOVERY_RETURN_PRACTICE_REQUIRED");
      const completed=this.foundation.store.list<RecoveryCase>("recoveryCases",input.organizationId).filter(c=>c.athleteId===input.athleteId&&c.state==="completed");
      if(completed.length){
        // After any recovery, a Coach award requires verified session provenance.
        // An omitted or unrelated session ID must never bypass the zero-XP return practice.
        if(!input.practiceSessionId)throw new Error("RECOVERY_XP_PRACTICE_REQUIRED");
        if(completed.some(c=>c.returnPracticeSessionId===input.practiceSessionId))throw new Error("RETURN_PRACTICE_AWARDS_ZERO_COMBAT_XP");
        const athlete=this.athlete(input.organizationId,input.athleteId);
        const session=this.foundation.store.get<PracticeSession>("sessions",input.organizationId,input.practiceSessionId);
        const attendance=this.foundation.store.get<import("./contracts").AttendanceRecord>("attendance",input.organizationId,`${input.practiceSessionId}--${input.athleteId}`);
        const startsAt=session?Date.parse(session.startsAt):NaN,endsAt=session?Date.parse(session.endsAt):NaN;
        if(!session||session.state!=="completed"||!athlete.academyId||!athlete.locationId||
          session.academyId!==athlete.academyId||session.locationId!==athlete.locationId||
          session.programId!==athlete.programId||!session.coachUserIds.includes(actor)||
          !Number.isFinite(startsAt)||!Number.isFinite(endsAt)||endsAt<=startsAt||
          endsAt>this.now().getTime()||!attendance||attendance.athleteId!==athlete.id||
          attendance.sessionId!==session.id||attendance.state!=="present")
          throw new Error("RECOVERY_XP_PRACTICE_UNVERIFIED");
        for(const completedCase of completed){
          const returnSession=completedCase.returnPracticeSessionId&&this.foundation.store.get<PracticeSession>("sessions",input.organizationId,completedCase.returnPracticeSessionId);
          const returnEnd=returnSession?Date.parse(returnSession.endsAt):NaN;
          if(!Number.isFinite(returnEnd)||startsAt<returnEnd)
            throw new Error("RECOVERY_XP_PRACTICE_NOT_AFTER_RETURN");
        }
      }
    }
    const historicalFloor=this.foundation.store.list<PromotionRecord>("promotions",input.organizationId).filter(p=>p.athleteId===input.athleteId).reduce((max,p)=>Math.max(max,p.historicalXpAtPromotion),0),nextLifetime=cycle.lifetimeXp+operationalAmount;if(nextLifetime<historicalFloor)throw new Error("PROMOTION_HISTORY_FLOOR_PROTECTED");
    const floor=Math.ceil(rank.requiredXp*Math.min(4,cycle.earnedStripes)/4),next=Math.max(floor,cycle.activeXp+operationalAmount);if(operationalAmount<0&&next!==cycle.activeXp+operationalAmount)throw new Error("EARNED_STRIPE_FLOOR_PROTECTED");
    const event:XpEvent={id:input.sourceEventId,organizationId:input.organizationId,athleteId:input.athleteId,cycleId:cycle.id,rankIndexAtAward:cycle.rankIndex,lane:input.lane,amount:input.amount,source:input.source,sourceEventId:input.sourceEventId,actorUserId:actor,reason:input.reason,correctionOf:input.correctionOf,practiceSessionId:input.practiceSessionId,occurredAt:this.now().toISOString()};
    const stripes=Math.max(cycle.earnedStripes,Math.min(4,Math.floor(next/(rank.requiredXp/4))));this.foundation.store.put("xpEvents",event);this.foundation.store.put("progressionCycles",{...cycle,activeXp:next,lifetimeXp:Math.max(0,nextLifetime),earnedStripes:stripes},true);return event;
  });}
  private cycle(org:string,athleteId:string){const cycles=this.foundation.store.list<ProgressionCycle>("progressionCycles",org).filter(c=>c.athleteId===athleteId&&c.state==="active");if(cycles.length!==1)throw new Error("ACTIVE_PROGRESSION_CYCLE_REQUIRED");return cycles[0];}
  private athlete(org:string,id:string){const athlete=this.foundation.store.get<CommercialAthlete>("athletes",org,id);if(!athlete||athlete.participationState!=="active")throw new Error("ATHLETE_NOT_ACTIVE");return athlete;}
}

export class ProgressionReadService{
  constructor(private readonly foundation:CommercialFoundation){}
  athlete(ctx:AuthorizationContext,org:string){return authorized(this.foundation,ctx,"athlete.self","progression","self",org,identity=>{const link=this.singleIdentity(org,identity.userId);return this.view(org,link.athleteId);});}
  parent(ctx:AuthorizationContext,org:string,athleteId:string){return authorized(this.foundation,ctx,"parent.hub","progression",athleteId,org,identity=>{
    const guardians=this.foundation.store.list<GuardianProfile>("guardians",org).filter(g=>g.userId===identity.userId&&g.state==="active"),ids=new Set(guardians.map(g=>g.id));
    const link=this.foundation.store.list<GuardianAthleteLink>("guardianLinks",org).find(l=>ids.has(l.guardianId)&&l.athleteId===athleteId&&l.state==="active");if(!link||!link.permissions.includes("progression"))throw new Error("PROGRESSION_PERMISSION_REQUIRED");return this.view(org,athleteId);
  });}
  /**
   * Read-only, minimally scoped achievement preview for a verified adult athlete.
   * This is NOT a transfer approval, signed proof, or receiving-gym import.
   */
  portableAdult(ctx:AuthorizationContext,org:string){
    return authorized(this.foundation,ctx,"athlete.self","portableAchievements","self",org,identity=>{
      const link=this.singleIdentity(org,identity.userId);
      if(link.access!=="adult_self")throw new Error("ADULT_TRANSFER_CONSENT_REQUIRED");
      const athlete=this.foundation.store.get<CommercialAthlete>("athletes",org,link.athleteId);
      if(!athlete||!athlete.adult||athlete.participationState!=="active")throw new Error("ADULT_TRANSFER_CONSENT_REQUIRED");
      return this.portable(org,athlete.id);
    });
  }
  /**
   * Read-only preview for a linked guardian with explicit progression permission.
   * A verified separate consent, receiving Management approval, and tamper-proof
   * transfer provenance are still mandatory before any cross-org write.
   */
  portableGuardian(ctx:AuthorizationContext,org:string,athleteId:string){
    return authorized(this.foundation,ctx,"parent.hub","portableAchievements",athleteId,org,identity=>{
      const athlete=this.foundation.store.get<CommercialAthlete>("athletes",org,athleteId);
      if(!athlete||athlete.adult||athlete.participationState!=="active")throw new Error("GUARDIAN_TRANSFER_ACCESS_REQUIRED");
      const guardians=this.foundation.store.list<GuardianProfile>("guardians",org)
        .filter(g=>g.userId===identity.userId&&g.state==="active");
      const guardianIds=new Set(guardians.map(g=>g.id));
      const link=this.foundation.store.list<GuardianAthleteLink>("guardianLinks",org)
        .find(l=>l.athleteId===athleteId&&guardianIds.has(l.guardianId)&&l.state==="active"&&l.permissions.includes("progression"));
      if(!link)throw new Error("GUARDIAN_TRANSFER_ACCESS_REQUIRED");
      return this.portable(org,athleteId);
    });
  }
  private portable(org:string,athleteId:string){
    const cycles=this.foundation.store.list<ProgressionCycle>("progressionCycles",org)
      .filter(c=>c.athleteId===athleteId&&c.state==="active");
    if(cycles.length!==1)throw new Error("ACTIVE_PROGRESSION_CYCLE_REQUIRED");
    const cycle=cycles[0],rank=ranksFor(cycle.pathway)[cycle.rankIndex];
    if(!rank||!Number.isInteger(cycle.activeXp)||cycle.activeXp<0||
      !Number.isInteger(cycle.lifetimeXp)||cycle.lifetimeXp<cycle.activeXp||
      !Number.isInteger(cycle.earnedStripes)||cycle.earnedStripes<0||cycle.earnedStripes>4||
      cycle.activeXp<Math.ceil(rank.requiredXp*cycle.earnedStripes/4))
      throw new Error("INVALID_PORTABLE_PROGRESSION");
    const ranks=ranksFor(cycle.pathway);
    const chain=this.foundation.store.list<PromotionRecord>("promotions",org)
      .filter(p=>p.athleteId===athleteId&&p.cycleId===cycle.id);
    // The preview is not a signed credential, but it must never display
    // unrelated or internally inconsistent promotion milestones as portable.
    if(cycle.sequence!==cycle.rankIndex||chain.length!==cycle.rankIndex)
      throw new Error("INVALID_PORTABLE_PROMOTION_LINEAGE");
    let previousLifetime=0,previousTime=-Infinity;
    const promotions=chain.sort((a,b)=>ranks.findIndex(r=>r.key===a.fromRank)-ranks.findIndex(r=>r.key===b.fromRank))
      .map((p,index)=>{
        const at=Date.parse(p.promotedAt);
        if(p.pathway!==cycle.pathway||p.requirementsVerified!==true||
          p.fromRank!==ranks[index].key||p.toRank!==ranks[index+1].key||
          !Number.isFinite(at)||at<previousTime||
          !Number.isInteger(p.historicalXpAtPromotion)||
          p.historicalXpAtPromotion<previousLifetime||
          p.historicalXpAtPromotion>cycle.lifetimeXp)
          throw new Error("INVALID_PORTABLE_PROMOTION_LINEAGE");
        previousLifetime=p.historicalXpAtPromotion;previousTime=at;
        return {fromRank:p.fromRank,toRank:p.toRank,promotedAt:p.promotedAt};
      });
    return {
      sourceOrganizationId:org,sourceAthleteId:athleteId,
      pathway:cycle.pathway,rank:rank.key,rankIndex:cycle.rankIndex,
      earnedStripes:cycle.earnedStripes,activeXp:cycle.activeXp,lifetimeXp:cycle.lifetimeXp,
      promotions,readOnly:true,transferAuthorized:false
    };
  }
  private view(org:string,athleteId:string){
    const cycles=this.foundation.store.list<ProgressionCycle>("progressionCycles",org)
      .filter(c=>c.athleteId===athleteId&&c.state==="active");
    if(cycles.length!==1)throw new Error("ACTIVE_PROGRESSION_CYCLE_REQUIRED");
    const cycle=cycles[0],rank=ranksFor(cycle.pathway)[cycle.rankIndex];
    if(!rank)throw new Error("INVALID_PROGRESSION_RANK");
    const approvedSkills=[...new Set(this.foundation.store.list<SkillEvaluation>("skillEvaluations",org)
      .filter(e=>e.athleteId===athleteId&&e.assignmentId===cycle.assignmentId&&
        e.status==="approved"&&
        (e.rankIndexAtEvaluation===cycle.rankIndex||
          (cycle.rankIndex===0&&e.rankIndexAtEvaluation===undefined)))
      .map(e=>e.skillId))];
    const promotions=this.foundation.store.list<PromotionRecord>("promotions",org)
      .filter(p=>p.athleteId===athleteId&&p.cycleId===cycle.id)
      .map(p=>({fromRank:p.fromRank,toRank:p.toRank,promotedAt:p.promotedAt}));
    // Family views must not expose internal coach/management identifiers,
    // attestation actor IDs, private skill notes, or raw event provenance.
    return {athleteId,pathway:cycle.pathway,currentRank:rank.name,activeXp:cycle.activeXp,
      nextRankXp:rank.requiredXp,earnedStripes:cycle.earnedStripes,
      approvedSkills,promotions,readOnly:true};
  }
  private singleIdentity(org:string,userId:string){const links=this.foundation.store.list<AthleteIdentityLink>("athleteIdentityLinks",org).filter(l=>l.userId===userId&&l.state==="active");if(links.length!==1)throw new Error("ATHLETE_ACCESS_REQUIRED");return links[0];}
}
