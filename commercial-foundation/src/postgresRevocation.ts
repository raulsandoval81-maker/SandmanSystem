import {createHash} from "node:crypto";
import {PooledPostgresCommercialBoundary,SqlConnectionPool} from "./postgres";

const digest=(value:string)=>createHash("sha256").update(value,"utf8").digest("hex");
const valid=(value:string)=>typeof value==="string"&&value.length>0;

/** Tenant-bound durable revocation store. Database failures deliberately propagate. */
export class PostgresTokenRevocationStore {
  constructor(private readonly boundary:PooledPostgresCommercialBoundary){}

  async isRevoked(organizationId:string,tokenId:string):Promise<boolean>{
    if(!valid(tokenId))throw new Error("INVALID_TOKEN_ID");
    return this.boundary.tenantTransaction(organizationId,async client=>{
      const result=await client.query("SELECT 1 FROM commercial_revoked_access_tokens WHERE organization_id=$1 AND token_digest=$2 AND expires_at>now()",[organizationId,digest(tokenId)]);
      return result.rows.length>0;
    });
  }

  async revoke(input:{organizationId:string;tokenId:string;subject:string;expiresAt:number;reason?:"logout"|"account_recovery"|"administrative"}):Promise<void>{
    if(!valid(input.tokenId)||!valid(input.subject)||!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=0)throw new Error("INVALID_REVOCATION");
    await this.boundary.tenantTransaction(input.organizationId,async client=>{
      await client.query("INSERT INTO commercial_revoked_access_tokens(organization_id,token_digest,provider_subject,expires_at,reason) VALUES($1,$2,$3,to_timestamp($4),$5) ON CONFLICT (organization_id,token_digest) DO NOTHING",[input.organizationId,digest(input.tokenId),input.subject,input.expiresAt,input.reason??"logout"]);
    });
  }
}

/** Resolves an Auth0 organization through the narrow security-definer function. */
export class PostgresAuth0OrganizationResolver {
  constructor(private readonly pool:SqlConnectionPool){}
  async resolve(providerOrganizationId:string):Promise<string>{
    if(!/^org_[A-Za-z0-9]+$/.test(providerOrganizationId))throw new Error("AUTH0_ORGANIZATION_NOT_MAPPED");
    const client=await this.pool.connect();
    try{
      await client.query("BEGIN");
      try{
        await client.query("SET LOCAL ROLE commercial_runtime");
        const result=await client.query<{organization_id:string}>("SELECT commercial_resolve_auth0_organization($1) AS organization_id",[providerOrganizationId]);
        const organizationId=result.rows[0]?.organization_id;
        if(!organizationId)throw new Error("AUTH0_ORGANIZATION_NOT_MAPPED");
        await client.query("COMMIT");return organizationId;
      }catch(error){await client.query("ROLLBACK");throw error;}
    }finally{client.release();}
  }
}
