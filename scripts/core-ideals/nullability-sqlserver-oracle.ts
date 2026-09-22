import {createHash} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-nullability-sqlserver-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
const cases:[string,string,number,number|null][]=[
 ['nullable-null','INSERT INTO availability.plain VALUES(NULL); SELECT @out=value FROM availability.plain;',0,null],
 ['required-null','INSERT INTO availability.required VALUES(NULL);',515,null],
 ['required-omitted-default','INSERT INTO availability.required DEFAULT VALUES; SELECT @out=value FROM availability.required;',0,7],
 ['default-does-not-replace-null','INSERT INTO availability.required VALUES(NULL);',515,null],
 ['check-unknown-allows-null','INSERT INTO availability.positive VALUES(NULL); SELECT @out=value FROM availability.positive;',0,null],
 ['check-false-rejects-negative','INSERT INTO availability.positive VALUES(-1);',547,null],
 ['check-is-not-null-rejects','INSERT INTO availability.checked_required VALUES(NULL);',547,null],
 ['untrusted-existing-null','SELECT @out=value FROM availability.untrusted;',0,null],
 ['untrusted-new-null-rejects','INSERT INTO availability.untrusted VALUES(NULL);',547,null],
 ['disabled-check-allows-null','INSERT INTO availability.disabled VALUES(NULL); SELECT @out=value FROM availability.disabled;',0,null],
 ['isnull-computed-value','INSERT INTO availability.computed(input) VALUES(NULL); SELECT @out=via_isnull FROM availability.computed;',0,7],
 ['coalesce-computed-value','SELECT @out=via_coalesce FROM availability.computed;',0,7],
 ['computed-explicit-write-rejects','INSERT INTO availability.computed(via_isnull) VALUES(NULL);',271,null],
 ['identity-omitted','INSERT INTO availability.identity_value(other) VALUES(NULL); SELECT @out=value FROM availability.identity_value;',0,1],
 ['identity-explicit-null','INSERT INTO availability.identity_value(value) VALUES(NULL);',339,null],
 ['sparse-null','INSERT INTO availability.sparse_value(value) VALUES(NULL); SELECT @out=value FROM availability.sparse_value;',0,null],
 ['rowversion-omitted','INSERT INTO availability.version_value(other) VALUES(NULL); SELECT @out=DATALENGTH(value) FROM availability.version_value;',0,8],
 ['rowversion-explicit-null-generates','INSERT INTO availability.version_value(value) VALUES(NULL); SELECT @out=COUNT(DISTINCT value) FROM availability.version_value;',0,2],
 ['rowversion-explicit-bytes-rejected','INSERT INTO availability.version_value(value) VALUES(0x0000000000000001);',273,null],
 ['alias-inherited-required','INSERT INTO availability.alias_required VALUES(NULL);',515,null],
 ['alias-explicit-null-override','INSERT INTO availability.alias_override VALUES(NULL); SELECT @out=value FROM availability.alias_override;',0,null],
 ['unique-first-null','INSERT INTO availability.unique_value VALUES(NULL); SELECT @out=value FROM availability.unique_value;',0,null],
 ['unique-second-null','INSERT INTO availability.unique_value VALUES(NULL);',2627,null],
 ['outer-join-null','SELECT @out=value FROM availability.outer_null;',0,null],
];
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){
  if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped: '+await run(['docker','logs','--tail','25',name]));
  try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch(error){if(String(error).includes('mutually exclusive'))throw error;if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}
  if(i%20===19)console.log('Waiting for native SQL Server startup: '+(i+1)+' attempts');await Bun.sleep(1000);
 }
 if(!ready)throw Error('SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_availability;');
 const ddl=await Bun.file('fixtures/sqlserver/nullability.sql').text(),query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),availabilityQuery=await Bun.file('native/sqlserver/nullability.sql').text();
 await sql('umf_availability',ddl);
 const json=async(text:string)=>JSON.parse((await sql('umf_availability',text)).split(/\r?\n/).join('').trim());
 const rows=[];
 for(const [id,statement,error,value] of cases){
  const escaped=statement.replaceAll("'","''");
  const actual=await json(`SET NOCOUNT ON; DECLARE @value int=NULL,@error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sp_executesql N'${escaped}',N'@out int OUTPUT',@out=@value OUTPUT; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@value AS value,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
  if(actual.error!==error||actual.value!==value)throw Error(id+': '+JSON.stringify(actual));rows.push({id,statement,...actual});
 }
 const capture=await json(query);capture.query=query;
 if(capture.serverVersion!=='16.0.4295.3')throw Error('Unqualified server version');
 capture.availabilityEvidence={sourceSql:ddl,query:availabilityQuery,...await json(availabilityQuery)};
 const source=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(source,{id:'nullability-discovery'});
 for(const format of ['json','yaml'] as const)if(JSON.stringify(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(document,format),format))))!==JSON.stringify(capture))throw Error('Native capture tree changed');
 const columns=getSqlServerColumnMetadata(document);
 const computed=capture.tables.find((t:any)=>t.name==='computed');
 if(computed.columns.find((c:any)=>c.name==='via_isnull').is_nullable!==false||computed.columns.find((c:any)=>c.name==='via_coalesce').is_nullable!==true)throw Error('Computed nullability differs from qualified expectation');
 if(!capture.tables.find((t:any)=>t.name==='untrusted')?.checks[0]?.is_not_trusted||!capture.tables.find((t:any)=>t.name==='disabled')?.checks[0]?.is_disabled)throw Error('Constraint state lost');
 const paths=['scripts/core-ideals/nullability-sqlserver-oracle.ts','fixtures/sqlserver/nullability.sql','native/sqlserver/catalog-v3.sql','native/sqlserver/nullability.sql'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-sqlserver-native.json',JSON.stringify({scope:'SQL Server 16.0.4295.3 native availability discovery and native catalog/sidecar tree preservation; no ideal binding or source-text recovery claim',image,serverVersion:capture.serverVersion,cases:rows,nativeSource:source,columns:columns.length,serializationRecoveries:2,fingerprints},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,rejections:rows.filter(r=>r.error!==0).length,columns:columns.length,serializationRecoveries:2}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
