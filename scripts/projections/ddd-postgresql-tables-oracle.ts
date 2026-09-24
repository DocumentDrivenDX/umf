import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,projectDddTablesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const report=await projectDddTablesToPostgresql(fixture.logical as Document,fixture.binding as Document,backend,fixture.policy,'report');
assert.equal(report.status,'reported');assert.equal(report.residuals.length,26);
assert.equal(getPostgresqlSource(report.targetArchive!),report.candidate);
assert.ok((await exportPostgresqlSql(report.targetArchive!,backend)).includes('CREATE TABLE'));
await Bun.write('fixtures/projections/ddd-postgresql-tables/generated.sql',report.candidate!);

const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
const name='umf-ddd-tables-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(query:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],query);
let observed:unknown;
try{
  if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Unpinned PostgreSQL image');
  await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL startup timeout');
  assert.equal((await sql('SHOW server_version_num')).trim(),'170004');
  await sql(report.candidate!);
  const tables=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT c.relname AS name,c.relispartition AS partition_child,pt.partstrat AS partition_strategy FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_partitioned_table pt ON pt.partrelid=c.oid WHERE n.nspname='sales' AND c.relkind IN ('r','p')) x")).trim());
  assert.deepEqual(tables.map((x:any)=>x.name),['customers','order_products','orders','orders_default','products']);
  assert.equal(tables.find((x:any)=>x.name==='orders')?.partition_strategy,'l');
  assert.equal(tables.find((x:any)=>x.name==='orders_default')?.partition_child,true);
  const columns=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a WHERE a.attrelid='sales.orders'::regclass AND a.attnum>0 AND NOT a.attisdropped) x")).trim());
  assert.deepEqual(columns.map((x:any)=>[x.name,x.type,x.required]),[['customerId','bigint',true],['id','bigint',true],['payload','jsonb',false],['status','text',true],['tenant','text',true]]);
  const checks=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT conname AS name,convalidated AS validated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='sales.orders'::regclass AND contype='c') x")).trim());
  assert.equal(checks.some((x:any)=>x.name==='ck_orders_payload_object'&&x.validated&&x.definition.includes('jsonb_typeof')),true);
  const productColumns=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required FROM pg_attribute a WHERE a.attrelid='sales.products'::regclass AND a.attnum>0 AND NOT a.attisdropped) x")).trim());
  assert.deepEqual(productColumns.map((x:any)=>[x.name,x.type,x.required]),[['id','bigint',true],['payload','jsonb',false],['sku','text',true]]);
  const productChecks=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT conname AS name,convalidated AS validated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='sales.products'::regclass AND contype='c') x")).trim());
  assert.equal(productChecks.some((x:any)=>x.name==='ck_products_payload_object'&&x.validated&&x.definition.includes('jsonb_typeof')),true);
  observed={tables,columns,checks,productColumns,productChecks};
}finally{if(created)await run(['docker','rm','-f',name]);}
const files=['fixtures/projections/ddd-postgresql-tables/case.json','fixtures/projections/ddd-postgresql-tables/generated.sql','src/projections/ddd-postgresql/tables.ts'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/projections/ddd-postgresql-tables/oracle.json',JSON.stringify({scope:'PostgreSQL 17.4 isolated execution of DDD-derived tables, JSONB object carrier and LIST/default partition; relationship, key, index and path semantics remain residual',image,serverVersion:170004,adapter:backend.identity,observed,residuals:report.residuals,sha256},null,2)+'\n');
console.log(JSON.stringify({tables:(observed as any).tables.length,residuals:report.residuals.length}));
