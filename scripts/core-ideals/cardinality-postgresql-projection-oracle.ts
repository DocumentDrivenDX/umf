import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,classifyPostgresqlCardinality,recoverPostgresqlCardinalitySource} from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlCardinalityProjectionCases} from './cardinality-postgresql-projection-cases';
import {projectCardinalityToPostgresql,recoverCardinalityFromPostgresql} from '../../src/core-ideals/cardinality-postgresql-projection';
const name='umf-cardinality-down-'+randomUUID();let created=false;
async function run(args:string[],input?:string){
 const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}
 const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 if(code)throw Error(stderr);return stdout;
}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const manifest=await Bun.file('native/postgresql/catalog/image.json').json(),query=await Bun.file('native/postgresql/catalog/snapshot.sql').text();
try{
 if(!/^postgres@sha256:[0-9a-f]{64}$/.test(manifest.reference))throw Error('Unpinned image');
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('Server not ready');
 if((await sql('SHOW server_version_num')).trim()!=='170004')throw Error('Wrong native version');
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE statement; RETURN '00000'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;`;
 const probe=async(statement:string)=>(await sql(helper+"SELECT pg_temp.probe('"+statement.replaceAll("'","''")+"');")).trim();
 const rows=[];let executed=0,blocked=0,idealRecoveries=0;
 for(const c of postgresqlCardinalityProjectionCases()){
  const result=await projectCardinalityToPostgresql(c.author,c.request,backend);
  if(result.status==='blocked'){assert.equal(result.nativeSql,undefined);blocked++;rows.push({...c,result});continue;}
  await sql(result.nativeSql!);executed++;
  const target='public."'+c.request.tableName+'"';
  const vectors:[string,string][]=c.request.storage==='array'?[
   ['ARRAY[3,1,3]','00000'],["'{}'::integer[]",'00000'],['ARRAY[1,NULL,3]','00000'],['ARRAY[[1,2],[3,4]]','23514'],["'[0:2]={1,2,3}'::integer[]",'23514'],['NULL','00000']
  ]:c.request.storage==='jsonb-object'?[["'{\"x\":1}'",'00000'],["'{\"x\":1,\"x\":2}'",'00000'],["'7'",'23514'],["'null'",'23514'],['NULL','00000']]:[['7','00000'],['NULL','00000']];
  const probes=[];
  for(const [value,expected] of vectors){const statement='INSERT INTO '+target+' VALUES('+value+')',state=await probe(statement);assert.equal(state,expected,statement);probes.push({statement,state});}
  assert.deepEqual(await recoverCardinalityFromPostgresql(result,result.nativeSql!,backend),c.author.target);idealRecoveries++;
  rows.push({...c,result,probes});
 }
 const supplementQuery=await Bun.file('native/postgresql/catalog/cardinality-v1.sql').text();
 const pair=(await sql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'+query+'\n'+supplementQuery+'\nCOMMIT;')).trim().split('\n').map(v=>JSON.parse(v));assert.equal(pair.length,2);
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:pair[0],reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const nativeSource=JSON.stringify(capture),supplement=JSON.stringify(pair[1]);
 const model=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'projected-capture'})).target).target).target;
 for(const e of model.modules.find(m=>m.id==='postgresql.columns')!.elements)e.kind='field';
 const observations=[];
 for(const row of rows){
  const column=getPostgresqlColumnMetadata(model).find(c=>c.relation.name===row.request.tableName);
  if(row.result.status==='blocked'){assert.equal(column,undefined);continue;}
  assert.ok(column);
  const r=classifyPostgresqlCardinality(model,{column:column.path,nativeSource,supplement,mode:'report',profile:'stored-value'});
  assert.equal(r.status,'classified');assert.equal(r.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='array'?'array':'unspecified');
  assert.deepEqual(recoverPostgresqlCardinalitySource(r,r.target!),{nativeSource,supplement});
  assert.deepEqual(await recoverCardinalityFromPostgresql(row.result,row.result.nativeSql!,backend),row.author.target);
  observations.push({table:row.request.tableName,authored:row.author.provenance.cardinality,observed:r.mapping.cardinality,outcome:r.mapping.outcome,residualReasons:r.residuals.map(r=>r.reason)});
 }
 const paths=['scripts/core-ideals/cardinality-postgresql-projection-oracle.ts','scripts/core-ideals/cardinality-postgresql-projection-cases.ts','src/core-ideals/cardinality-postgresql-projection.ts','spec/core/cardinality-postgresql-projection.schema.json','native/postgresql/catalog/image.json','native/postgresql/catalog/snapshot.sql','native/postgresql/catalog/cardinality-v1.sql','src/core-ideals/cardinality-postgresql.ts','src/adapters/postgresql/cardinality-catalog.ts'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-postgresql-projection-native.json',JSON.stringify({scope:'PostgreSQL 17.4 explicit Cardinality carriers and retained ideal recovery; item/value conversions and full binding acceptance remain unclaimed',image:manifest.reference,serverVersion:170004,executed,blocked,idealRecoveries,observations,nativeSource,supplement,rows,fingerprints},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,executed,blocked,idealRecoveries,nativeRecoveries:observations.length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
