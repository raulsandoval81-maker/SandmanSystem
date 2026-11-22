import {createServer,IncomingMessage,ServerResponse} from "node:http";
import {randomBytes} from "node:crypto";
import {Auth0AuthorizationFlow} from "./auth0Flows";
import {createOidcIntegrationFromEnvironment} from "./oidc";
import {createPrivateCommercialPool} from "./postgresApplication";
import {PooledPostgresCommercialBoundary} from "./postgres";
import {PostgresAuth0OrganizationResolver,PostgresTokenRevocationStore} from "./postgresRevocation";
import {PostgresAuthorizationTransactionStore,PostgresWebSessionStore} from "./postgresWebAuth";
import {PostgresCommercialApplication} from "./postgresApplication";
import {CoachDashboard} from "./coachDashboard";
import {renderCoachDashboard} from "./coachDashboardView";
import {commercialStyles} from "./commercialStyles";

type OrganizationOption={id:string;name:string};
const cookieName="__Host-commercial_session";
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]!));
const page=(title:string,body:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Sandman Commercial DEV</title><style>${commercialStyles}</style></head><body><div class="shell"><header class="site-header"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">S</span><span><span class="brand-name">SANDMAN</span><span class="brand-sub">Commercial · Coach OS</span></span></a><div class="site-actions"><span class="env-pill">DEVELOPMENT</span><a class="subtle-link" href="/dashboard">Account</a></div></header><main id="main">${body}</main><footer class="footer">SANDMAN SYSTEMS · COMMERCIAL DEVELOPMENT · Pilot data only</footer></div></body></html>`;
const send=(res:ServerResponse,status:number,body:string,headers:Record<string,string>={})=>{res.writeHead(status,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",...headers});res.end(body);};
const redirect=(res:ServerResponse,location:string,headers:Record<string,string>={})=>{res.writeHead(302,{location,"cache-control":"no-store",...headers});res.end();};
const parseCookie=(request:IncomingMessage)=>Object.fromEntries((request.headers.cookie??"").split(";").map(value=>value.trim().split("=")).filter(pair=>pair.length===2).map(([key,value])=>[key,decodeURIComponent(value)]));
const clearCookie=`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const required=(env:NodeJS.ProcessEnv,name:string)=>{const value=env[name];if(!value)throw new Error(`${name}_REQUIRED`);return value;};

export function readWebConfiguration(env:NodeJS.ProcessEnv){
  const baseUrl=new URL(required(env,"COMMERCIAL_WEB_BASE_URL"));if(baseUrl.protocol!=="https:"||baseUrl.pathname!=="/"||baseUrl.search||baseUrl.hash)throw new Error("COMMERCIAL_WEB_BASE_URL_INVALID");
  let organizations:OrganizationOption[];try{organizations=JSON.parse(required(env,"COMMERCIAL_AUTH0_ORGANIZATIONS"));}catch{throw new Error("COMMERCIAL_AUTH0_ORGANIZATIONS_INVALID");}
  if(!Array.isArray(organizations)||!organizations.length||organizations.some(value=>!/^org_[A-Za-z0-9]+$/.test(value?.id)||typeof value?.name!=="string"||!value.name.trim()))throw new Error("COMMERCIAL_AUTH0_ORGANIZATIONS_INVALID");
  return Object.freeze({baseUrl:baseUrl.toString(),callbackUrl:new URL("/auth/callback",baseUrl).toString(),organizations:Object.freeze(organizations.map(value=>Object.freeze({...value})))});
}

type WebServerFetch=(input:string,init?:{method?:string;headers?:Record<string,string>;body?:string;signal?:AbortSignal})=>Promise<{ok:boolean;status:number;json():Promise<unknown>;headers:{get(name:string):string|null}}>;
export interface CommercialWebServerOptions {fetch?:WebServerFetch;listenPort?:number}

export async function startCommercialWebServer(env:NodeJS.ProcessEnv=process.env,options:CommercialWebServerOptions={}){
  if(env.NODE_ENV!=="production")throw new Error("COMMERCIAL_WEB_PRODUCTION_MODE_REQUIRED");
  const config=readWebConfiguration(env),pool=createPrivateCommercialPool(required(env,"DATABASE_URL"),{max:10,connectionTimeoutMillis:10_000}),boundary=new PooledPostgresCommercialBoundary(pool),revocations=new PostgresTokenRevocationStore(boundary),resolver=new PostgresAuth0OrganizationResolver(pool);
  const transactions=new PostgresAuthorizationTransactionStore(pool,required(env,"COMMERCIAL_SESSION_ENCRYPTION_KEY")),sessions=new PostgresWebSessionStore(pool,required(env,"COMMERCIAL_SESSION_ENCRYPTION_KEY"));
  const oidc=createOidcIntegrationFromEnvironment(env,(organizationId,jti)=>revocations.isRevoked(organizationId,jti),options.fetch,id=>resolver.resolve(id));
  const flow=new Auth0AuthorizationFlow({authorizationUrl:oidc.authorizationUrl,tokenUrl:required(env,"COMMERCIAL_OIDC_TOKEN_URL"),audience:required(env,"COMMERCIAL_OIDC_AUDIENCE"),webClientId:required(env,"COMMERCIAL_AUTH0_WEB_CLIENT_ID"),nativeClientId:required(env,"COMMERCIAL_AUTH0_NATIVE_CLIENT_ID"),webClientSecret:required(env,"COMMERCIAL_AUTH0_WEB_CLIENT_SECRET"),transactions,fetch:options.fetch});
  const app=new PostgresCommercialApplication(pool,{verify:()=>{throw new Error("SYNC_IDENTITY_NOT_AVAILABLE");}}),logoutUrl=required(env,"COMMERCIAL_OIDC_LOGOUT_URL"),webClientId=required(env,"COMMERCIAL_AUTH0_WEB_CLIENT_ID");
  const server=createServer(async(req,res)=>{try{
    const url=new URL(req.url??"/",config.baseUrl);
    if(req.method==="GET"&&url.pathname==="/health"){const client=await pool.connect();try{await client.query("SELECT 1");send(res,200,"ok",{"content-type":"text/plain; charset=utf-8"});}finally{client.release();}return;}
    if(req.method==="GET"&&url.pathname==="/"){const items=config.organizations.map(org=>`<li><strong>${escape(org.name)}</strong> <a href="/auth/login?organization=${encodeURIComponent(org.id)}">Sign in</a></li>`).join("");send(res,200,page("Sign in",`<div class="card"><h2>Choose an organization</h2><ul>${items}</ul></div>`));return;}
    if(req.method==="GET"&&url.pathname==="/auth/login"){const providerOrg=url.searchParams.get("organization")??"";if(!config.organizations.some(org=>org.id===providerOrg))throw new Error("ORGANIZATION_NOT_ALLOWED");await resolver.resolve(providerOrg);const started=await flow.begin({kind:"web",redirectUri:config.callbackUrl,providerOrganizationId:providerOrg});redirect(res,started.authorizationUrl);return;}
    if(req.method==="GET"&&url.pathname==="/auth/callback"){const error=url.searchParams.get("error");if(error){send(res,401,page("Authentication failed","<div class=\"card\"><h2>Authentication failed</h2><p>Return to sign in and try again.</p><a href=\"/\">Sign in</a></div>"));return;}const exchanged=await flow.exchange({kind:"web",code:url.searchParams.get("code")??"",state:url.searchParams.get("state")??"",redirectUri:config.callbackUrl}),verified=await oidc.authority.verify({sessionId:exchanged.accessToken}),memberships=await app.activeMemberships(verified.identity.selectedOrganizationId,verified.identity.userId);if(!memberships.length)throw new Error("MEMBERSHIP_REQUIRED");const expiresAt=Math.min(verified.expiresAt*1000,Date.now()+8*60*60_000),cookie=await sessions.create({accessToken:exchanged.accessToken,csrfToken:randomBytes(24).toString("base64url"),expiresAt});redirect(res,"/dashboard",{"set-cookie":`${cookieName}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(1,Math.floor((expiresAt-Date.now())/1000))}`});return;}
    const cookie=parseCookie(req)[cookieName],session=cookie?await sessions.get(cookie):undefined;
    if(!session||session.expiresAt<=Date.now()){if(cookie)await sessions.delete(cookie);redirect(res,"/",{"set-cookie":clearCookie});return;}
    const verified=await oidc.authority.verify({sessionId:session.accessToken}),memberships=await app.activeMemberships(verified.identity.selectedOrganizationId,verified.identity.userId);if(!memberships.length)throw new Error("MEMBERSHIP_REQUIRED");
    if(url.pathname==="/coach"&&(req.method==="GET"||req.method==="POST")){
      const ctx={sessionId:session.accessToken};
      const dashboard=(foundation:import("./foundation").CommercialFoundation)=>new CoachDashboard(foundation,ctx,verified.identity);
      if(req.method==="GET"){
        const view=await app.readWithIdentity(ctx,verified.identity,foundation=>dashboard(foundation).snapshot());
        send(res,200,page("Coach Dashboard",renderCoachDashboard(view,session.csrfToken,url.searchParams.get("athlete"))));
        return;
      }
      let body="";
      for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>8192)throw new Error("REQUEST_TOO_LARGE");}
      const fields=new URLSearchParams(body);
      if(fields.get("csrf")!==session.csrfToken)throw new Error("CSRF_REJECTED");
      await app.runWithIdentity(verified.identity.selectedOrganizationId,ctx,verified.identity,foundation=>dashboard(foundation).submit(fields));
      redirect(res,"/coach");
      return;
    }
    if(req.method==="GET"&&url.pathname==="/dashboard"){const coachLink=memberships.some(m=>["organization_admin","management","coach"].includes(m.role))?'<p><a href="/coach">Coach Dashboard</a></p>':"";const roles=memberships.map(m=>`<li>${escape(m.role)} — ${escape(m.scopeType)}: ${escape(m.scopeId)}</li>`).join("");send(res,200,page("Dashboard",`<div class="card"><h2>Development dashboard</h2><p>Signed in as <strong>${escape(verified.account.verifiedEmail)}</strong></p><p>Organization: <strong>${escape(verified.identity.selectedOrganizationId)}</strong></p><ul>${roles}</ul>${coachLink}<p><a href="/">Switch organization</a></p><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${escape(session.csrfToken)}"><button type="submit">Log out</button></form></div>`));return;}
    if(req.method==="POST"&&url.pathname==="/auth/logout"){let body="";for await(const chunk of req){body+=chunk;if(body.length>4096)throw new Error("REQUEST_TOO_LARGE");}if(new URLSearchParams(body).get("csrf")!==session.csrfToken)throw new Error("CSRF_REJECTED");await revocations.revoke({organizationId:verified.identity.selectedOrganizationId,tokenId:verified.tokenId,subject:verified.identity.userId,expiresAt:verified.expiresAt});await sessions.delete(cookie);const location=new URL(logoutUrl);location.searchParams.set("client_id",webClientId);location.searchParams.set("returnTo",config.baseUrl);redirect(res,location.toString(),{"set-cookie":clearCookie});return;}
    send(res,404,page("Not found","<div class=\"card\"><h2>Not found</h2><a href=\"/\">Home</a></div>"));
  }catch(error){console.error("commercial_web_request_failed",error instanceof Error?error.message:"UNKNOWN");send(res,401,page("Access denied","<div class=\"card\"><h2>Access denied</h2><p>Your session or organization membership could not be verified.</p><a href=\"/\">Return to sign in</a></div>"),{"set-cookie":clearCookie});}});
  const port=options.listenPort??Number(env.PORT??"3000");if(!Number.isInteger(port)||port<0||port>65535||(options.listenPort===undefined&&port===0))throw new Error("PORT_INVALID");await new Promise<void>((resolve,reject)=>{server.once("error",reject);const listening=()=>{server.off("error",reject);resolve();};if(options.listenPort===undefined)server.listen(port,listening);else server.listen(port,"127.0.0.1",listening);});const stop=async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await pool.close();};process.once("SIGTERM",()=>void stop());return{server,stop};
}

if(require.main===module)startCommercialWebServer().catch(error=>{console.error(error instanceof Error?error.message:"COMMERCIAL_WEB_START_FAILED");process.exitCode=1;});
