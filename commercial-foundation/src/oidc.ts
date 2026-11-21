import {createPublicKey,verify as verifySignature} from "node:crypto";
import {AuthorizationContext,VerifiedAccountProof,VerifiedIdentity} from "./contracts";

type Jwk={kid?:unknown;kty?:unknown;alg?:unknown;use?:unknown;n?:unknown;e?:unknown};
type Claims={iss?:unknown;aud?:unknown;sub?:unknown;org?:unknown;org_id?:unknown;exp?:unknown;nbf?:unknown;iat?:unknown;jti?:unknown;email?:unknown;email_verified?:unknown;systemAdmin?:unknown;[claim:string]:unknown};
type FetchLike=(input:string,init?:{headers?:Record<string,string>;signal?:AbortSignal})=>Promise<{ok:boolean;status:number;json():Promise<unknown>;headers:{get(name:string):string|null}}>;
const decode=(value:string)=>JSON.parse(Buffer.from(value,"base64url").toString("utf8"));
const authError=()=>new Error("UNVERIFIED_IDENTITY");

export interface OidcVerifiedSession {identity:VerifiedIdentity;account:VerifiedAccountProof;tokenId:string;expiresAt:number}
export interface AsyncIdentityAuthority {verify(ctx:AuthorizationContext):Promise<OidcVerifiedSession>}

/** Remote OIDC JWKS cache with bounded staleness and unknown-kid refresh. */
export class OidcJwksKeyStore {
  private keys=new Map<string,string>();private refreshAfter=0;private expiresAt=0;private refreshPromise?:Promise<void>;
  constructor(private readonly options:{jwksUrl:string;fetch?:FetchLike;now?:()=>Date;refreshSeconds?:number;maxStaleSeconds?:number;timeoutMs?:number}){
    const url=new URL(options.jwksUrl);if(url.protocol!=="https:")throw new Error("OIDC_JWKS_HTTPS_REQUIRED");
  }
  async key(kid:string):Promise<string>{
    const now=(this.options.now?.()??new Date()).getTime();
    if(!this.keys.has(kid)||now>=this.refreshAfter)await this.refresh();
    const key=this.keys.get(kid),after=(this.options.now?.()??new Date()).getTime();
    if(!key||after>=this.expiresAt)throw authError();return key;
  }
  async refresh():Promise<void>{
    if(this.refreshPromise)return this.refreshPromise;
    this.refreshPromise=this.load().finally(()=>{this.refreshPromise=undefined;});return this.refreshPromise;
  }
  private async load(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.options.timeoutMs??5000);
    try{
      const response=await (this.options.fetch??globalThis.fetch)(this.options.jwksUrl,{headers:{accept:"application/json"},signal:controller.signal});
      if(!response.ok)throw authError();const body=await response.json() as {keys?:unknown};if(!Array.isArray(body?.keys))throw authError();
      const next=new Map<string,string>();for(const candidate of body.keys as Jwk[]){if(candidate?.kty!=="RSA"||candidate.alg!=="RS256"||candidate.use!=="sig"||typeof candidate.kid!=="string"||!candidate.kid||typeof candidate.n!=="string"||typeof candidate.e!=="string")continue;try{next.set(candidate.kid,createPublicKey({key:candidate as any,format:"jwk"}).export({type:"spki",format:"pem"}).toString());}catch{}}
      if(!next.size)throw authError();const now=(this.options.now?.()??new Date()).getTime(),cache=response.headers.get("cache-control")?.match(/max-age=(\d+)/i),refresh=Math.max(30,Math.min(Number(cache?.[1]??this.options.refreshSeconds??300),3600));this.keys=next;this.refreshAfter=now+refresh*1000;this.expiresAt=now+(this.options.maxStaleSeconds??3600)*1000;
    }catch{throw authError();}finally{clearTimeout(timer);}
  }
}

/** Standards-based production OIDC verifier. Provider outages and revocation failures fail closed. */
export class OidcIdentityAuthority implements AsyncIdentityAuthority {
  constructor(private readonly options:{issuer:string;audience:string;keys:OidcJwksKeyStore;isRevoked:(jti:string)=>Promise<boolean>;provider?:"generic"|"auth0";now?:()=>Date;clockSkewSeconds?:number}){
    if(new URL(options.issuer).protocol!=="https:")throw new Error("OIDC_ISSUER_HTTPS_REQUIRED");
  }
  async verify(ctx:AuthorizationContext):Promise<OidcVerifiedSession>{
    const token=ctx?.sessionId,parts=typeof token==="string"?token.split("."):[];if(parts.length!==3)throw authError();let header:any,claims:Claims;try{header=decode(parts[0]);claims=decode(parts[1]);}catch{throw authError();}
    if(header?.alg!=="RS256"||header.typ!==(this.options.provider==="auth0"?"at+jwt":"JWT")||typeof header.kid!=="string"||!header.kid||!/^[A-Za-z0-9_-]+$/.test(parts[2]))throw authError();
    try{const key=await this.options.keys.key(header.kid);if(!verifySignature("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url")))throw authError();}catch{throw authError();}
    const now=Math.floor((this.options.now?.()??new Date()).getTime()/1000),skew=this.options.clockSkewSeconds??30;
    // Auth0 API access tokens carry org_id. Email proof must come from a trusted
    // namespaced Post-Login Action claim, never an unverified token fallback.
    const auth0=this.options.provider==="auth0";
    const organizationId=auth0?claims.org_id:claims.org;
    const address=auth0?claims["https://sandmancommercial.com/email"]:claims.email;
    const verifiedEmail=auth0?claims["https://sandmancommercial.com/email_verified"]:claims.email_verified;
    const audienceValid=claims.aud===this.options.audience||(Array.isArray(claims.aud)&&claims.aud.every(value=>typeof value==="string")&&claims.aud.includes(this.options.audience));
    if(claims.iss!==this.options.issuer||!audienceValid||typeof claims.sub!=="string"||!claims.sub||typeof organizationId!=="string"||!organizationId||typeof claims.exp!=="number"||!Number.isSafeInteger(claims.exp)||claims.exp<=now-skew||(claims.nbf!==undefined&&(typeof claims.nbf!=="number"||claims.nbf>now+skew))||typeof claims.iat!=="number"||claims.iat>now+skew||typeof claims.jti!=="string"||!claims.jti||verifiedEmail!==true||typeof address!=="string"||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw authError();
    try{if(await this.options.isRevoked(claims.jti))throw authError();}catch{throw authError();}
    return Object.freeze({identity:Object.freeze({userId:claims.sub,selectedOrganizationId:organizationId,systemAdmin:claims.systemAdmin===true}),account:Object.freeze({userId:claims.sub,verifiedEmail:address.trim().toLowerCase()}),tokenId:claims.jti,expiresAt:claims.exp});
  }
}

export function createOidcIntegrationFromEnvironment(env:NodeJS.ProcessEnv,isRevoked:(jti:string)=>Promise<boolean>,fetch?:FetchLike){
  const provider=env.COMMERCIAL_OIDC_PROVIDER??"generic";
  if(provider!=="generic"&&provider!=="auth0")throw new Error("COMMERCIAL_OIDC_PROVIDER_UNSUPPORTED");
  const issuer=env.COMMERCIAL_OIDC_ISSUER,audience=env.COMMERCIAL_OIDC_AUDIENCE,jwksUrl=env.COMMERCIAL_OIDC_JWKS_URL,authorizationUrl=env.COMMERCIAL_OIDC_AUTHORIZATION_URL,logoutUrl=env.COMMERCIAL_OIDC_LOGOUT_URL;
  if(!issuer||!audience||!jwksUrl||!authorizationUrl||!logoutUrl)throw new Error("COMMERCIAL_OIDC_CONFIGURATION_REQUIRED");
  for(const endpoint of[issuer,jwksUrl,authorizationUrl,logoutUrl])if(new URL(endpoint).protocol!=="https:")throw new Error("COMMERCIAL_OIDC_HTTPS_REQUIRED");
  const keys=new OidcJwksKeyStore({jwksUrl,fetch});return Object.freeze({authority:new OidcIdentityAuthority({issuer,audience,keys,isRevoked,provider}),authorizationUrl,logoutUrl});
}
