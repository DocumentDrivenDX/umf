import {createHash,randomUUID} from 'node:crypto';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';

// Evidence of PostgreSQL behavior, not a nullability classifier or equivalence proof.
const name='umf-nullability-postgresql-'+randomUUID();let created=false;
async function run(args:string[],input?:string){
 const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}
 const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 if(code)throw Error(stderr);return stdout;
}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const paths=['native/postgresql/catalog/image.json','native/postgresql/catalog/snapshot.sql','fixtures/postgresql/nullability.sql','scripts/core-ideals/nullability-postgresql-oracle.ts'];
const manifest=await Bun.file(paths[0]!).json(),query=await Bun.file(paths[1]!).text(),sourceSql=await Bun.file(paths[2]!).text();
const cases:[string,string,string,unknown][]=[
 ['nullable-null','INSERT INTO availability.plain VALUES(NULL) RETURNING value','00000',null],
 ['nullable-omitted','INSERT INTO availability.plain DEFAULT VALUES RETURNING value','00000',null],
 ['required-null','INSERT INTO availability.required VALUES(NULL) RETURNING value','23502',null],
 ['required-omitted-default','INSERT INTO availability.required DEFAULT VALUES RETURNING value','00000',7],
 ['domain-direct-null','INSERT INTO availability.domain_required VALUES(NULL) RETURNING value','23502',null],
 ['domain-typed-null-bypass','INSERT INTO availability.domain_required VALUES((SELECT value FROM availability.domain_required WHERE false)) RETURNING value','00000',null],
 ['domain-default','INSERT INTO availability.domain_default DEFAULT VALUES RETURNING value','00000',11],
 ['column-default-overrides-domain','INSERT INTO availability.column_default DEFAULT VALUES RETURNING value','00000',13],
 ['default-does-not-replace-null','INSERT INTO availability.column_default VALUES(NULL) RETURNING value','00000',null],
 ['check-unknown-accepts-null','INSERT INTO availability.positive VALUES(NULL) RETURNING value','00000',null],
 ['check-false-rejects-negative','INSERT INTO availability.positive VALUES(-1) RETURNING value','23514',null],
 ['check-is-not-null-rejects-null','INSERT INTO availability.checked_required VALUES(NULL) RETURNING value','23514',null],
 ['unvalidated-preexisting-null','SELECT value FROM availability.unvalidated','00000',null],
 ['unvalidated-new-null-rejected','INSERT INTO availability.unvalidated VALUES(NULL) RETURNING value','23514',null],
 ['identity-omitted-generates','INSERT INTO availability.identity_value DEFAULT VALUES RETURNING value','00000',1],
 ['identity-null-rejected','INSERT INTO availability.identity_value VALUES(NULL) RETURNING value','23502',null],
 ['generated-omitted-produces-value','INSERT INTO availability.generated_value DEFAULT VALUES RETURNING value','00000',7],
 ['outer-join-produces-null','SELECT value FROM availability.outer_null','00000',null],
];
try{
 if(!/^postgres@sha256:[0-9a-f]{64}$/.test(manifest.reference))throw Error('Unpinned image');
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('Server not ready');
 if((await sql('SHOW server_version_num')).trim()!=='170004')throw Error('Wrong native version');
 await sql(sourceSql);
 // Session-local function records native SQLSTATE without turning expected errors into harness success.
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value integer; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
 const rows=[];
 for(const [id,statement,sqlstate,value] of cases){
  const result=JSON.parse((await sql(helper+"\nSELECT pg_temp.probe('"+statement.replaceAll("'","''")+"');")).trim());
  if(result.sqlstate!==sqlstate||result.value!==value)throw Error(id+': '+JSON.stringify(result));
  rows.push({id,statement,...result});
 }
 const snapshot=JSON.parse(await sql(query));
 const relation=(name:string)=>snapshot.relations.find((r:any)=>r.schema==='availability'&&r.name===name);
 const flags:Record<string,boolean>={plain:false,required:true,domain_required:false,domain_default:false,column_default:false,positive:false,checked_required:false,unvalidated:false,identity_value:true,generated_value:false,outer_null:false};
 for(const [name,flag] of Object.entries(flags))if(relation(name)?.columns.find((c:any)=>c.name==='value')?.notNull!==flag)throw Error('Unexpected catalog flag: '+name);
 if(snapshot.types.find((t:any)=>t.name==='required_domain')?.notNull!==true)throw Error('Missing domain constraint');
 if(relation('unvalidated').constraints[0].validated!==false)throw Error('Lost validation state');
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot,reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const nativeSource=' \n'+JSON.stringify(capture,null,2)+'\n';
 const source=importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-nullability-discovery'});
 const canonical=exportPostgresqlCatalogCapture(source).json;
 for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(copyJson(source),format),format) as unknown as Document;if(exportPostgresqlCatalogCapture(restored).json!==canonical)throw Error('Native tree changed in '+format);}
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 const evidence={scope:'PostgreSQL 17.4 native availability counterexamples and catalog-tree serialization preservation; no ideal classification, projection, exact source-text recovery or browser claim',image:manifest.reference,serverVersion:170004,cases:rows,catalogNotNull:flags,nativeSource,serializationRecoveries:2,fingerprints};
 await Bun.write('fixtures/validation/nullability-postgresql-native.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({serverVersion:170004,cases:rows.length,rejections:rows.filter(r=>r.sqlstate!=='00000').length,serializationRecoveries:2}));
}finally{if(created)await run(['docker','rm','-f',name]);}
