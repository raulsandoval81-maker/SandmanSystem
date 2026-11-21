import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AuthorizationContext, CommercialAthlete, DevelopmentPathway, ProgressionCycle, TransferAcceptance, VerifiedIdentity } from "./contracts";
import { CommercialFoundation } from "./foundation";
import { ProgressionReadService } from "./progression";

type PortableSnapshot={sourceOrganizationId:string;sourceAthleteId:string;pathway:DevelopmentPathway;rank:string;rankIndex:number;earnedStripes:number;activeXp:number;lifetimeXp:number;promotions:Array<{fromRank:string;toRank:string;promotedAt:string}>;readOnly:true;transferAuthorized:false};
type TransferPayload={version:1;nonce:string;destinationOrganizationId:string;consentType:"adult"|"guardian";consentedAt:string;expiresAt:string;snapshot:PortableSnapshot};
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value),"utf8").toString("base64url");
/**
 * Trusted host-supplied verification that source and destination records refer
 * to the same person. IDs or names matching are not identity proof.
 * A production implementation must use independently verified identity records.
 */
export interface TransferIdentityAuthority{
  sameAthlete(input:{
    sourceOrganizationId:string;sourceAthleteId:string;
    destinationOrganizationId:string;destinationAthleteId:string;
    consentType:"adult"|"guardian";packageDigest:string
  }):boolean;
}


/** Integrity-protected, explicit consent -> receiving acceptance transfer workflow. */
export class AthleteTransferService{
  constructor(private readonly foundation:CommercialFoundation,private readonly reads:ProgressionReadService,private readonly signingKey:Buffer,private readonly now=()=>new Date(),private readonly identityAuthority?:TransferIdentityAuthority){
    if(signingKey.length<32)throw new Error("TRANSFER_SIGNING_KEY_TOO_SHORT");
  }
  consentAdult(ctx:AuthorizationContext,sourceOrg:string,destinationOrg:string,expiresAt:string){return this.package(this.reads.portableAdult(ctx,sourceOrg) as PortableSnapshot,"adult",destinationOrg,expiresAt);}
  consentGuardian(ctx:AuthorizationContext,sourceOrg:string,athleteId:string,destinationOrg:string,expiresAt:string){return this.package(this.reads.portableGuardian(ctx,sourceOrg,athleteId) as PortableSnapshot,"guardian",destinationOrg,expiresAt);}
  accept(ctx:AuthorizationContext,input:{organizationId:string;destinationAthleteId:string;transferPackage:string;acceptanceId:string}){
    const payload=this.verify(input.transferPackage);const athlete=this.foundation.store.get<CommercialAthlete>("athletes",input.organizationId,input.destinationAthleteId);
    if(!athlete)throw new Error("DESTINATION_ATHLETE_NOT_FOUND");
    const identity=this.foundation.authorizeOperational(ctx,"transfer.accept","transferAcceptance",input.acceptanceId,input.organizationId,athlete.academyId,athlete.locationId?[athlete.locationId]:[]);
    try{const result=this.foundation.transaction(()=>{if(payload.destinationOrganizationId!==input.organizationId||Date.parse(payload.expiresAt)<=this.now().getTime()||payload.snapshot.sourceOrganizationId===input.organizationId)throw new Error("TRANSFER_PACKAGE_NOT_ACCEPTABLE");
      const packageDigest=createHmac("sha256",this.signingKey).update(input.transferPackage).digest("hex");
      if(this.foundation.store.list<TransferAcceptance>("transferAcceptances",input.organizationId).some(a=>a.packageDigest===packageDigest))throw new Error("TRANSFER_REPLAY_DENIED");
      // Neither equal local athlete IDs nor Manager selection establishes personhood.
      // Reject transfers unless a trusted independently verified binding exists.
      if(!this.identityAuthority?.sameAthlete({
        sourceOrganizationId:payload.snapshot.sourceOrganizationId,
        sourceAthleteId:payload.snapshot.sourceAthleteId,
        destinationOrganizationId:input.organizationId,
        destinationAthleteId:athlete.id,
        consentType:payload.consentType,packageDigest
      }))throw new Error("TRANSFER_ATHLETE_IDENTITY_UNVERIFIED");
      const cycles=this.foundation.store.list<ProgressionCycle>("progressionCycles",input.organizationId).filter(c=>c.athleteId===athlete.id&&c.state==="active");if(cycles.length!==1)throw new Error("DESTINATION_PROGRESSION_REQUIRED");const cycle=cycles[0];
      if(cycle.pathway!==payload.snapshot.pathway)throw new Error("RECEIVING_CURRICULUM_INCOMPATIBLE");
      if(cycle.rankIndex!==0||cycle.sequence!==0||cycle.activeXp!==0||cycle.lifetimeXp!==0||cycle.earnedStripes!==0||this.foundation.store.list<TransferAcceptance>("transferAcceptances",input.organizationId).some(a=>a.destinationAthleteId===athlete.id))throw new Error("DESTINATION_PROGRESSION_NOT_PRISTINE");
      const updated:ProgressionCycle={...cycle,rankIndex:payload.snapshot.rankIndex,activeXp:payload.snapshot.activeXp,lifetimeXp:payload.snapshot.lifetimeXp,earnedStripes:payload.snapshot.earnedStripes,sequence:payload.snapshot.rankIndex};
      const record:TransferAcceptance={id:input.acceptanceId,organizationId:input.organizationId,destinationAthleteId:athlete.id,sourceOrganizationId:payload.snapshot.sourceOrganizationId,sourceAthleteId:payload.snapshot.sourceAthleteId,consentType:payload.consentType,packageDigest,pathway:payload.snapshot.pathway,rankIndex:payload.snapshot.rankIndex,earnedStripes:payload.snapshot.earnedStripes,activeXp:payload.snapshot.activeXp,lifetimeXp:payload.snapshot.lifetimeXp,promotionHistory:payload.snapshot.promotions,acceptedByUserId:identity.userId,acceptedAt:this.now().toISOString()};
      this.foundation.store.put("transferAcceptances",record);this.foundation.store.put("progressionCycles",updated,true);return record;
    });this.foundation.auditOperational(identity,"transfer.accept","transferAcceptance",input.acceptanceId,"permitted");return result;}
    catch(error){this.foundation.auditOperational(identity,"transfer.accept","transferAcceptance",input.acceptanceId,"rejected",error instanceof Error?error.message:"UNKNOWN");throw error;}
  }
  private package(snapshot:PortableSnapshot,consentType:"adult"|"guardian",destinationOrganizationId:string,expiresAt:string){if(!destinationOrganizationId||!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=this.now().getTime())throw new Error("INVALID_TRANSFER_DESTINATION_OR_EXPIRY");const payload:TransferPayload={version:1,nonce:randomBytes(16).toString("hex"),destinationOrganizationId,consentType,consentedAt:this.now().toISOString(),expiresAt,snapshot};const body=encode(payload),signature=createHmac("sha256",this.signingKey).update(body).digest("base64url");return`${body}.${signature}`;}
  private verify(value:string):TransferPayload{const [body,signature,...extra]=String(value).split(".");if(!body||!signature||extra.length)throw new Error("INVALID_TRANSFER_SIGNATURE");const expected=createHmac("sha256",this.signingKey).update(body).digest();let actual:Buffer;try{actual=Buffer.from(signature,"base64url");}catch{throw new Error("INVALID_TRANSFER_SIGNATURE");}if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new Error("INVALID_TRANSFER_SIGNATURE");let payload:TransferPayload;try{payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));}catch{throw new Error("INVALID_TRANSFER_PACKAGE");}const validPathway=payload?.snapshot?.pathway==="road2champion"||payload?.snapshot?.pathway==="path2legend",keys=payload?.snapshot?.pathway==="road2champion"?["shadow","prospect","competitor","contender","champion"]:["apprentice","warrior","hero","veteran","legend"],history=payload?.snapshot?.promotions,historyValid=Array.isArray(history)&&history.length===payload?.snapshot?.rankIndex&&history.every((p,index)=>p.fromRank===keys[index]&&p.toRank===keys[index+1]&&Number.isFinite(Date.parse(p.promotedAt))&&(index===0||Date.parse(p.promotedAt)>=Date.parse(history[index-1].promotedAt)));const consented=Date.parse(payload?.consentedAt),expires=Date.parse(payload?.expiresAt),now=this.now().getTime();
    const metadataValid=payload?.consentType==="adult"||payload?.consentType==="guardian";
    const snapshot=payload?.snapshot;
    if(!metadataValid||typeof payload?.nonce!=="string"||!/^[a-f0-9]{32}$/.test(payload.nonce)||
      typeof payload?.destinationOrganizationId!=="string"||!payload.destinationOrganizationId.trim()||
      !Number.isFinite(consented)||!Number.isFinite(expires)||consented>now||
      expires<=consented||expires<=now||
      typeof snapshot?.sourceOrganizationId!=="string"||!snapshot.sourceOrganizationId.trim()||
      typeof snapshot?.sourceAthleteId!=="string"||!snapshot.sourceAthleteId.trim()||
      snapshot.readOnly!==true||snapshot.transferAuthorized!==false||
      (validPathway&&Number.isInteger(snapshot.rankIndex)&&snapshot.rank!==keys[snapshot.rankIndex]))
      throw new Error("INVALID_TRANSFER_PACKAGE");
    if(payload.version!==1||!payload.nonce||!payload.snapshot||!validPathway||!Number.isInteger(payload.snapshot.rankIndex)||payload.snapshot.rankIndex<0||payload.snapshot.rankIndex>4||!Number.isInteger(payload.snapshot.activeXp)||payload.snapshot.activeXp<0||!Number.isInteger(payload.snapshot.lifetimeXp)||payload.snapshot.lifetimeXp<payload.snapshot.activeXp||!Number.isInteger(payload.snapshot.earnedStripes)||payload.snapshot.earnedStripes<0||payload.snapshot.earnedStripes>4||!historyValid)throw new Error("INVALID_TRANSFER_PACKAGE");return payload;}
}
