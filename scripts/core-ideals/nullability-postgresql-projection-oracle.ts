import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlNullabilityProjectionCases} from './nullability-postgresql-projection-cases';
import {projectNullabilityToPostgresql,recoverNullabilityFromPostgresql} from '../../src/core-ideals/nullability-postgresql-projection';
import {classifyPostgresqlNullability,recoverPostgresqlNullabilitySource} from '../../src/core-ideals/nullability-postgresql';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {upgradeNullabilityEnvelope} from '../../src/model/nullability-transition';
import {classifyPostgresqlField} from '../../src/core-ideals/postgresql-field';
import {identifier,carriers} from '../../src/core-ideals/postgresql-syntax';
const name='umf-nullability-down-'+randomUUID();let created=false;
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
 await sql('CREATE SCHEMA availability; CREATE DOMAIN availability.text AS integer; CREATE TABLE public.sentinel(id integer);');
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN EXECUTE statement; RETURN '00000'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;`;
 const probe=async(statement:string)=>(await sql(helper+"SELECT pg_temp.probe('"+statement.replaceAll("'","''")+"');")).trim();
 const rows=[];let executed=0,blocked=0,idealRecoveries=0;
 const present:Record<keyof typeof carriers,string>={boolean:'true',smallint:'1',integer:'1',bigint:'1',numeric:'1.25',real:'1.25','double precision':'1.25',text:"'value'",bytea:"decode('00','hex')",date:"DATE '2000-01-01'",time:"TIME '12:00:00'",'time with time zone':"TIMETZ '12:00:00+00'",timestamp:"TIMESTAMP '2000-01-01 12:00:00'",'timestamp with time zone':"TIMESTAMPTZ '2000-01-01 12:00:00+00'"};
 for(const c of postgresqlNullabilityProjectionCases()){
  const result=await projectNullabilityToPostgresql(c.author,c.request,backend);
  if(result.status!==c.status)throw Error('Projection policy mismatch '+c.id);
  if(!result.nativeSql){if(result.target)throw Error('Partial blocked target');blocked++;rows.push({...c,result});continue;}
  await sql('SET search_path=availability,pg_catalog;\n'+result.nativeSql);executed++;
  const target=identifier(c.request.namespace)+'.'+identifier(c.request.tableName);
  const nullState=await probe('INSERT INTO '+target+' VALUES(NULL)'),omittedState=await probe('INSERT INTO '+target+' DEFAULT VALUES');
  const expected=c.expectedNotNull?'23502':'00000';if(nullState!==expected||omittedState!==expected)throw Error('Native absence behavior '+c.id+': '+nullState+'/'+omittedState);
  if(await probe('INSERT INTO '+target+' VALUES('+present[c.nativeType]+')')!=='00000')throw Error('Present value refused '+c.id);
  if(JSON.stringify(await recoverNullabilityFromPostgresql(result,result.nativeSql,backend))!==JSON.stringify(c.author.target))throw Error('Ideal recovery '+c.id);idealRecoveries++;
  rows.push({...c,result,nullState,omittedState});
 }
 if((await sql("SELECT to_regclass('public.sentinel') IS NOT NULL")).trim()!=='t')throw Error('Quoted identifier escaped');
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:JSON.parse(await sql(query)),reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const nativeSource=JSON.stringify(capture),source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'native-nullability'})).target;
 for(const c of rows.filter(c=>c.result.status==='blocked'))if(getPostgresqlColumnMetadata(source).some(m=>m.relation.schema==='availability'&&m.relation.name===c.request.tableName))throw Error('Blocked target executed '+c.id);
 let classified=0,nativeRecoveries=0;const observations=[];
 for(const c of rows.filter(c=>c.result.status==='projected')){
  const column=getPostgresqlColumnMetadata(source).find(m=>m.relation.schema==='availability'&&m.relation.name===c.request.tableName);
  if(!column)throw Error('Missing native column '+c.id);
  const nativeType=column.nativeColumn.kind==='object'?column.nativeColumn.members.nativeType:undefined;
  if(nativeType?.kind!=='object'||nativeType.members.schema?.kind!=='string'||nativeType.members.schema.value!=='pg_catalog'||nativeType.members.name?.kind!=='string'||nativeType.members.name.value!==carriers[c.nativeType][0])throw Error('Wrong native type identity '+c.id);
  if(column.element.name!==c.request.columnName||column.element.description!==c.author.target.modules[0]!.elements[0]!.description)throw Error('Native name/comment changed '+c.id);
  const field=classifyPostgresqlField(source,{column:column.path,nativeSource,mode:'strict'});
  const upgraded=upgradeNullabilityEnvelope(field.target!).target;
  const observation=classifyPostgresqlNullability(upgraded,{column:column.path,nativeSource,mode:'strict',scope:'stored-relation',carrier:'sql-null'});
  const expected=c.expectedNotNull?'required':'absent-allowed';
  if(observation.status!=='classified'||observation.mapping.nullability!==expected)throw Error('Native reclassification '+c.id);
  if(recoverPostgresqlNullabilitySource(observation,observation.target!)!==nativeSource)throw Error('Native capture recovery');
  classified++;nativeRecoveries++;observations.push({id:c.id,authored:c.label,observed:observation.mapping.nullability,origin:observation.mapping.origin});
 }
 const paths=['scripts/core-ideals/nullability-postgresql-projection-oracle.ts','scripts/core-ideals/nullability-postgresql-projection-cases.ts','src/core-ideals/nullability-postgresql-projection.ts','src/core-ideals/nullability-postgresql.ts','spec/core/nullability-postgresql-projection.schema.json','native/postgresql/catalog/image.json','native/postgresql/catalog/snapshot.sql'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-postgresql-projection-native.json',JSON.stringify({scope:'PostgreSQL 17.4 authored single-column availability projection, native NULL/omission/present-value probes, retained-report ideal recovery and native capture reclassification; no value-domain equivalence',image:manifest.reference,serverVersion:170004,executed,blocked,idealRecoveries,classified,nativeRecoveries,observations,rows,fingerprints},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,executed,blocked,idealRecoveries,classified,nativeRecoveries}));
}finally{if(created)await run(['docker','rm','-f',name]);}
