import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sqlserverCardinalityProjectionCases} from './cardinality-sqlserver-projection-cases';
import {projectCardinalityToSqlServer,recoverCardinalityFromSqlServer} from '../../src/core-ideals/cardinality-sqlserver-projection';
import {importSqlServerCatalog,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,upgradeFieldEnvelope,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,classifySqlServerCardinality,recoverSqlServerCardinalitySource} from '../../src';
import {sqlServerIdentifier as identifier,sqlServerLiteral as literal} from '../../src/core-ideals/sqlserver-syntax';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-cardinality-down-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
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
 await sql('master','CREATE DATABASE umf_cardinality;');
 await sql('umf_cardinality','CREATE SCHEMA availability;\nGO\nCREATE TABLE dbo.sentinel(id int);');
 const json=async(text:string)=>JSON.parse((await sql('umf_cardinality',text)).split(/\r?\n/).join('').trim());
 const scalarValues:Record<string,string[]>={bit:['0','1'],tinyint:['0','255'],smallint:['-32768','32767'],int:['-2147483648','2147483647'],bigint:['-9223372036854775808','9223372036854775807'],'decimal(38,9)':['1.234567890','99999999999999999999999999999.999999999'],real:['1.0000000000000002','-1.5'],'float(53)':['1.0000000000000002','-1.5'],'nvarchar(max)':["N'雪'","N''"],'varbinary(max)':['0x00ff','0x'],date:["'0001-01-01'","'9999-12-31'"],'time(7)':["'00:00:00'","'23:59:59.9999999'"],'datetime2(7)':["'0001-01-01T00:00:00'","'9999-12-31T23:59:59.9999999'"],'datetimeoffset(7)':["'2026-09-22T12:00:00+14:00'","'2026-09-22T12:00:00-14:00'"]};
 const rows=[];let executed=0,blocked=0,idealRecoveries=0;
 for(const c of sqlserverCardinalityProjectionCases()){
  const result=projectCardinalityToSqlServer(c.author,c.request);
  if(result.status==='blocked'){assert.equal(result.nativeSql,undefined);blocked++;rows.push({...c,result});continue;}
  await sql('umf_cardinality',result.nativeSql!);executed++;
  const table=identifier(c.request.namespace)+'.'+identifier(c.request.tableName);
  const vectors:[string,number][]=c.request.storage==='json-array'?[["N'[3,1,3]'",0],["N'[]'",0],["N'[[1],[],[2,3]]'",0],["N'[1,null,\"x\",{}]'",0],["N'{}'",547],["N'7'",547],['NULL',0]]:c.request.storage==='json-object'?[["N'{\"x\":1}'",0],["N'{\"x\":1,\"x\":2}'",0],["N'[]'",547],["N'null'",547],['NULL',0]]:[...scalarValues[c.request.nativeType]!.map(value=>[value,0] as [string,number]),['NULL',0]];
  let query='SET NOCOUNT ON; ';
  vectors.forEach(([value],i)=>{query+=`DECLARE @e${i} int=0; BEGIN TRY EXEC(${literal('INSERT INTO '+table+' VALUES('+value+');')}); END TRY BEGIN CATCH SET @e${i}=ERROR_NUMBER(); END CATCH; `;});
  query+='SELECT '+vectors.map((_,i)=>`@e${i} AS e${i}`).join(',')+' FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;';
  const actual=await json(query);vectors.forEach(([,expected],i)=>assert.equal(actual['e'+i],expected,table+' '+i));
  assert.deepEqual(recoverCardinalityFromSqlServer(result,result.nativeSql!),c.author.target);idealRecoveries++;
  rows.push({...c,result,probes:vectors.map(([value,error])=>({value,error}))});
 }
 const narrowing=await json('SET NOCOUNT ON; SELECT CASE WHEN CAST(CAST(1.0000000000000002 AS float(53)) AS real)=CAST(1 AS real) AND CAST(1.0000000000000002 AS float(53))<>CAST(1 AS float(53)) THEN 1 ELSE 0 END AS narrowed FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;');
 assert.equal(narrowing.narrowed,1);
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),capture=await json(query);capture.query=query;
 assert.equal(capture.serverVersion,'16.0.4295.3');
 const nativeSource=JSON.stringify(capture),source=upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'emitted'})).target).target).target;
 const observations=[];
 for(const row of rows){
  const column=getSqlServerColumnMetadata(source).find(c=>c.table.name===row.request.tableName);
  if(row.result.status==='blocked'){assert.equal(column,undefined);continue;}assert.ok(column);
  const expectedFamily=row.author.target.modules[0]!.elements[0]!.scalarType;if(row.request.storage==='scalar'&&expectedFamily!==undefined)assert.equal(column.element.scalarType,expectedFamily);
  const check=getSqlServerConstraintMetadata(source).tables.find(t=>t.table.name===column.table.name)!.checks[0];
  const constraint=check?.kind==='object'&&check.members.name?.kind==='string'?check.members.name.value:null;
  const profile=row.request.storage==='scalar'?'native-scalar':row.request.storage;
  const classified=classifySqlServerCardinality(source,{column:column.path,nativeSource,identity:{module:'logical',element:row.request.tableName},constraint,profile,mode:'report'});
  assert.equal(classified.status,'classified');assert.equal(classified.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='json-array'?'array':'map');
  assert.equal(recoverSqlServerCardinalitySource(classified,classified.target!),nativeSource);
  observations.push({table:row.request.tableName,authored:row.author.provenance.cardinality,observed:classified.mapping.cardinality,outcome:classified.mapping.outcome});
 }
 const paths=['scripts/core-ideals/cardinality-sqlserver-projection-oracle.ts','scripts/core-ideals/cardinality-sqlserver-projection-cases.ts','src/core-ideals/cardinality-sqlserver-projection.ts','src/core-ideals/cardinality-sqlserver.ts','spec/core/cardinality-sqlserver-projection.schema.json','native/sqlserver/catalog-v3.sql'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-sqlserver-projection-native.json',JSON.stringify({scope:'SQL Server 16.0.4295.3 explicit scalar/JSON carrier projection, logical reclassification and retained ideal/native recovery; no full binding acceptance or value conversion',image,serverVersion:capture.serverVersion,executed,blocked,idealRecoveries,nativeRecoveries:observations.length,observations,nativeSource,narrowing,scalarCarriers:Object.keys(scalarValues),rows,fingerprints},null,2)+'\n');
 console.log(JSON.stringify({cases:rows.length,executed,blocked,idealRecoveries,nativeRecoveries:observations.length}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
