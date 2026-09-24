/** Host-only Key discovery; no authored identity or complete binding claim. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerIndexMetadata,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';
import {readDocument,writeDocument} from '../../src';
import {sqlServerKeyEncodingCases} from './key-sqlserver-encoding-cases';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-key-encoding-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
const observe=process.argv.includes('--observe');let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,stderr||stdout);return {stdout,stderr};}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,text:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],text);
const json=async(text:string)=>{const r=await sql('umf_keys',text);return {value:JSON.parse(r.stdout.split(/\r?\n/).join('').trim()),messages:r.stderr};};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){assert.equal((await run(['docker','inspect','--format','{{.State.Running}}',name])).stdout.trim(),'true');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}if(i%20===19)console.log(JSON.stringify({startupAttempts:i+1}));await Bun.sleep(1000);}assert.ok(ready,'SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_keys;');
 const ddl=await Bun.file('fixtures/sqlserver/key-encodings.sql').text(),query=await Bun.file('native/sqlserver/catalog-v3.sql').text();await sql('umf_keys',ddl);
 const rows=[];
 for(const probe of sqlServerKeyEncodingCases()){
  const statement=probe.statement.replaceAll("'","''"),result=await json(`SET NOCOUNT ON; SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET NUMERIC_ROUNDABORT OFF; DECLARE @value nvarchar(max)=NULL,@error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sys.sp_executesql N'${statement}',N'@out nvarchar(max) OUTPUT',@out=@value OUTPUT; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@value AS value,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
  if(!observe){assert.equal(result.value.error,probe.error,probe.id+': '+JSON.stringify(result.value));assert.equal(result.value.value,probe.value,probe.id);}
  rows.push({...probe,actual:result.value,messages:result.messages});
 }
 const capture=(await json(query)).value;capture.query=query;capture.keyEncodingDiscovery={sourceSql:ddl,context:(await json('SET NOCOUNT ON; SELECT compatibility_level,collation_name FROM sys.databases WHERE database_id=DB_ID() FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;')).value};assert.equal(capture.serverVersion,'16.0.4295.3');
 const computed=(await json("SET NOCOUNT ON; SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name AS [table],c.name,c.is_persisted,c.is_nullable,COLUMNPROPERTY(c.object_id,c.name,'IsDeterministic') AS deterministic,COLUMNPROPERTY(c.object_id,c.name,'IsPrecise') AS precise,COLUMNPROPERTY(c.object_id,c.name,'IsIndexable') AS indexable FROM sys.computed_columns c JOIN sys.tables t ON t.object_id=c.object_id ORDER BY t.name,c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES;")).value;
 assert.equal(computed.length,8);for(const c of computed){assert.equal(c.is_persisted,true);assert.equal(c.is_nullable,false);assert.equal(c.deterministic,1);assert.equal(c.precise,1);assert.equal(c.indexable,1);}capture.keyEncodingDiscovery.computed=computed;
 const sourceText=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(sourceText,{id:'sqlserver-keys-discovery'}),indexes=getSqlServerIndexMetadata(document);
 for(const format of ['json','yaml'] as const)assert.deepEqual(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(document,format),format))),capture);
 const paths=['scripts/core-ideals/key-sqlserver-encoding-discovery.ts','scripts/core-ideals/key-sqlserver-encoding-cases.ts','fixtures/sqlserver/key-encodings.sql','native/sqlserver/catalog-v3.sql'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const result={scope:'SQL Server 2022 16.0.4295.3 binary-plus-length computed Key encoding discovery and catalog-tree recovery only; no public authored projection, full binding acceptance or ideal admission claim',image,serverVersion:capture.serverVersion,observational:observe,references:['https://learn.microsoft.com/en-us/sql/relational-databases/indexes/create-unique-indexes?view=sql-server-ver16','https://learn.microsoft.com/en-us/sql/t-sql/statements/alter-table-computed-column-definition-transact-sql?view=sql-server-ver16','https://learn.microsoft.com/en-us/sql/relational-databases/indexes/indexes-on-computed-columns?view=sql-server-ver16'],cases:rows,sourceText,columns:getSqlServerColumnMetadata(document).length,tables:indexes.tables.length,indexes:indexes.tables.reduce((n,t)=>n+t.indexes.length,0),serializationRecoveries:2,sha256};
 await Bun.write(observe?'.cache/key-sqlserver-encoding-observations.json':'fixtures/validation/key-sqlserver-encoding-native.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cases:rows.length,rejections:rows.filter(r=>r.actual.error!==0).length,indexes:result.indexes,observational:observe}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
