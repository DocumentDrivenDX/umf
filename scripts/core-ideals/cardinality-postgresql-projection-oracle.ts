import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
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
 const paths=['scripts/core-ideals/cardinality-postgresql-projection-oracle.ts','scripts/core-ideals/cardinality-postgresql-projection-cases.ts','src/core-ideals/cardinality-postgresql-projection.ts','spec/core/cardinality-postgresql-projection.schema.json','native/postgresql/catalog/image.json'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-postgresql-projection-native.json',JSON.stringify({scope:'PostgreSQL 17.4 explicit Cardinality carriers and retained ideal recovery; item/value conversions and full binding acceptance remain unclaimed',image:manifest.reference,serverVersion:170004,executed,blocked,idealRecoveries,rows,fingerprints},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,executed,blocked,idealRecoveries}));
}finally{if(created)await run(['docker','rm','-f',name]);}
