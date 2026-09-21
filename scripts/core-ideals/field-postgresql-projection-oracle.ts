import {postgresqlRecordProjectionCases} from './record-postgresql-projection-cases';
import {projectRecordToPostgresql,recoverRecordFromPostgresql} from '../../src/core-ideals/record-postgresql-projection';
import {randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlProjectionCases} from './field-postgresql-projection-cases';
import {projectFieldToPostgresql,recoverFieldFromPostgresql} from '../../src/core-ideals/field-postgresql-projection';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyPostgresqlField} from '../../src/core-ideals/postgresql-field';
const name='umf-field-down-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [stdout,stderr,status]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(status)throw Error(stderr);return stdout;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
try{
 if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Unpinned image');
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('Server not ready');
 if((await sql('SHOW server_version_num')).trim()!=='170004')throw Error('Wrong version');
 await sql('CREATE SCHEMA sales; CREATE DOMAIN sales.text AS integer; CREATE TABLE public.sentinel(id integer);');
 const rows:Array<ReturnType<typeof postgresqlProjectionCases>[number]&{result:Awaited<ReturnType<typeof projectFieldToPostgresql>>}>=[];for(const c of postgresqlProjectionCases()){const result=await projectFieldToPostgresql(c.author,c.request,backend);if(!result.nativeSql)throw Error('Projection blocked');await sql('SET search_path=sales,pg_catalog;\n'+result.nativeSql);if(JSON.stringify(await recoverFieldFromPostgresql(result,result.nativeSql,backend))!==JSON.stringify(c.author.target))throw Error('Ideal recovery');rows.push({...c,result});}
 const recordRows:Array<ReturnType<typeof postgresqlRecordProjectionCases>[number]&{result:Awaited<ReturnType<typeof projectRecordToPostgresql>>}>=[];for(const c of postgresqlRecordProjectionCases()){const result=await projectRecordToPostgresql(c.author,c.request,backend);if(result.status==='projected'){await sql('SET search_path=sales,pg_catalog;\n'+result.nativeSql);if(JSON.stringify(await recoverRecordFromPostgresql(result,result.nativeSql!,backend))!==JSON.stringify(c.author.target))throw Error('Record ideal recovery');}else if(result.target||result.nativeSql)throw Error('Partial blocked record');recordRows.push({...c,result});}
 const allObserved=JSON.parse(await sql("SELECT json_agg(json_build_object('table',c.relname,'column',a.attname,'type',t.typname,'typeOid',t.oid,'typeSchema',tn.nspname,'comment',col_description(c.oid,a.attnum),'position',a.attnum) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace WHERE n.nspname='sales' AND c.relkind='r'"));
 const observed=allObserved.filter((c:any)=>rows.some(r=>r.request.tableName===c.table));
 if(observed.length!==rows.length||(await sql("SELECT to_regclass('public.sentinel') IS NOT NULL")).trim()!=='t')throw Error('Unexpected table effects');
 const typeNames=[...new Set(rows.map(r=>r.request.nativeType))];
 const expectedTypes=JSON.parse(await sql("SELECT json_object_agg(name, to_regtype(name)::oid) FROM unnest(ARRAY["+typeNames.map(name=>"'"+name+"'").join(',')+"]::text[]) AS names(name)"));
 for(const row of rows){const actual=observed.find((c:any)=>c.table===row.request.tableName);if(!actual||actual.column!==row.request.columnName||actual.typeSchema!=='pg_catalog'||actual.typeOid!==expectedTypes[row.request.nativeType]||actual.comment!==row.author.target.modules[0]!.elements[0]!.description)throw Error('Names, comments or built-in identity differ');}
 const tableComments=JSON.parse(await sql("SELECT json_object_agg(c.relname,obj_description(c.oid,'pg_class')) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sales' AND c.relkind='r'"));
 for(const row of recordRows){const actual=allObserved.filter((c:any)=>c.table===row.request.tableName).sort((a:any,b:any)=>a.position-b.position);if(row.result.status==='blocked'){if(Object.hasOwn(tableComments,row.request.tableName))throw Error('Blocked record exists');continue;}
  const names=row.variant==='empty'?[]:['id','label','active'];if(JSON.stringify(actual.map((c:any)=>c.column))!==JSON.stringify(names)||tableComments[row.request.tableName]!=='Order record')throw Error('Native record membership/comment');
  for(const column of actual){const field=row.request.fields.find(f=>f.columnName===column.column)!;if(column.typeSchema!=='pg_catalog'||column.typeOid!==expectedTypes[field.nativeType])throw Error('Native record type mismatch');}
 }
 const query=await Bun.file('native/postgresql/catalog/snapshot.sql').text();const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:JSON.parse(await sql(query)),reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const nativeSource=JSON.stringify(capture),source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'native-only'})).target;let classified=0;
 for(const column of getPostgresqlColumnMetadata(source).filter(c=>c.relation.schema==='sales')){const result=classifyPostgresqlField(source,{column:column.path,nativeSource,mode:'strict'});if(result.mapping.origin!=='classified'||result.request.author)throw Error('Author intent inferred');classified++;}
 await Bun.write('fixtures/validation/field-postgresql-projection-native.json',JSON.stringify({scope:'PostgreSQL 17.4 executed Field and flat-record DDL, catalog identities/comments and retained-report ideal recovery; no value-domain equivalence',image,serverVersion:170004,classified,expectedTypes,observed,rows,recordRows,tableComments},null,2)+'\n');console.log(JSON.stringify({executed:rows.length,classified,comments:observed.length,recordCases:recordRows.length,executedRecords:recordRows.filter(r=>r.result.status==='projected').length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
