import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,projectDddTablesAndIndexesToPostgresql,type Document} from '../../src';

const directory='fixtures/projections/ddd-postgresql-tables-indexes';
const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const report=await projectDddTablesAndIndexesToPostgresql(fixture.logical as Document,fixture.binding as Document,backend,fixture.policy,'report');
assert.equal(report.status,'reported');assert.equal(report.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/')).length,4);
assert.equal(getPostgresqlSource(report.targetArchive!),report.candidate);
assert.ok((await exportPostgresqlSql(report.targetArchive!,backend)).includes('CREATE INDEX'));
await Bun.write(`${directory}/generated.sql`,report.candidate!);

const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
const name='umf-ddd-indexes-'+randomUUID();let created=false;
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
  const indexes=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT ci.relname AS name,am.amname AS method,i.indisunique AS unique,pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indpred,i.indrelid) AS predicate FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid JOIN pg_am am ON am.oid=ci.relam WHERE i.indrelid='sales.orders'::regclass) x")).trim());
  assert.deepEqual(indexes.map((x:any)=>x.name),['orders_btree','orders_expression','orders_hash','orders_partial']);
  assert.deepEqual(indexes.map((x:any)=>x.method),['btree','btree','hash','btree']);
  assert.equal(indexes.find((x:any)=>x.name==='orders_expression')?.definition.includes('#>>'),true);
  assert.equal(indexes.find((x:any)=>x.name==='orders_partial')?.predicate.includes('paid'),true);
  observed={indexes};
}finally{if(created)await run(['docker','rm','-f',name]);}
const files=['fixtures/projections/ddd-postgresql-tables/case.json',`${directory}/generated.sql`,'src/projections/ddd-postgresql/tables-indexes.ts','src/projections/binding-postgresql/indexes.ts'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write(`${directory}/oracle.json`,JSON.stringify({scope:'PostgreSQL 17.4 DDD table and supported index DDL; unsupported access methods, partitioned uniqueness, clustering and relationships stay residual',image,serverVersion:170004,adapter:backend.identity,observed,residuals:report.residuals,sha256},null,2)+'\n');
console.log(JSON.stringify({indexes:(observed as any).indexes.length,residuals:report.residuals.length}));
