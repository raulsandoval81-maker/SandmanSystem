import { createHash, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { AccessInvitation, AccountProofAuthority, AuthorizationContext, Membership, OrganizationRole, ScopeType, SwitchableIdentityAuthority, VerifiedIdentity } from "./contracts";
import { CommercialFoundation } from "./foundation";
import { assertId } from "./validation";

type JwtClaims={iss?:unknown;aud?:unknown;sub?:unknown;org?:unknown;exp?:unknown;nbf?:unknown;jti?:unknown;systemAdmin?:unknown;email?:unknown;email_verified?:unknown};
const decode=(value:string)=>JSON.parse(Buffer.from(value,"base64url").toString("utf8"));

/**
 * Production authentication adapter for externally issued RS256 access tokens.
 * It verifies signature, issuer, audience, lifetime, token id revocation, and the
 * selected organization. It never accepts caller-supplied role claims.
 */
export class JwtIdentityAuthority implements SwitchableIdentityAuthority{
  constructor(private readonly options:{issuer:string;audience:string;publicKey:(kid:string)=>string|Buffer;isRevoked:(jti:string)=>boolean;issueOrganizationToken?:(identity:VerifiedIdentity,organizationId:string)=>string;canSwitchOrganization?:(identity:VerifiedIdentity,organizationId:string)=>boolean;now?:()=>Date}){}
  verify(ctx:AuthorizationContext):VerifiedIdentity{
    const token=ctx?.sessionId;if(typeof token!=="string")throw new Error("UNVERIFIED_IDENTITY");
    const parts=token.split(".");if(parts.length!==3)throw new Error("UNVERIFIED_IDENTITY");
    let header:any,claims:JwtClaims;try{header=decode(parts[0]);claims=decode(parts[1]);}catch{throw new Error("UNVERIFIED_IDENTITY");}
    // All key-selection and cryptographic failures are authentication failures.
    // Never leak an unknown key ID or a provider/key-store error to callers.
    if(header?.alg!=="RS256"||typeof header.kid!=="string"||!header.kid||
      !/^[A-Za-z0-9_-]+$/.test(parts[2]))throw new Error("UNVERIFIED_IDENTITY");
    try{
      const key=this.options.publicKey(header.kid);
      if(!key||!verifySignature("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url")))
        throw new Error("UNVERIFIED_IDENTITY");
    }catch{throw new Error("UNVERIFIED_IDENTITY");}
    const now=Math.floor((this.options.now?.()??new Date()).getTime()/1000);
    if(claims.iss!==this.options.issuer||claims.aud!==this.options.audience||
      typeof claims.sub!=="string"||!claims.sub.trim()||
      typeof claims.org!=="string"||!claims.org.trim()||
      (typeof claims.exp!=="number"||!Number.isSafeInteger(claims.exp)||claims.exp<=now)||
      (claims.nbf!==undefined&&(typeof claims.nbf!=="number"||!Number.isSafeInteger(claims.nbf)||claims.nbf>now))||
      typeof claims.jti!=="string"||!claims.jti.trim())throw new Error("UNVERIFIED_IDENTITY");
    try{if(this.options.isRevoked(claims.jti))throw new Error("UNVERIFIED_IDENTITY");}
    catch{throw new Error("UNVERIFIED_IDENTITY");}
    return Object.freeze({userId:claims.sub,selectedOrganizationId:claims.org,systemAdmin:claims.systemAdmin===true});
  }
  switchOrganization(ctx:AuthorizationContext,organizationId:string):AuthorizationContext{
    const identity=this.verify(ctx);
    if(!this.options.issueOrganizationToken||!this.options.canSwitchOrganization)
      throw new Error("ORGANIZATION_SWITCH_REQUIRES_TRUSTED_ISSUER");
    // Target membership must be checked by the trusted server, never inferred from
    // the caller's desired org or from a token's untrusted role claims.
    if(typeof organizationId!=="string"||!organizationId.trim())throw new Error("ORGANIZATION_SWITCH_DENIED");
    try{
      if(!this.options.canSwitchOrganization(identity,organizationId))throw new Error("ORGANIZATION_SWITCH_DENIED");
      const sessionId=this.options.issueOrganizationToken(identity,organizationId);
      const issued=this.verify({sessionId});
      if(issued.userId!==identity.userId||issued.selectedOrganizationId!==organizationId||
         issued.systemAdmin!==identity.systemAdmin)throw new Error("ORGANIZATION_SWITCH_DENIED");
      return Object.freeze({sessionId});
    }catch{throw new Error("ORGANIZATION_SWITCH_DENIED");}
  }
}

/**
 * Account ownership proof from a signed, unexpired access token.
 * The same trusted JWT authority verifies the token before its verified email
 * claims may be used to accept an invitation. Never use the invitation's
 * requested email or unverified profile input as account proof.
 */
export class JwtVerifiedAccountProofAuthority implements AccountProofAuthority {
  constructor(private readonly authority:JwtIdentityAuthority){}
  verify(ctx:AuthorizationContext){
    let identity:VerifiedIdentity,claims:JwtClaims;
    try{
      identity=this.authority.verify(ctx);
      claims=decode(ctx.sessionId.split(".")[1]) as JwtClaims;
    }catch{throw new Error("UNVERIFIED_ACCOUNT_PROOF");}
    if(!claims||typeof claims!=="object")throw new Error("UNVERIFIED_ACCOUNT_PROOF");
    const address=claims.email;
    if(claims.email_verified!==true||typeof address!=="string"||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim())||
       claims.sub!==identity.userId)throw new Error("UNVERIFIED_ACCOUNT_PROOF");
    return Object.freeze({userId:identity.userId,verifiedEmail:address.trim().toLowerCase()});
  }
}

const digest=(token:string)=>createHash("sha256").update(token,"utf8").digest("hex");
const sameDigest=(left:string,right:string)=>{const a=Buffer.from(left,"hex"),b=Buffer.from(right,"hex");return a.length===b.length&&timingSafeEqual(a,b);};
const email=(value:string)=>value.trim().toLowerCase();
export class CommercialInvitationService{
  constructor(private readonly foundation:CommercialFoundation,private readonly proofAuthority:AccountProofAuthority,private readonly now=()=>new Date(),private readonly token=()=>randomBytes(32).toString("base64url")){}
  issue(ctx:AuthorizationContext,input:{id:string;organizationId:string;email:string;role:OrganizationRole;scopeType:ScopeType;scopeId:string;expiresAt:string}){
    const academyId=input.scopeType==="academy"?input.scopeId:input.scopeType==="location"?(this.foundation.store.get("locations",input.organizationId,input.scopeId) as {academyId?:string}|undefined)?.academyId:undefined;
    const locations=input.scopeType==="location"?[input.scopeId]:[];
    const identity=this.foundation.authorizeOperational(ctx,"identity.invite","accessInvitation",input.id,input.organizationId,academyId,locations);
    try{const result=this.foundation.transaction(()=>{assertId(input.id);const normalized=email(input.email),expires=Date.parse(input.expiresAt),memberships=this.foundation.store.list<Membership>("memberships",input.organizationId).filter(m=>m.userId===identity.userId&&m.state==="active"),staffInvite=input.role==="management"||input.role==="coach",staffAllowed=identity.systemAdmin||memberships.some(m=>m.role==="organization_admin"&&m.scopeType==="organization"||m.role==="management"&&m.scopeType==="location"&&input.scopeType==="location"&&m.scopeId===input.scopeId);if(!normalized||!normalized.includes("@")||!Number.isFinite(expires)||expires<=this.now().getTime()||!["management","coach","parent","adult_athlete","athlete"].includes(input.role)||!this.scopeExists(input.organizationId,input.scopeType,input.scopeId)||(staffInvite&&!staffAllowed))throw new Error("INVALID_ACCESS_INVITATION");
      const raw=this.token(),tokenDigest=digest(raw);if(this.foundation.store.list<AccessInvitation>("accessInvitations",input.organizationId).some(i=>i.tokenDigest===tokenDigest))throw new Error("DUPLICATE_INVITATION_TOKEN");const record:AccessInvitation={...input,email:normalized,tokenDigest,state:"pending",invitedByUserId:identity.userId,invitedAt:this.now().toISOString()};this.foundation.store.put("accessInvitations",record);return{invitation:{...record,tokenDigest:"[REDACTED]"},token:raw};});this.foundation.auditOperational(identity,"identity.invite","accessInvitation",input.id,"permitted");return result;}
    catch(error){this.foundation.auditOperational(identity,"identity.invite","accessInvitation",input.id,"rejected",error instanceof Error?error.message:"UNKNOWN");throw error;}
  }
  accept(proofCtx:AuthorizationContext,input:{organizationId:string;invitationId:string;token:string}){
    const proof=this.proofAuthority.verify(proofCtx),invitation=this.foundation.store.get<AccessInvitation>("accessInvitations",input.organizationId,input.invitationId);if(!invitation)throw new Error("INVITATION_NOT_FOUND");
    const identity:VerifiedIdentity={userId:proof.userId,selectedOrganizationId:input.organizationId,systemAdmin:false};
    try{return this.foundation.transaction(()=>{if(!proof.userId||invitation.state!=="pending"||Date.parse(invitation.expiresAt)<=this.now().getTime()||email(proof.verifiedEmail)!==invitation.email||!sameDigest(digest(input.token),invitation.tokenDigest))throw new Error("INVITATION_NOT_CONSUMABLE");
      const membership:Membership={id:`accepted-${invitation.id}`,organizationId:invitation.organizationId,userId:proof.userId,role:invitation.role,scopeType:invitation.scopeType,scopeId:invitation.scopeId,state:"active"};
      if(this.foundation.store.list<Membership>("memberships",invitation.organizationId).some(m=>m.userId===membership.userId&&m.role===membership.role&&m.scopeType===membership.scopeType&&m.scopeId===membership.scopeId&&m.state==="active"))throw new Error("DUPLICATE_ACTIVE_MEMBERSHIP");
      this.foundation.store.put("memberships",membership);this.foundation.store.put("accessInvitations",{...invitation,state:"accepted",acceptedByUserId:proof.userId,acceptedAt:this.now().toISOString()},true);this.foundation.auditOperational(identity,"identity.accept","accessInvitation",invitation.id,"permitted");return membership;});}
    catch(error){this.foundation.auditOperational(identity,"identity.accept","accessInvitation",invitation.id,"rejected",error instanceof Error?error.message:"UNKNOWN");throw error;}
  }
  revoke(ctx:AuthorizationContext,organizationId:string,id:string){const invitation=this.foundation.store.get<AccessInvitation>("accessInvitations",organizationId,id);if(!invitation)throw new Error("INVITATION_NOT_FOUND");const academyId=invitation.scopeType==="academy"?invitation.scopeId:invitation.scopeType==="location"?(this.foundation.store.get("locations",organizationId,invitation.scopeId) as {academyId?:string}|undefined)?.academyId:undefined;const identity=this.foundation.authorizeOperational(ctx,"identity.invite","accessInvitation",id,organizationId,academyId,invitation.scopeType==="location"?[invitation.scopeId]:[]);const updated={...invitation,state:"revoked" as const};this.foundation.store.put("accessInvitations",updated,true);this.foundation.auditOperational(identity,"identity.invite","accessInvitation",id,"permitted");return updated;}
  private scopeExists(org:string,type:ScopeType,id:string){return type==="organization"?id===org:!!this.foundation.store.get(type==="academy"?"academies":"locations",org,id);}
}
