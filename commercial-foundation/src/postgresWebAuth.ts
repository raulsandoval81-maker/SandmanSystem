import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {AuthorizationTransaction,AuthorizationTransactionStore} from "./auth0Flows";
import {SqlConnectionPool} from "./postgres";

type Envelope={ciphertext:string;iv:string;tag:string};
export interface WebSession {accessToken:string;csrfToken:string;expiresAt:number}

class EncryptedPostgresStore {
  private readonly key:Buffer;
  constructor(protected readonly pool:SqlConnectionPool,keyBase64:string){this.key=Buffer.from(keyBase64,"base64");if(this.key.length!==32)throw new Error("COMMERCIAL_SESSION_KEY_INVALID");}
  protected seal(value:unknown):Envelope{const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,iv),ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return{ciphertext:ciphertext.toString("base64"),iv:iv.toString("base64"),tag:cipher.getAuthTag().toString("base64")};}
  protected open<T>(value:Envelope):T{try{const decipher=createDecipheriv("aes-256-gcm",this.key,Buffer.from(value.iv,"base64"));decipher.setAuthTag(Buffer.from(value.tag,"base64"));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,"base64")),decipher.final()]).toString("utf8")) as T;}catch{throw new Error("COMMERCIAL_SESSION_DECRYPTION_FAILED");}}
  protected async runtime<T>(work:(query:<R=Record<string,unknown>>(sql:string,values?:readonly unknown[])=>Promise<{rows:R[]}>)=>Promise<T>):Promise<T>{const client=await this.pool.connect();try{await client.query("BEGIN");try{await client.query("SET LOCAL ROLE commercial_runtime");const result=await work(async(sql,values)=>client.query(sql,values));await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}}finally{client.release();}}
}

export class PostgresAuthorizationTransactionStore extends EncryptedPostgresStore implements AuthorizationTransactionStore {
  async save(value:AuthorizationTransaction){const sealed=this.seal(value);await this.runtime(async query=>{await query("SELECT commercial_auth_transaction_put($1,$2,$3,$4,to_timestamp($5))",[value.stateDigest,sealed.ciphertext,sealed.iv,sealed.tag,value.expiresAt/1000]);});}
  async consume(stateDigest:string){return this.runtime(async query=>{const result=await query<Envelope>("SELECT * FROM commercial_auth_transaction_consume($1)",[stateDigest]);return result.rows[0]?this.open<AuthorizationTransaction>(result.rows[0]):undefined;});}
}

export class PostgresWebSessionStore extends EncryptedPostgresStore {
  async create(value:WebSession):Promise<string>{const cookie=randomBytes(32).toString("base64url"),sealed=this.seal(value),digest=createHash("sha256").update(cookie).digest("hex");await this.runtime(async query=>{await query("SELECT commercial_web_session_put($1,$2,$3,$4,to_timestamp($5))",[digest,sealed.ciphertext,sealed.iv,sealed.tag,value.expiresAt/1000]);});return cookie;}
  async get(cookie:string):Promise<WebSession|undefined>{if(!/^[A-Za-z0-9_-]{43}$/.test(cookie))return;const digest=createHash("sha256").update(cookie).digest("hex");return this.runtime(async query=>{const result=await query<Envelope>("SELECT * FROM commercial_web_session_get($1)",[digest]);return result.rows[0]?this.open<WebSession>(result.rows[0]):undefined;});}
  async delete(cookie:string):Promise<void>{if(!/^[A-Za-z0-9_-]{43}$/.test(cookie))return;const digest=createHash("sha256").update(cookie).digest("hex");await this.runtime(async query=>{await query("SELECT commercial_web_session_delete($1)",[digest]);});}
}
