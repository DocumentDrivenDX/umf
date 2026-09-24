import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,importPostgresqlSql,readDocument,writeDocument} from '../../src';

const directory='fixtures/relationship/postgresql-native';
const source=await Bun.file(`${directory}/constraints.sql`).text();
const archive=await importPostgresqlSql(source,backend,{id:'relationship-native-observation'});
assert.equal(getPostgresqlSource(archive),source);
assert.ok((await exportPostgresqlSql(archive,backend)).includes('FOREIGN KEY'));
for(const format of ['json','yaml'] as const)
  assert.equal(getPostgresqlSource(readDocument(writeDocument(archive,format),format)),source);
assert.equal(archive.modules.some(module=>'relationships'in module),false);

const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
const name='umf-relationship-native-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(query:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],query);
let foreignKeys:unknown;
try{
  if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Unpinned PostgreSQL image');
  await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
  let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL startup timeout');
  assert.equal((await sql('SHOW server_version_num')).trim(),'170004');
  await sql(source);
  const query="SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.name),'[]'::json) FROM (SELECT c.conname AS name,c.convalidated AS validated,c.confmatchtype AS match_type,c.conindid::regclass::text AS referenced_index,pg_get_constraintdef(c.oid) AS definition,(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(c.conkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=u.attnum) AS source_columns,(SELECT array_agg(a.attname ORDER BY u.ord) FROM unnest(c.confkey) WITH ORDINALITY u(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=u.attnum) AS target_columns FROM pg_constraint c WHERE c.conrelid='rel.child'::regclass AND c.contype='f') x";
  foreignKeys=JSON.parse((await sql(query)).trim());
  const rows=foreignKeys as {name:string;validated:boolean;match_type:string;referenced_index:string;source_columns:string[];target_columns:string[]}[];
  assert.deepEqual(rows.map(x=>x.name),['fk_alt','fk_pair']);
  assert.equal(rows[0]?.validated,false);assert.equal(rows[1]?.validated,true);
  assert.equal(rows[0]?.match_type,'s');assert.equal(rows[1]?.match_type,'s');
  assert.deepEqual(rows[0]?.target_columns,['alt']);assert.deepEqual(rows[1]?.target_columns,['part_a','part_b']);
  assert.ok(rows[0]?.referenced_index.endsWith('parent_alt_key'));
  assert.ok(rows[1]?.referenced_index.endsWith('uq_parent_pair'));
}finally{if(created)await run(['docker','rm','-f',name]);}
const files=[`${directory}/constraints.sql`,'scripts/relationship/postgresql-native-oracle.ts'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write(`${directory}/oracle.json`,JSON.stringify({scope:'PostgreSQL 17.4 native FK observations only: NOT VALID, MATCH SIMPLE and referenced UNIQUE; no authored relationship or data-query claim',image,serverVersion:170004,adapter:backend.identity,foreignKeys,sourceRecovery:{json:true,yaml:true,unclaimedSourceExact:true},sha256},null,2)+'\n');
console.log(JSON.stringify({foreignKeys:(foreignKeys as unknown[]).length}));
