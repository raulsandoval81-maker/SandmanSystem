const test=require("node:test"),assert=require("node:assert/strict"),{generateKeyPairSync,sign}=require("node:crypto");
const{createOidcIntegrationFromEnvironment,OidcIdentityAuthority,OidcJwksKeyStore}=require("../lib");
const issuer="https://identity.example.test/",audience="sandman-commercial",now=()=>new Date("2026-11-20T20:00:00Z"),epoch=Math.floor(now().getTime()/1000);
const pair=()=>generateKeyPairSync("rsa",{modulusLength:2048}),one=pair(),two=pair();
const jwk=(pair,kid)=>({...pair.publicKey.export({format:"jwk"}),kid,kty:"RSA",alg:"RS256",use:"sig"});
const token=(pair,kid,claims={})=>{const header=Buffer.from(JSON.stringify({alg:"RS256",typ:"JWT",kid})).toString("base64url"),payload=Buffer.from(JSON.stringify({iss:issuer,aud:audience,sub:"provider-user",org:"org-a",iat:epoch-10,exp:epoch+300,jti:`jti-${kid}`,email:"User@Example.test",email_verified:true,...claims})).toString("base64url"),signature=sign("RSA-SHA256",Buffer.from(`${header}.${payload}`),pair.privateKey).toString("base64url");return`${header}.${payload}.${signature}`;};
const response=keys=>({ok:true,status:200,json:async()=>({keys}),headers:{get:()=>"max-age=60"}});

test("OIDC verifier validates identity, account ownership, rotation, and revocation",async()=>{
  let keys=[jwk(one,"one")],revoked=false,fetches=0;
  const store=new OidcJwksKeyStore({jwksUrl:"https://identity.example.test/.well-known/jwks.json",fetch:async()=>{fetches++;return response(keys);},now,maxStaleSeconds:300}),authority=new OidcIdentityAuthority({issuer,audience,keys:store,isRevoked:async()=>revoked,now});
  const first=await authority.verify({sessionId:token(one,"one")});assert.equal(first.identity.userId,"provider-user");assert.equal(first.account.verifiedEmail,"user@example.test");
  keys=[jwk(two,"two")];assert.equal((await authority.verify({sessionId:token(two,"two")})).tokenId,"jti-two");assert.ok(fetches>=2);
  revoked=true;await assert.rejects(()=>authority.verify({sessionId:token(two,"two")}),/UNVERIFIED_IDENTITY/);
});

test("OIDC verifier fails closed for forged, expired, unverified-email, wrong-audience, and provider failures",async()=>{
  let fail=false;const store=new OidcJwksKeyStore({jwksUrl:"https://identity.example.test/jwks",fetch:async()=>{if(fail)throw new Error("offline");return response([jwk(one,"one")]);},now,refreshSeconds:30}),authority=new OidcIdentityAuthority({issuer,audience,keys:store,isRevoked:async()=>false,now});
  for(const value of[token(two,"one"),token(one,"one",{exp:1}),token(one,"one",{email_verified:false}),token(one,"one",{aud:"other"})])await assert.rejects(()=>authority.verify({sessionId:value}),/UNVERIFIED_IDENTITY/);
  fail=true;await assert.rejects(()=>authority.verify({sessionId:token(two,"unknown")}),/UNVERIFIED_IDENTITY/);
  const revocationOffline=new OidcIdentityAuthority({issuer,audience,keys:store,isRevoked:async()=>{throw new Error("offline")},now});fail=false;await assert.rejects(()=>revocationOffline.verify({sessionId:token(one,"one")}),/UNVERIFIED_IDENTITY/);
});

test("OIDC configuration rejects non-HTTPS issuer and JWKS endpoints",()=>{
  assert.throws(()=>new OidcJwksKeyStore({jwksUrl:"http://identity.test/jwks"}),/HTTPS_REQUIRED/);
  const keys=new OidcJwksKeyStore({jwksUrl:"https://identity.test/jwks"});assert.throws(()=>new OidcIdentityAuthority({issuer:"http://identity.test",audience,keys,isRevoked:async()=>false}),/HTTPS_REQUIRED/);
});

test("production OIDC environment configuration requires explicit HTTPS login and logout endpoints",()=>{
  const valid={COMMERCIAL_OIDC_ISSUER:issuer,COMMERCIAL_OIDC_AUDIENCE:audience,COMMERCIAL_OIDC_JWKS_URL:"https://identity.example.test/jwks",COMMERCIAL_OIDC_AUTHORIZATION_URL:"https://identity.example.test/authorize",COMMERCIAL_OIDC_LOGOUT_URL:"https://identity.example.test/logout"};assert.equal(createOidcIntegrationFromEnvironment(valid,async()=>false,async()=>response([jwk(one,"one")])).authorizationUrl,valid.COMMERCIAL_OIDC_AUTHORIZATION_URL);assert.throws(()=>createOidcIntegrationFromEnvironment({},async()=>false),/CONFIGURATION_REQUIRED/);assert.throws(()=>createOidcIntegrationFromEnvironment({...valid,COMMERCIAL_OIDC_LOGOUT_URL:"http://identity.test/logout"},async()=>false),/HTTPS_REQUIRED/);
});


test("Auth0 RFC9068 access token requires trusted org and verified-email claims",async()=>{
  const store=new OidcJwksKeyStore({jwksUrl:"https://identity.example.test/jwks",fetch:async()=>response([jwk(one,"one")]),now});
  const authority=new OidcIdentityAuthority({issuer,audience,keys:store,isRevoked:async()=>false,resolveOrganization:async id=>id==="org_auth0"?"commercial-org-a":"",provider:"auth0",now});
  const auth0Token=claims=>{
    const header=Buffer.from(JSON.stringify({alg:"RS256",typ:"at+jwt",kid:"one"})).toString("base64url");
    const payload=Buffer.from(JSON.stringify({iss:issuer,aud:audience,sub:"auth0|user",org_id:"org_auth0",iat:epoch-10,exp:epoch+300,jti:"auth0-jti",client_id:"native-client",["https://sandmancommercial.com/email"]:"USER@EXAMPLE.TEST",["https://sandmancommercial.com/email_verified"]:true,...claims})).toString("base64url");
    return `${header}.${payload}.${sign("RSA-SHA256",Buffer.from(`${header}.${payload}`),one.privateKey).toString("base64url")}`;
  };
  const session=await authority.verify({sessionId:auth0Token({})});
  assert.equal(session.identity.selectedOrganizationId,"commercial-org-a");
  assert.equal(session.account.verifiedEmail,"user@example.test");
  for(const claims of [
    {org_id:undefined,org:"org-a"},
    {["https://sandmancommercial.com/email_verified"]:false,email_verified:true},
    {["https://sandmancommercial.com/email"]:undefined,email:"untrusted@example.test"},
    {jti:undefined},
    {aud:"wrong-audience"}
  ])await assert.rejects(()=>authority.verify({sessionId:auth0Token(claims)}),/UNVERIFIED_IDENTITY/);
  await assert.rejects(()=>authority.verify({sessionId:token(one,"one")}),/UNVERIFIED_IDENTITY/);
});

test("Auth0 provider selection requires an explicit supported configuration",()=>{
  const env={COMMERCIAL_OIDC_ISSUER:issuer,COMMERCIAL_OIDC_AUDIENCE:audience,COMMERCIAL_OIDC_JWKS_URL:"https://identity.example.test/jwks",COMMERCIAL_OIDC_AUTHORIZATION_URL:"https://identity.example.test/authorize",COMMERCIAL_OIDC_LOGOUT_URL:"https://identity.example.test/logout"};
  assert.ok(createOidcIntegrationFromEnvironment({...env,COMMERCIAL_OIDC_PROVIDER:"auth0"},async()=>false,undefined,async()=>"commercial-org-a"));
  assert.throws(()=>createOidcIntegrationFromEnvironment({...env,COMMERCIAL_OIDC_PROVIDER:"auth0"},async()=>false),/ORGANIZATION_RESOLVER_REQUIRED/);
  assert.throws(()=>createOidcIntegrationFromEnvironment({...env,COMMERCIAL_OIDC_PROVIDER:"other"},async()=>false),/PROVIDER_UNSUPPORTED/);
});
