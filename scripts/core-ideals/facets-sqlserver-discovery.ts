/** Pinned host-only discovery. It does not classify ideal facets. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
import {sqlServerFacetDiscoveryCases} from './facets-sqlserver-discovery-cases';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-facets-sqlserver-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
const observe=process.argv.includes('--observe');let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,stderr||stdout);return {stdout,stderr};}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,text:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],text);
const json=async(text:string)=>{const r=await sql('umf_facets',text);return {value:JSON.parse(r.stdout.split(/\r?\n/).join('').trim()),messages:r.stderr};};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){
  assert.equal((await run(['docker','inspect','--format','{{.State.Running}}',name])).stdout.trim(),'true','SQL Server stopped');
  try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch(error){if(String(error).includes('mutually exclusive'))throw error;if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}
  if(i%20===19)console.log(JSON.stringify({startupAttempts:i+1}));await Bun.sleep(1000);
 }assert.ok(ready,'SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_facets;');
 const ddl=await Bun.file('fixtures/sqlserver/facets.sql').text(),query=await Bun.file('native/sqlserver/catalog-v3.sql').text();
 await sql('umf_facets',ddl);
 const rows=[];
 for(const [index,probe] of sqlServerFacetDiscoveryCases().entries()){
  if(index%20===0)console.log(JSON.stringify({probe:index}));
  const statement=probe.statement.replaceAll("'","''");
  const result=await json(`SET NOCOUNT ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET NUMERIC_ROUNDABORT OFF; DECLARE @value nvarchar(max)=NULL,@error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sys.sp_executesql N'${statement}',N'@out nvarchar(max) OUTPUT',@out=@value OUTPUT; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@value AS value,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
  const actual=result.value;
  if(!observe){assert.equal(actual.error,probe.error,probe.id+': '+JSON.stringify(actual));assert.equal(actual.value,probe.expected,probe.id);}
  rows.push({...probe,actual,messages:result.messages});
 }
 const capture=(await json(query)).value;capture.query=query;capture.facetDiscovery={sourceSql:ddl,context:(await json("SET NOCOUNT ON; SELECT compatibility_level,collation_name FROM sys.databases WHERE database_id=DB_ID() FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;")).value};assert.equal(capture.serverVersion,'16.0.4295.3');
 const sourceText=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(sourceText,{id:'sqlserver-facets-discovery'});
 for(const format of ['json','yaml'] as const)assert.deepEqual(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(document,format),format))),capture);
 const paths=['scripts/core-ideals/facets-sqlserver-discovery.ts','scripts/core-ideals/facets-sqlserver-discovery-cases.ts','fixtures/sqlserver/facets.sql','native/sqlserver/catalog-v3.sql'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 const result={scope:'SQL Server 2022 16.0.4295.3 native facet discovery and catalog-tree recovery; no public facet binding, ideal admission or original source-text recovery claim',image,serverVersion:capture.serverVersion,observational:observe,cases:rows,sourceText,columns:getSqlServerColumnMetadata(document).length,serializationRecoveries:2,sha256};
 await Bun.write(observe?'.cache/facets-sqlserver-observations.json':'fixtures/validation/facets-sqlserver-discovery-native.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,rejections:rows.filter(r=>r.actual.error!==0).length,columns:result.columns,serializationRecoveries:2,observational:observe}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
