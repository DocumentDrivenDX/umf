import {createHash} from 'node:crypto';
import {sqlserverNullabilityProjectionCases} from './nullability-sqlserver-projection-cases';
import {projectNullabilityToSqlServer,recoverNullabilityFromSqlServer} from '../../src/core-ideals/nullability-sqlserver-projection';
import {classifySqlServerNullability,recoverSqlServerNullabilitySource} from '../../src/core-ideals/nullability-sqlserver';
import {importSqlServerCatalog,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {upgradeNullabilityEnvelope} from '../../src/model/nullability-transition';
import {classifySqlServerField} from '../../src/core-ideals/sqlserver-field';
import {sqlServerIdentifier as identifier,sqlServerLiteral as literal} from '../../src/core-ideals/sqlserver-syntax';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-nullability-down-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){
  if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped: '+await run(['docker','logs','--tail','25',name]));
  try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch(error){if(String(error).includes('mutually exclusive'))throw error;if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}
  if(i%20===19)console.log('Waiting for native SQL Server startup: '+(i+1)+' attempts');await Bun.sleep(1000);
 }
 if(!ready)throw Error('SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_availability;');
 await sql('umf_availability','CREATE SCHEMA availability;\nGO\nCREATE TABLE dbo.sentinel(id int);');
 const json=async(text:string)=>JSON.parse((await sql('umf_availability',text)).split(/\r?\n/).join('').trim());
 const settings={nullable:'SET ANSI_NULL_DFLT_ON ON;',required:'SET ANSI_NULL_DFLT_OFF ON;'};
 const present:Record<string,string>={bit:'1',tinyint:'1',smallint:'1',int:'1',bigint:'1','decimal(38,9)':'1.25',real:'1.25','float(53)':'1.25','nvarchar(max)':"N'雪'",'varbinary(max)':'0x00',date:"'2000-01-01'",'time(7)':"'12:00:00'",'datetime2(7)':"'2000-01-01T12:00:00'",'datetimeoffset(7)':"'2000-01-01T12:00:00+00:00'"};
 const ids:Record<string,number>={bit:104,tinyint:48,smallint:52,int:56,bigint:127,'decimal(38,9)':106,real:59,'float(53)':62,'nvarchar(max)':231,'varbinary(max)':165,date:40,'time(7)':41,'datetime2(7)':42,'datetimeoffset(7)':43};
 const rows=[];let executed=0,blocked=0,idealRecoveries=0;
 const captureProbe=(statement:string,variable:string)=>`BEGIN TRY EXEC(${literal(statement)}); END TRY BEGIN CATCH SET ${variable}=ERROR_NUMBER(); END CATCH;`;
 for(const c of sqlserverNullabilityProjectionCases()){
  const result=projectNullabilityToSqlServer(c.author,c.request),trials:Array<{setting:string;nullError:number;omittedError:number;presentError:number;is_nullable:boolean;system_type_id:number;name:string;description:string|null}>=[];
  if(result.status!==c.status)throw Error('Projection policy '+c.id);
  if(!result.nativeSql){if(result.target)throw Error('Partial target');blocked++;rows.push({...c,result,trials});continue;}
  const table=identifier(c.request.namespace)+'.'+identifier(c.request.tableName);
  for(const [setting,setup] of Object.entries(settings)){
   if(setting==='required')await sql('umf_availability','DROP TABLE '+table+';');
   const observed=await json(`SET NOCOUNT ON; ${setup}\n${result.nativeSql}\nDECLARE @nullError int=0,@omittedError int=0,@presentError int=0;
    ${captureProbe('INSERT INTO '+table+' VALUES(NULL);','@nullError')}
    ${captureProbe('INSERT INTO '+table+' DEFAULT VALUES;','@omittedError')}
    ${captureProbe('INSERT INTO '+table+' VALUES('+present[c.nativeType]+');','@presentError')}
    SELECT @nullError AS nullError,@omittedError AS omittedError,@presentError AS presentError,c.is_nullable,c.system_type_id,c.name,CONVERT(nvarchar(max),ep.value) AS description
    FROM sys.columns c LEFT JOIN sys.extended_properties ep ON ep.class=1 AND ep.major_id=c.object_id AND ep.minor_id=c.column_id AND ep.name=N'MS_Description'
    WHERE c.object_id=OBJECT_ID(${literal(table)}) FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
   const expected=c.expectedNotNull?515:0;
   if(observed.nullError!==expected||observed.omittedError!==expected||observed.presentError!==0||observed.is_nullable!==!c.expectedNotNull||observed.system_type_id!==ids[c.nativeType]||observed.name!==c.request.columnName)throw Error('Native behavior '+c.id+': '+JSON.stringify(observed));
   if(observed.description!==(c.variant==='long-description'?null:c.author.target.modules[0]!.elements[0]!.description))throw Error('Comment changed '+c.id);
   trials.push({setting,...observed});executed++;
  }
  if(JSON.stringify(recoverNullabilityFromSqlServer(result,result.nativeSql))!==JSON.stringify(c.author.target))throw Error('Ideal recovery');idealRecoveries++;
  rows.push({...c,result,trials});
 }
 const controls=[];
 for(const [setting,setup] of Object.entries(settings)){
  const name='ambient_'+setting;
  const observed=await json(`SET NOCOUNT ON; ${setup} CREATE TABLE availability.${name}(value int); SELECT is_nullable FROM sys.columns WHERE object_id=OBJECT_ID(N'availability.${name}') FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`);
  if(observed.is_nullable!==(setting==='nullable'))throw Error('Ambient control did not differ');controls.push({setting,...observed});
 }
 if((await sql('umf_availability',"SET NOCOUNT ON; SELECT CASE WHEN OBJECT_ID(N'dbo.sentinel') IS NOT NULL THEN 'safe' ELSE 'lost' END;")).trim()!=='safe')throw Error('Identifier escaped');
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),availabilityQuery=await Bun.file('native/sqlserver/nullability.sql').text();
 const capture=await json(query);capture.query=query;if(capture.serverVersion!=='16.0.4295.3')throw Error('Wrong native version');
 capture.availabilityEvidence={query:availabilityQuery,sourceSql:rows.filter(r=>r.result.nativeSql).map(r=>r.result.nativeSql).join('\n'),...await json(availabilityQuery)};
 const nativeSource=JSON.stringify(capture),source=upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'native-nullability'})).target,columns=getSqlServerColumnMetadata(source);
 let classified=0,nativeRecoveries=0;const observations=[];
 for(const row of rows){
  const column=columns.find(c=>c.table.schema==='availability'&&c.table.name===row.request.tableName);
  if(row.result.status==='blocked'){if(column)throw Error('Blocked table exists');continue;}
  if(!column)throw Error('Missing native table');
  const field=classifySqlServerField(source,{column:column.path,nativeSource,mode:'strict'});
  const observed=classifySqlServerNullability(upgradeNullabilityEnvelope(field.target!).target,{column:column.path,nativeSource,mode:'strict',scope:'stored-relation',carrier:'sql-null'});
  if(observed.status!=='classified'||observed.mapping.nullability!==(row.expectedNotNull?'required':'absent-allowed'))throw Error('Native availability differs');
  if(recoverSqlServerNullabilitySource(observed,observed.target!)!==nativeSource)throw Error('Native source recovery');
  classified++;nativeRecoveries++;observations.push({id:row.id,authored:row.label,observed:observed.mapping.nullability,origin:observed.mapping.origin});
 }
 const paths=['scripts/core-ideals/nullability-sqlserver-projection-oracle.ts','scripts/core-ideals/nullability-sqlserver-projection-cases.ts','src/core-ideals/nullability-sqlserver-projection.ts','src/core-ideals/nullability-sqlserver.ts','spec/core/nullability-sqlserver-projection.schema.json','native/sqlserver/catalog-v3.sql','native/sqlserver/nullability.sql'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-sqlserver-projection-native.json',JSON.stringify({scope:'SQL Server 16.0.4295.3 authored single-column availability DDL under opposing ANSI null defaults; native probes, retained ideal recovery and catalog reclassification; no value-domain equivalence',image,serverVersion:capture.serverVersion,executed,blocked,idealRecoveries,classified,nativeRecoveries,controls,observations,rows,fingerprints},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,executed,blocked,idealRecoveries,classified,nativeRecoveries,ambientControls:controls.length}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
