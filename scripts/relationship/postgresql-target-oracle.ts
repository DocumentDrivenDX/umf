import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,importPostgresqlSql,readDocument,writeDocument} from '../../src';

const base='fixtures/projections/ddd-authored-relationships/';
const source=await Bun.file(base+'expected-postgresql-relationships.sql').text();
const archive=await importPostgresqlSql(source,backend,{id:'expected-relationship-target'});
assert.equal(getPostgresqlSource(archive),source);
assert.ok((await exportPostgresqlSql(archive,backend)).includes('fk_order_products_product'));
for(const format of ['json','yaml'] as const)assert.equal(getPostgresqlSource(readDocument(writeDocument(archive,format),format)),source);
const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference as string;
assert.match(image,/^postgres@sha256:[0-9a-f]{64}$/);
const name='umf-expected-relations-'+randomUUID();
async function run(args:string[],input?:string){
 const process=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){process.stdin!.write(input);process.stdin!.end();}
 const [stdout,stderr,code]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
 return {stdout,stderr,code};
}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(query:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],query);
let created=false,observed:unknown;
try{
 const started=await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);
 assert.equal(started.code,0,started.stderr);created=true;
 let version:{stdout:string;stderr:string;code:number}|undefined;
 for(let i=0;i<120;i++){
  const processName=await exec(['cat','/proc/1/comm']);
  if(processName.code!==0||processName.stdout.trim()!=='postgres'){await Bun.sleep(250);continue;}
  const check=await sql('SHOW server_version_num');if(check.code===0){version=check;break;}
  await Bun.sleep(250);
 }
 assert(version,'PostgreSQL startup timeout');assert.equal(version.stdout.trim(),'170004');
 const applied=await sql(source);assert.equal(applied.code,0,applied.stderr);
 const constraints=await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT con.conname AS name,con.contype AS kind,c.relname AS table_name,pg_get_constraintdef(con.oid) AS definition,con.convalidated AS validated FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sales' AND con.contype IN ('p','f')) x");
 assert.equal(constraints.code,0,constraints.stderr);
 const keys=JSON.parse(constraints.stdout.trim()) as {name:string;kind:string;table_name:string;definition:string;validated:boolean}[];
 assert.deepEqual(keys.map(row=>[row.name,row.kind]),[
  ['fk_order_products_order','f'],['fk_order_products_product','f'],['fk_orders_customer','f'],
  ['pk_customers','p'],['pk_order_products','p'],['pk_orders','p'],['pk_products','p'],
 ]);
 assert(keys.every(row=>row.validated));
 const indexes=await sql("SELECT COALESCE(json_agg(indexname ORDER BY indexname),'[]'::json) FROM pg_indexes WHERE schemaname='sales' AND indexname LIKE 'orders_%'");
 assert.equal(indexes.code,0,indexes.stderr);
 const namedIndexes=JSON.parse(indexes.stdout.trim()) as string[];
 assert.deepEqual(namedIndexes,['orders_btree','orders_expression','orders_hash','orders_partial','orders_unique']);
 const quantity=await sql("SELECT format_type(a.atttypid,a.atttypmod),a.attnotnull FROM pg_attribute a WHERE a.attrelid='sales.order_products'::regclass AND a.attname='quantity'");
 assert.equal(quantity.code,0,quantity.stderr);assert.equal(quantity.stdout.trim(),'numeric(12,2)|t');
 observed={serverVersion:version.stdout.trim(),constraints:keys,indexes:namedIndexes,quantity:quantity.stdout.trim()};
}finally{if(created)await run(['docker','rm','-f',name]);}
const sha256=Object.fromEntries(await Promise.all(['expected-postgresql-relationships.sql','postgresql-layout-proposal.json'].map(async file=>[base+file,createHash('sha256').update(new Uint8Array(await Bun.file(base+file).arrayBuffer())).digest('hex')])));
await Bun.write(base+'expected-postgresql-oracle.json',JSON.stringify({scope:'Hand-authored expected PostgreSQL 17.4 target; DDL and catalog acceptance only, not generated projection or instance referential proof',image,adapter:backend.identity,sourceRecovered:true,observed,sha256},null,2)+'\n');
console.log({constraints:(observed as any).constraints.length,indexes:(observed as any).indexes.length});
