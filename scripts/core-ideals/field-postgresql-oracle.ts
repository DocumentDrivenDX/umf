import {classifyPostgresqlRecord,recoverPostgresqlRecordCapture} from '../../src/core-ideals/postgresql-record';
import {randomUUID,createHash} from 'node:crypto';
import {importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/adapters/postgresql/catalog';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyPostgresqlField,recoverPostgresqlFieldCapture} from '../../src/core-ideals/postgresql-field';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
const name='umf-field-postgresql-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(stderr);return stdout;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const manifest=await Bun.file('native/postgresql/catalog/image.json').json(),query=await Bun.file('native/postgresql/catalog/snapshot.sql').text();
try{
 if(!/^postgres@sha256:[0-9a-f]{64}$/.test(manifest.reference))throw Error('Unpinned image');
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('Server not ready');
 const version=(await sql('SHOW server_version_num')).trim();if(version!=='170004')throw Error('Wrong native version');
 const sourceSql='CREATE SCHEMA sales;\n'+await Bun.file('fixtures/postgresql/scalar-types.sql').text()+'\nCREATE SCHEMA support; CREATE TABLE support.scalar_types(id integer, note text); CREATE TABLE sales.empty_table(); CREATE TABLE sales.partitioned_events(id integer) PARTITION BY RANGE(id); CREATE VIEW sales.scalar_view AS SELECT flag FROM sales.scalar_types;';await sql(sourceSql);
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:JSON.parse(await sql(query)),reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const nativeSource=' \n'+JSON.stringify(capture,null,2)+'\n',source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(nativeSource,{id:'live-fields'})).target;
 const names=JSON.parse((await sql("SELECT json_agg(attname ORDER BY attnum) FROM pg_attribute WHERE attrelid='sales.scalar_types'::regclass AND attnum>0 AND NOT attisdropped")).trim());
 const columns=getPostgresqlColumnMetadata(source).filter(c=>c.relation.schema==='sales'&&c.relation.name==='scalar_types');if(JSON.stringify(columns.map(c=>c.element.name))!==JSON.stringify(names))throw Error('Native member identities differ');
 const rows=[];for(const c of columns){const result=classifyPostgresqlField(source,{column:c.path,nativeSource,mode:'strict'});if(!result.target)throw Error('Native member blocked');for(const format of ['json','yaml'] as const){const back=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;if(recoverPostgresqlFieldCapture(back,back.target!)!==nativeSource)throw Error('Capture bytes lost');}rows.push({path:c.path,name:c.element.name,kind:'field',scalarType:c.element.scalarType??null,recoveries:2});}
 const records=[];
 for(const relation of [{schema:'sales',name:'scalar_types'},{schema:'support',name:'scalar_types'},{schema:'sales',name:'empty_table'},{schema:'sales',name:'partitioned_events'}]){
  const result=classifyPostgresqlRecord(source,{recordModule:'records',recordId:'record',mode:'strict',nativeSource,relation});if(!result.target)throw Error('Record blocked');
  const names=JSON.parse((await sql("SELECT coalesce(json_agg(attname ORDER BY attnum),'[]'::json) FROM pg_attribute WHERE attrelid='"+relation.schema+'.'+relation.name+"'::regclass AND attnum>0 AND NOT attisdropped")).trim());
  const record=result.target.modules.at(-1)!.elements[0]!;
  const actualNames=record.references!.map(ref=>result.target!.modules.find(m=>m.id===ref.module)!.elements.find(e=>e.id===ref.element)!.name);
  if(JSON.stringify(actualNames)!==JSON.stringify(names))throw Error('Record native membership differs');
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;if(recoverPostgresqlRecordCapture(receipt,receipt.target!)!==nativeSource)throw Error('Record capture lost');}
  records.push({relation,names,kind:'record',recoveries:2});
 }
 const view=classifyPostgresqlRecord(source,{recordModule:'records',recordId:'view',mode:'report',nativeSource,relation:{schema:'sales',name:'scalar_view'}});if(view.status!=='blocked'||view.target)throw Error('Unsupported view implied');
 const evidence={records,viewBlocked:true,scope:'Live PostgreSQL 17.4 catalog member classification and exact capture-text recovery; ordinary table record membership, no raw DDL or native type equivalence claim',image:manifest.reference,serverVersion:version,sourceSqlSha256:createHash('sha256').update(sourceSql).digest('hex'),nativeSource,rows};
 await Bun.write('fixtures/validation/field-postgresql-native.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({columns:rows.length,recoveries:rows.length*2,records:records.length,recordRecoveries:records.length*2,version}));
}finally{if(created)await run(['docker','rm','-f',name]);}
