import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';

const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference as string;
assert.match(image,/^postgres@sha256:[0-9a-f]{64}$/);
const name='umf-relationship-key-'+randomUUID();
async function run(args:string[],input?:string){
 const process=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){process.stdin!.write(input);process.stdin!.end();}
 const [stdout,stderr,code]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
 return {stdout,stderr,code};
}
async function exec(args:string[],input?:string){return run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);}
async function sql(source:string){return exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],source);}
const source=`CREATE SCHEMA sales;
CREATE TABLE sales.orders (id bigint NOT NULL, tenant text NOT NULL) PARTITION BY LIST (tenant);
CREATE TABLE sales.orders_default PARTITION OF sales.orders DEFAULT;
`;
const idOnly='ALTER TABLE sales.orders ADD CONSTRAINT orders_id_key PRIMARY KEY (id);\n';
const composite='ALTER TABLE sales.orders ADD CONSTRAINT orders_id_tenant_key PRIMARY KEY (id, tenant);\n';
let created=false,observed:{serverVersion:string;idOnlyError:string;compositeAccepted:boolean}|undefined;
try{
 const started=await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);
 assert.equal(started.code,0,started.stderr);created=true;
 let version:{stdout:string;stderr:string;code:number}|undefined;
 for(let i=0;i<120;i++){
  const processName=await exec(['cat','/proc/1/comm']);
  if(processName.code!==0||processName.stdout.trim()!=='postgres'){await Bun.sleep(250);continue;}
  const check=await sql('SHOW server_version_num');
  if(check.code===0){version=check;break;}
  await Bun.sleep(250);
 }
 assert(version,'PostgreSQL startup timeout');
 assert.equal(version.stdout.trim(),'170004');
 const setup=await sql(source);assert.equal(setup.code,0,setup.stderr);
 const rejected=await sql(idOnly);
 assert.notEqual(rejected.code,0,'id-only primary key unexpectedly accepted');
 assert.match(rejected.stderr,/unique constraint on partitioned table must include all partitioning columns/i);
 const accepted=await sql(composite);assert.equal(accepted.code,0,accepted.stderr);
 observed={serverVersion:version.stdout.trim(),idOnlyError:rejected.stderr.trim().split('\n').find(line=>line.startsWith('ERROR:'))??rejected.stderr.trim(),compositeAccepted:true};
}finally{if(created)await run(['docker','rm','-f',name]);}
const sha256=createHash('sha256').update(source+idOnly+composite).digest('hex');
await Bun.write('fixtures/projections/ddd-authored-relationships/postgresql-partitioned-key.json',JSON.stringify({
 scope:'PostgreSQL 17.4 DDL only: id-only key on tenant-partitioned Order is rejected; explicit (id,tenant) succeeds but changes authored key meaning',
 image,source,idOnly,composite,observed,sha256,
},null,2)+'\n');
console.log(observed);
