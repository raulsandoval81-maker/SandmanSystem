import { Pool, PoolClient, PoolConfig } from "pg";
import { AuditEvent, AuthorizationContext, IdentityAuthority, Membership, Organization, VerifiedIdentity } from "./contracts";
import { CommercialFoundation, InMemoryCommercialStore, StoreKind, TenantRecord } from "./foundation";
import { PooledPostgresCommercialBoundary, SqlClient, SqlConnectionPool, SqlResult } from "./postgres";

const kinds:readonly StoreKind[]=["events","academies","locations","programs","memberships","entitlements","sessions","athletes","attendance","practiceNotes","guardians","guardianLinks","athleteIdentityLinks","curricula","curriculumAssignments","skillEvaluations","progressionCycles","xpEvents","promotions","accessInvitations","recoveryCases","recoveryEvidence","recoveryPenalties","transferAcceptances"];
const immutableKinds=new Set<string>(["xpEvents","promotions","recoveryEvidence","recoveryPenalties","transferAcceptances","audits"]);
type StoredRow={kind:string;id:string;payload:unknown};

class PgLease {
  constructor(private readonly client:PoolClient){}
  async query<Row=Record<string,unknown>>(text:string,values?:readonly unknown[]):Promise<SqlResult<Row>>{
    const result=await this.client.query(text,[...(values??[])]);
    return {rows:result.rows as Row[],rowCount:result.rowCount};
  }
  release(){this.client.release();}
}

export class NodePostgresConnectionPool implements SqlConnectionPool {
  constructor(readonly pool:Pool){}
  async connect(){return new PgLease(await this.pool.connect());}
  async close(){await this.pool.end();}
}

/**
 * Creates a pool only for Railway private networking (or explicit localhost tests).
 * A public Railway TCP proxy is deliberately rejected.
 */
export function createPrivateCommercialPool(databaseUrl:string,options:Omit<PoolConfig,"connectionString">={}):NodePostgresConnectionPool{
  const parsed=new URL(databaseUrl),host=parsed.hostname;
  if(host!=="localhost"&&host!=="127.0.0.1"&&!host.endsWith(".railway.internal"))throw new Error("COMMERCIAL_DATABASE_MUST_USE_PRIVATE_NETWORK");
  return new NodePostgresConnectionPool(new Pool({...options,connectionString:databaseUrl}));
}

/**
 * Database-backed application boundary for the existing synchronous Commercial
 * domain. Every operation loads and commits one tenant aggregate inside a single
 * leased PostgreSQL transaction. PostgreSQL RLS is authoritative; there is no
 * JSON-file or in-memory fallback when this adapter is selected.
 */
export class PostgresCommercialApplication {
  private readonly boundary:PooledPostgresCommercialBoundary;
  constructor(pool:SqlConnectionPool,private readonly authority:IdentityAuthority,private readonly now=()=>new Date()){
    this.boundary=new PooledPostgresCommercialBoundary(pool);
  }
  migrate(id:string,sql:string){return this.boundary.migrate(id,sql);}

  async run<T>(organizationId:string,work:(foundation:CommercialFoundation)=>T):Promise<T>{
    return this.runUsing(organizationId,this.authority,work);
  }
  async runWithIdentity<T>(organizationId:string,ctx:AuthorizationContext,identity:VerifiedIdentity,work:(foundation:CommercialFoundation)=>T,requireSelectedOrganization=true):Promise<T>{
    if(requireSelectedOrganization&&identity.selectedOrganizationId!==organizationId)throw new Error("TENANT_BOUNDARY_DENIED");
    const fixed:IdentityAuthority={verify:request=>{if(request?.sessionId!==ctx.sessionId)throw new Error("UNVERIFIED_IDENTITY");return identity;}};
    return this.runUsing(organizationId,fixed,work);
  }
  async readWithIdentity<T>(ctx:AuthorizationContext, identity:VerifiedIdentity, work:(foundation:CommercialFoundation)=>T):Promise<T>{
    return this.boundary.tenantTransaction(identity.selectedOrganizationId,async client=>{
      const rows=await client.query<StoredRow>("SELECT kind,id,payload FROM commercial_application_records ORDER BY kind,id");
      const authority:IdentityAuthority={verify:request=>{
        if(request?.sessionId!==ctx.sessionId)throw new Error("UNVERIFIED_IDENTITY");
        return identity;
      }};
      return work(new CommercialFoundation(this.hydrate(identity.selectedOrganizationId,rows.rows),authority,this.now));
    });
  }
  async activeMemberships(organizationId:string,userId:string):Promise<Membership[]>{
    if(!userId)throw new Error("INVALID_IDENTITY_SUBJECT");
    return this.boundary.tenantTransaction(organizationId,async client=>{
      const result=await client.query<{payload:Membership}>("SELECT payload FROM commercial_application_records WHERE kind='memberships' AND payload->>'userId'=$1 AND payload->>'state'='active' ORDER BY id",[userId]);
      return result.rows.map(row=>structuredClone(row.payload));
    });
  }
  private async runUsing<T>(organizationId:string,authority:IdentityAuthority,work:(foundation:CommercialFoundation)=>T):Promise<T>{
    return this.boundary.tenantTransaction(organizationId,async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`sandman-commercial:${organizationId}`]);
      const rows=await client.query<StoredRow>("SELECT kind,id,payload FROM commercial_application_records ORDER BY kind,id");
      const store=this.hydrate(organizationId,rows.rows),foundation=new CommercialFoundation(store,authority,this.now);
      const result=work(foundation);
      if(result instanceof Promise)throw new Error("ASYNC_DOMAIN_CALLBACK_FORBIDDEN");
      await this.flush(client,organizationId,store);
      return result;
    });
  }

  private hydrate(organizationId:string,rows:StoredRow[]):InMemoryCommercialStore{
    const store=new InMemoryCommercialStore(),audits:AuditEvent[]=[];
    for(const row of rows){
      if(row.kind==="organization")store.createOrganization(row.payload as Organization);
      else if(row.kind==="audits")audits.push(structuredClone(row.payload) as AuditEvent);
      else if(kinds.includes(row.kind as StoreKind))store.put(row.kind as StoreKind,structuredClone(row.payload) as TenantRecord);
      else throw new Error("UNKNOWN_POSTGRES_RECORD_KIND");
    }
    store.restoreAudits(audits);
    const organization=store.getOrganization(organizationId);
    if(rows.length&&(!organization||organization.id!==organizationId))throw new Error("INVALID_POSTGRES_TENANT_AGGREGATE");
    return store;
  }

  private async flush(client:SqlClient,organizationId:string,store:InMemoryCommercialStore):Promise<void>{
    const records:{kind:string;id:string;payload:unknown}[]=[];
    const organization=store.getOrganization(organizationId);
    if(store.organizations.size>1||[...store.organizations.keys()].some(id=>id!==organizationId))throw new Error("CROSS_TENANT_AGGREGATE_WRITE_DENIED");
    if(organization)await client.query("INSERT INTO commercial_organizations(id,display_name,state) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,state=EXCLUDED.state",[organization.id,organization.displayName,organization.state]);
    if(organization)records.push({kind:"organization",id:organization.id,payload:organization});
    for(const kind of kinds)for(const record of store.list<TenantRecord>(kind,organizationId))records.push({kind,id:record.id,payload:record});
    for(const audit of store.listAudits(organizationId))records.push({kind:"audits",id:audit.id,payload:audit});
    for(const record of records){
      const sql=immutableKinds.has(record.kind)
        ?"INSERT INTO commercial_application_records(organization_id,kind,id,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING"
        :"INSERT INTO commercial_application_records(organization_id,kind,id,payload) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (organization_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()";
      await client.query(sql,[organizationId,record.kind,record.id,JSON.stringify(record.payload)]);
    }
  }
}
