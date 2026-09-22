import {createHash} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-cardinality-sqlserver-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
const cases:[string,string,number,string|null][]=[];
const values:[string,string|null][]=[['array','[3,1,3]'],['empty-array','[]'],['nested-array','[[1],[],[2,3]]'],['null-item','[1,null,3]'],['mixed-items','[1,"x",{},true]'],['object','{"x":1}'],['duplicate-key',' {"x":1,"x":2} '],['empty-object','{}'],['number','7'],['boolean','true'],['json-null','null'],['invalid','{'],['sql-null',null]];
for(const table of ['plain','json_value','array_value','object_value','untrusted','disabled'])for(const [id,value] of values){
 const array=['array','empty-array','nested-array','null-item','mixed-items'].includes(id),object=['object','duplicate-key','empty-object'].includes(id);
 const accepts=value===null||['plain','disabled'].includes(table)||table==='json_value'&&(array||object)||['array_value','untrusted'].includes(table)&&array||table==='object_value'&&object;
 const literal=value===null?'NULL':"N'"+value.replaceAll("'","''")+"'";
 cases.push([table+'-'+id,'INSERT INTO cardinality.'+table+' VALUES('+literal+'); SET @out='+literal+';',accepts?0:547,accepts?value:null]);
}
cases.push(['untrusted-existing-scalar',"SELECT @out=value FROM cardinality.untrusted WHERE value=N'7';",0,'7']);
cases.push(['duplicate-json-value-first',`SELECT @out=JSON_VALUE(N'{"x":1,"x":2}','$.x');`,0,'1']);
cases.push(['duplicate-openjson-count',`SELECT @out=CONVERT(nvarchar(max),COUNT(*)) FROM OPENJSON(N'{"x":1,"x":2}');`,0,'2']);
cases.push(['scalar-bigint-max',`INSERT INTO cardinality.scalar_value VALUES(9223372036854775807); SELECT @out=CONVERT(nvarchar(max),value) FROM cardinality.scalar_value;`,0,'9223372036854775807']);
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){
  if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped: '+await run(['docker','logs','--tail','25',name]));
  try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch(error){if(String(error).includes('mutually exclusive'))throw error;if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}
  if(i%20===19)console.log('Waiting for native SQL Server startup: '+(i+1)+' attempts');await Bun.sleep(1000);
 }
 if(!ready)throw Error('SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_cardinality;');
 const ddl=await Bun.file('fixtures/sqlserver/cardinality.sql').text(),query=await Bun.file('native/sqlserver/catalog-v3.sql').text();
 await sql('umf_cardinality',ddl);
 const json=async(text:string)=>JSON.parse((await sql('umf_cardinality',text)).split(/\r?\n/).join('').trim());
 const rows=[];
 for(const [id,statement,error,value] of cases){
  const escaped=statement.replaceAll("'","''");
  const actual=await json(`SET NOCOUNT ON; DECLARE @value nvarchar(max)=NULL,@error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sp_executesql N'${escaped}',N'@out nvarchar(max) OUTPUT',@out=@value OUTPUT; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@value AS value,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
  if(actual.error!==error||actual.value!==value)throw Error(id+': '+JSON.stringify(actual));rows.push({id,statement,...actual});
 }
 const capture=await json(query);capture.query=query;
 if(capture.serverVersion!=='16.0.4295.3')throw Error('Unqualified server version');
 capture.cardinalityEvidence={sourceSql:ddl,profile:"sqlserver-2022-cardinality-discovery-v1"};
 const source=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(source,{id:'cardinality-discovery'});
 for(const format of ['json','yaml'] as const)if(JSON.stringify(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(document,format),format))))!==JSON.stringify(capture))throw Error('Native capture tree changed');
 const columns=getSqlServerColumnMetadata(document);
 if(!capture.tables.find((t:any)=>t.name==='untrusted')?.checks[0]?.is_not_trusted||!capture.tables.find((t:any)=>t.name==='disabled')?.checks[0]?.is_disabled)throw Error('Constraint state lost');
 const paths=['scripts/core-ideals/cardinality-sqlserver-profile-oracle.ts','fixtures/sqlserver/cardinality.sql','native/sqlserver/catalog-v3.sql'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-sqlserver-profile-native.json',JSON.stringify({scope:'SQL Server 16.0.4295.3 Cardinality discovery: explicit JSON shape, trust/disabled state and duplicate-key boundaries; no ideal binding acceptance',image,serverVersion:capture.serverVersion,sources:['https://learn.microsoft.com/en-us/sql/t-sql/functions/isjson-transact-sql?view=sql-server-ver16'],cases:rows,nativeSource:source,columns:columns.length,serializationRecoveries:2,fingerprints},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,rejections:rows.filter(r=>r.error!==0).length,columns:columns.length,serializationRecoveries:2}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
