import { createHash } from "node:crypto";

export interface SqlResult<Row=Record<string,unknown>>{rows:Row[];rowCount:number|null}
export interface SqlClient{query<Row=Record<string,unknown>>(text:string,values?:readonly unknown[]):Promise<SqlResult<Row>>}

/**
 * A SQL client represents one physical connection/transaction context.
 * Sharing that client between concurrent tenant operations can replace its
 * local RLS tenant setting. Serialize operations across boundary instances
 * wrapping the same client. Production pool integrations must still lease one
 * dedicated connection for the duration of each transaction.
 */
const clientQueues=new WeakMap<SqlClient,Promise<void>>();
async function exclusively<T>(client:SqlClient,work:()=>Promise<T>):Promise<T>{
  const previous=clientQueues.get(client)??Promise.resolve();
  let release!:()=>void;
  const current=new Promise<void>(resolve=>{release=resolve;});
  clientQueues.set(client,current);
  await previous;
  try{return await work();}
  finally{
    release();
    if(clientQueues.get(client)===current)clientQueues.delete(client);
  }
}

/** Migration runner and tenant transaction boundary; a driver is injected by the production host. */
export class PostgresCommercialBoundary{
  constructor(private readonly client:SqlClient){}
  async migrate(id:string,sql:string):Promise<"applied"|"already_applied">{
    if(!/^[0-9]{4}_[a-z0-9_]+$/.test(id)||!sql.trim())throw new Error("INVALID_MIGRATION");const checksum=createHash("sha256").update(sql).digest("hex");
    return exclusively(this.client,async()=>{await this.client.query("BEGIN");try{await this.client.query("SELECT pg_advisory_xact_lock(hashtext('sandman_commercial_migrations'))");await this.client.query("CREATE TABLE IF NOT EXISTS commercial_schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");const existing=await this.client.query<{checksum:string}>("SELECT checksum FROM commercial_schema_migrations WHERE id = $1",[id]);if(existing.rows[0]){if(existing.rows[0].checksum!==checksum)throw new Error("MIGRATION_CHECKSUM_MISMATCH");await this.client.query("COMMIT");return"already_applied";}await this.client.query(sql);await this.client.query("INSERT INTO commercial_schema_migrations(id, checksum) VALUES ($1, $2)",[id,checksum]);await this.client.query("COMMIT");return"applied";}catch(error){await this.client.query("ROLLBACK");throw error;} });
  }
  async tenantTransaction<T>(organizationId:string,work:(client:SqlClient)=>Promise<T>):Promise<T>{if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(organizationId))throw new Error("INVALID_TENANT_ID");return exclusively(this.client,async()=>{await this.client.query("BEGIN");try{await this.client.query("SELECT set_config('app.organization_id', $1, true)",[organizationId]);const result=await work(this.client);await this.client.query("COMMIT");return result;}catch(error){await this.client.query("ROLLBACK");throw error;} });}
}


/** Connection leasing contract compatible with a PostgreSQL client's pool.connect(). */
export interface LeasedSqlClient extends SqlClient {release():void}
export interface SqlConnectionPool {connect():Promise<LeasedSqlClient>}

/**
 * A transaction's BEGIN, tenant-local RLS configuration, queries, and COMMIT
 * must use the same leased connection. Never run tenant transactions through
 * the pool's query() convenience method: those queries may use different clients.
 *
 * No implicit database provision or connection is performed by this class.
 */
export class PooledPostgresCommercialBoundary {
  constructor(private readonly pool:SqlConnectionPool){}
  private async withLease<T>(work:(boundary:PostgresCommercialBoundary)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{return await work(new PostgresCommercialBoundary(client));}
    finally{client.release();}
  }
  async migrate(id:string,sql:string):Promise<"applied"|"already_applied">{
    return this.withLease(boundary=>boundary.migrate(id,sql));
  }
  async tenantTransaction<T>(organizationId:string,work:(client:SqlClient)=>Promise<T>):Promise<T>{
    return this.withLease(boundary=>boundary.tenantTransaction(organizationId,work));
  }
}
