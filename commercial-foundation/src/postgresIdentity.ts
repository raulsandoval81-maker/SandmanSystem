import {AuthorizationContext,Membership,OrganizationRole,ScopeType} from "./contracts";
import {CommercialInvitationService} from "./identity";
import {AsyncIdentityAuthority,OidcVerifiedSession} from "./oidc";
import {PostgresCommercialApplication} from "./postgresApplication";

export interface OrganizationTokenIssuer {issueOrganizationToken(session:OidcVerifiedSession,organizationId:string):Promise<string>}
export interface TokenRevoker {revoke(input:{organizationId:string;tokenId:string;subject:string;expiresAt:number}):Promise<void>}

/** Production identity workflows bound to the PostgreSQL membership authority. */
export class PostgresCommercialIdentityService {
  constructor(private readonly app:PostgresCommercialApplication,private readonly identity:AsyncIdentityAuthority,private readonly issuer:OrganizationTokenIssuer,private readonly revoker:TokenRevoker,private readonly now=()=>new Date()){}

  async runAuthorized<T>(ctx:AuthorizationContext,organizationId:string,work:Parameters<PostgresCommercialApplication["run"]>[1]):Promise<T>{
    const session=await this.identity.verify(ctx);if(session.identity.selectedOrganizationId!==organizationId)throw new Error("TENANT_BOUNDARY_DENIED");
    if(!session.identity.systemAdmin){const memberships=await this.app.activeMemberships(organizationId,session.identity.userId);if(!memberships.length)throw new Error("MEMBERSHIP_REQUIRED");}
    return this.app.runWithIdentity(organizationId,ctx,session.identity,work) as Promise<T>;
  }

  async switchOrganization(ctx:AuthorizationContext,organizationId:string):Promise<AuthorizationContext>{
    const current=await this.identity.verify(ctx);let memberships:Membership[]=[];
    try{memberships=await this.app.activeMemberships(organizationId,current.identity.userId);}catch{throw new Error("ORGANIZATION_SWITCH_DENIED");}
    if(!current.identity.systemAdmin&&!memberships.length)throw new Error("ORGANIZATION_SWITCH_DENIED");
    try{const sessionId=await this.issuer.issueOrganizationToken(current,organizationId),verified=await this.identity.verify({sessionId});if(verified.identity.userId!==current.identity.userId||verified.identity.selectedOrganizationId!==organizationId||verified.identity.systemAdmin!==current.identity.systemAdmin)throw new Error();return Object.freeze({sessionId});}catch{throw new Error("ORGANIZATION_SWITCH_DENIED");}
  }

  async issueInvitation(ctx:AuthorizationContext,input:{id:string;organizationId:string;email:string;role:OrganizationRole;scopeType:ScopeType;scopeId:string;expiresAt:string}){
    return this.runAuthorized<{invitation:unknown;token:string}>(ctx,input.organizationId,foundation=>new CommercialInvitationService(foundation,{verify:()=>{throw new Error("ACCOUNT_PROOF_NOT_USED_FOR_ISSUE");}},this.now).issue(ctx,input));
  }

  async acceptInvitation(ctx:AuthorizationContext,input:{organizationId:string;invitationId:string;token:string}){
    const session=await this.identity.verify(ctx),proof={verify:()=>session.account};
    // Acceptance is the one operation allowed before target membership exists.
    // Account ownership comes from the verified provider token, never the link.
    const targetIdentity={...session.identity,selectedOrganizationId:input.organizationId};
    try{return await this.app.runWithIdentity(input.organizationId,ctx,targetIdentity,foundation=>new CommercialInvitationService(foundation,proof,this.now).accept(ctx,input),false);}
    catch(error){try{await this.app.runWithIdentity(input.organizationId,ctx,targetIdentity,foundation=>foundation.store.audit(targetIdentity,"identity.accept","accessInvitation",input.invitationId,"rejected",error instanceof Error?error.message:"UNKNOWN"),false);}catch{}throw error;}
  }

  async revokeInvitation(ctx:AuthorizationContext,organizationId:string,invitationId:string){
    return this.runAuthorized(ctx,organizationId,foundation=>new CommercialInvitationService(foundation,{verify:()=>{throw new Error("ACCOUNT_PROOF_NOT_USED_FOR_REVOKE");}},this.now).revoke(ctx,organizationId,invitationId));
  }

  async logout(ctx:AuthorizationContext):Promise<void>{const session=await this.identity.verify(ctx);try{await this.revoker.revoke({organizationId:session.identity.selectedOrganizationId,tokenId:session.tokenId,subject:session.identity.userId,expiresAt:session.expiresAt});}catch{throw new Error("LOGOUT_REVOCATION_FAILED");}}
}
