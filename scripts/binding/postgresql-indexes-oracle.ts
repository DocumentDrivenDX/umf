import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,importPostgresqlSql,projectBindingIndexesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/postgresql-indexes/case.json').json();
const source=await Bun.file(fixture.native).text();
const archive=await importPostgresqlSql(source,backend,{id:'native-table'});
const result=await projectBindingIndexesToPostgresql(fixture.logical as Document,fixture.binding as Document,archive,backend,'report');
assert.equal(result.status,'reported');assert.equal(result.residuals.length,1);
assert.equal(getPostgresqlSource(result.nativeArchive),source);
const candidate=result.candidate!;
const parsed=await importPostgresqlSql(candidate,backend,{id:'binding-index-ddl'});
assert.ok((await exportPostgresqlSql(parsed,backend)).includes('CREATE'));
await Bun.write('fixtures/binding/postgresql-indexes/generated.sql',candidate);

const name='umf-index-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [stdout,stderr,status]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(status)throw Error(stderr);return stdout;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
let observed:unknown;
try{
  if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Unpinned image');
  await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL server not ready');
  assert.equal((await sql('SHOW server_version_num')).trim(),'170004');
  await sql(source+'\n'+candidate);
  const rows=JSON.parse((await sql("SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT c.relname AS name,a.amname AS method,i.indisunique AS unique_index,i.indexprs IS NOT NULL AS expression_index,i.indpred IS NOT NULL AS partial_index FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_am a ON a.oid=c.relam WHERE t.relname='orders' AND t.relnamespace='public'::regnamespace) x")).trim());
  assert.equal(rows.length,7);
  assert.deepEqual(Object.fromEntries(rows.map((r:any)=>[r.name,r.method])),{orders_btree:'btree',orders_expr:'btree',orders_gin:'gin',orders_gist:'gist',orders_hash:'hash',orders_partial:'btree',orders_unique:'btree'});
  assert.equal(rows.find((r:any)=>r.name==='orders_expr')?.expression_index,true);
  assert.equal(rows.find((r:any)=>r.name==='orders_partial')?.partial_index,true);
  assert.equal(rows.find((r:any)=>r.name==='orders_unique')?.unique_index,true);
  observed=rows;
}finally{if(created)await run(['docker','rm','-f',name]);}
const files=['fixtures/binding/postgresql-indexes/case.json',fixture.native,'fixtures/binding/postgresql-indexes/generated.sql','src/projections/binding-postgresql/indexes.ts'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/binding/postgresql-indexes/oracle.json',JSON.stringify({scope:'PostgreSQL 17.4 isolated native execution of seven authored index forms; no production deployment, query-plan or performance claim',image,serverVersion:170004,adapter:backend.identity,residuals:result.residuals,observed,sha256},null,2)+'\n');
console.log(JSON.stringify({created:(observed as any[]).length,residuals:result.residuals.length,serverVersion:170004}));
