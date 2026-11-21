import {createHash,randomBytes,timingSafeEqual} from "node:crypto";

type FetchLike=(input:string,init:{method:string;headers:Record<string,string>;body:string;signal:AbortSignal})=>Promise<{ok:boolean;json():Promise<unknown>}>;
export type Auth0FlowKind="web"|"native";
export interface AuthorizationTransaction {kind:Auth0FlowKind;stateDigest:string;nonce:string;codeVerifier:string;providerOrganizationId:string;redirectUri:string;expiresAt:number}
export interface AuthorizationTransactionStore {save(transaction:AuthorizationTransaction):Promise<void>;consume(stateDigest:string):Promise<AuthorizationTransaction|undefined>}
const b64=(size=32)=>randomBytes(size).toString("base64url");
const sha=(value:string)=>createHash("sha256").update(value,"utf8").digest("base64url");
const https=(value:string)=>{const url=new URL(value);if(url.protocol!=="https:")throw new Error("AUTH0_HTTPS_REQUIRED");return url;};

/** Auth0 Authorization Code + PKCE flow shared by web and native development clients. */
export class Auth0AuthorizationFlow {
  constructor(private readonly options:{authorizationUrl:string;tokenUrl:string;audience:string;webClientId:string;nativeClientId:string;webClientSecret?:string;transactions:AuthorizationTransactionStore;fetch?:FetchLike;now?:()=>Date}){
    https(options.authorizationUrl);https(options.tokenUrl);
  }
  async begin(input:{kind:Auth0FlowKind;redirectUri:string;providerOrganizationId:string;returnTo?:string}){
    https(input.redirectUri);if(!/^org_[A-Za-z0-9]+$/.test(input.providerOrganizationId))throw new Error("AUTH0_ORGANIZATION_REQUIRED");
    const state=b64(),nonce=b64(),codeVerifier=b64(48),expiresAt=(this.options.now?.()??new Date()).getTime()+10*60_000;
    await this.options.transactions.save({kind:input.kind,stateDigest:sha(state),nonce,codeVerifier,providerOrganizationId:input.providerOrganizationId,redirectUri:input.redirectUri,expiresAt});
    const url=new URL(this.options.authorizationUrl);url.search=new URLSearchParams({response_type:"code",client_id:input.kind==="web"?this.options.webClientId:this.options.nativeClientId,redirect_uri:input.redirectUri,scope:"openid profile email",audience:this.options.audience,organization:input.providerOrganizationId,state,nonce,code_challenge:sha(codeVerifier),code_challenge_method:"S256"}).toString();
    return Object.freeze({authorizationUrl:url.toString(),state});
  }
  async exchange(input:{kind:Auth0FlowKind;code:string;state:string;redirectUri:string}){
    if(!input.code||!input.state)throw new Error("AUTH0_CALLBACK_REJECTED");
    const transaction=await this.options.transactions.consume(sha(input.state));
    const now=(this.options.now?.()??new Date()).getTime();
    if(!transaction||transaction.kind!==input.kind||transaction.redirectUri!==input.redirectUri||transaction.expiresAt<=now)throw new Error("AUTH0_CALLBACK_REJECTED");
    const body=new URLSearchParams({grant_type:"authorization_code",client_id:input.kind==="web"?this.options.webClientId:this.options.nativeClientId,code:input.code,redirect_uri:input.redirectUri,code_verifier:transaction.codeVerifier});
    if(input.kind==="web"){if(!this.options.webClientSecret)throw new Error("AUTH0_WEB_SECRET_REQUIRED");body.set("client_secret",this.options.webClientSecret);}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{const response=await (this.options.fetch??globalThis.fetch)(this.options.tokenUrl,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},body:body.toString(),signal:controller.signal});const value=await response.json() as {access_token?:unknown;token_type?:unknown;expires_in?:unknown};if(!response.ok||typeof value.access_token!=="string"||value.token_type!=="Bearer"||typeof value.expires_in!=="number")throw new Error();return Object.freeze({accessToken:value.access_token,expiresIn:value.expires_in,providerOrganizationId:transaction.providerOrganizationId});}catch{throw new Error("AUTH0_TOKEN_EXCHANGE_FAILED");}finally{clearTimeout(timer);}
  }
}

/** Constant-time in-memory transaction store for tests only; production hosts inject persistence. */
export class InMemoryAuthorizationTransactionStore implements AuthorizationTransactionStore {
  private readonly records=new Map<string,AuthorizationTransaction>();
  async save(value:AuthorizationTransaction){if(this.records.has(value.stateDigest))throw new Error("AUTH0_STATE_REPLAY");this.records.set(value.stateDigest,structuredClone(value));}
  async consume(stateDigest:string){let match:string|undefined;for(const key of this.records.keys()){const a=Buffer.from(key),b=Buffer.from(stateDigest);if(a.length===b.length&&timingSafeEqual(a,b)){match=key;break;}}if(!match)return;const value=this.records.get(match);this.records.delete(match);return value&&structuredClone(value);}
}
