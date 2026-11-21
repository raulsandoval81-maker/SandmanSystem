const {readFileSync,readdirSync}=require("node:fs");
const {join}=require("node:path");
const {createPrivateCommercialPool,PostgresCommercialApplication,InMemoryTestIdentityAuthority}=require("../lib");

async function migrate(){
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error("DATABASE_URL_REQUIRED");
  const pool=createPrivateCommercialPool(url,{max:4,connectionTimeoutMillis:10_000});
  const app=new PostgresCommercialApplication(pool,new InMemoryTestIdentityAuthority());
  try{
    const directory=join(__dirname,"../postgres"),results=[];
    for(const filename of readdirSync(directory).filter(x=>/^\d{4}_[a-z0-9_]+\.sql$/.test(x)).sort()){
      const id=filename.slice(0,-4),sql=readFileSync(join(directory,filename),"utf8");
      results.push({id,status:await app.migrate(id,sql)});
    }
    console.log(JSON.stringify({migrations:results}));
  }finally{await pool.close();}
}
migrate().catch(error=>{console.error(error instanceof Error?error.message:"POSTGRES_MIGRATION_FAILED");process.exitCode=1;});
