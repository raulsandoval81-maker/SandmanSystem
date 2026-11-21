const test=require("node:test"),assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const{PostgresTokenRevocationStore,PostgresAuth0OrganizationResolver}=require("../lib");

test("persistent revocation hashes token IDs, is tenant bound, and is replay safe",async()=>{
  const queries=[];let revoked=false;
  const boundary={tenantTransaction:async(org,work)=>work({query:async(sql,values=[])=>{queries.push({org,sql,values});if(sql.startsWith("INSERT")){revoked=true;return{rows:[],rowCount:1};}return{rows:revoked?[{one:1}]:[],rowCount:revoked?1:0};}})};
  const store=new PostgresTokenRevocationStore(boundary);
  assert.equal(await store.isRevoked("tenant-a","secret-jti"),false);
  await store.revoke({organizationId:"tenant-a",tokenId:"secret-jti",subject:"auth0|user",expiresAt:2_000_000_000});
  await store.revoke({organizationId:"tenant-a",tokenId:"secret-jti",subject:"auth0|user",expiresAt:2_000_000_000});
  assert.equal(await store.isRevoked("tenant-a","secret-jti"),true);
  const insert=queries.find(x=>x.sql.startsWith("INSERT"));
  assert.equal(insert.values[1],createHash("sha256").update("secret-jti").digest("hex"));
  assert.equal(insert.sql.includes("ON CONFLICT"),true);
  assert.equal(queries.some(x=>x.values.includes("secret-jti")),false);
});

test("Auth0 organization resolution is explicit and fails closed",async()=>{
  const events=[];
  const client={query:async(sql)=>{events.push(sql);return sql.startsWith("SELECT commercial")?{rows:[{organization_id:"tenant-a"}],rowCount:1}:{rows:[],rowCount:null};},release:()=>events.push("RELEASE")};
  const resolver=new PostgresAuth0OrganizationResolver({connect:async()=>client});
  assert.equal(await resolver.resolve("org_abc123"),"tenant-a");
  assert.deepEqual(events,["BEGIN","SET LOCAL ROLE commercial_runtime","SELECT commercial_resolve_auth0_organization($1) AS organization_id","COMMIT","RELEASE"]);
  await assert.rejects(()=>resolver.resolve("tenant-a"),/NOT_MAPPED/);
});
