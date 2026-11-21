const test=require("node:test"),assert=require("node:assert/strict");
const{Auth0AuthorizationFlow,InMemoryAuthorizationTransactionStore}=require("../lib");
const options=overrides=>({authorizationUrl:"https://tenant.auth0.com/authorize",tokenUrl:"https://tenant.auth0.com/oauth/token",audience:"https://api.dev.sandmancommercial.com",webClientId:"web",nativeClientId:"native",webClientSecret:"[test-only]",transactions:new InMemoryAuthorizationTransactionStore(),fetch:async()=>({ok:true,json:async()=>({access_token:"signed-token",token_type:"Bearer",expires_in:300})}),now:()=>new Date("2026-11-20T20:00:00Z"),...overrides});

test("web authorization binds Auth0 organization, callback, nonce, state, and PKCE",async()=>{
  const flow=new Auth0AuthorizationFlow(options()),started=await flow.begin({kind:"web",redirectUri:"https://commercial-dev.example.test/auth/callback",providerOrganizationId:"org_abc"}),url=new URL(started.authorizationUrl);
  assert.equal(url.searchParams.get("organization"),"org_abc");assert.equal(url.searchParams.get("audience"),"https://api.dev.sandmancommercial.com");assert.equal(url.searchParams.get("code_challenge_method"),"S256");assert.ok(url.searchParams.get("nonce"));
  const token=await flow.exchange({kind:"web",code:"one-time-code",state:started.state,redirectUri:"https://commercial-dev.example.test/auth/callback"});assert.equal(token.accessToken,"signed-token");
  await assert.rejects(()=>flow.exchange({kind:"web",code:"replay",state:started.state,redirectUri:"https://commercial-dev.example.test/auth/callback"}),/CALLBACK_REJECTED/);
});

test("native PKCE never sends a client secret and rejects callback confusion",async()=>{
  let posted="";const flow=new Auth0AuthorizationFlow(options({webClientSecret:undefined,fetch:async(_url,init)=>{posted=init.body;return{ok:true,json:async()=>({access_token:"native-token",token_type:"Bearer",expires_in:60})};}}));
  const started=await flow.begin({kind:"native",redirectUri:"https://mobile.dev.example.test/ios/callback",providerOrganizationId:"org_native"});
  await assert.rejects(()=>flow.exchange({kind:"web",code:"wrong",state:started.state,redirectUri:"https://mobile.dev.example.test/ios/callback"}),/CALLBACK_REJECTED/);
  const next=await flow.begin({kind:"native",redirectUri:"https://mobile.dev.example.test/ios/callback",providerOrganizationId:"org_native"});await flow.exchange({kind:"native",code:"code",state:next.state,redirectUri:"https://mobile.dev.example.test/ios/callback"});assert.equal(posted.includes("client_secret"),false);assert.equal(posted.includes("code_verifier"),true);
});

test("authorization refuses invented insecure callbacks and unmapped organization formats",async()=>{
  const flow=new Auth0AuthorizationFlow(options());await assert.rejects(()=>flow.begin({kind:"web",redirectUri:"http://localhost/callback",providerOrganizationId:"org_abc"}),/HTTPS_REQUIRED/);await assert.rejects(()=>flow.begin({kind:"web",redirectUri:"https://app.test/callback",providerOrganizationId:"tenant-a"}),/ORGANIZATION_REQUIRED/);
});
