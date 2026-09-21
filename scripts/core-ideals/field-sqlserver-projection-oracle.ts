import {sqlServerFieldCases} from './field-sqlserver-projection-cases';
import {projectFieldToSqlServer,recoverFieldFromSqlServer} from '../../src';
import {classifySqlServerRecord,recoverSqlServerRecordCapture,upgradeFieldEnvelope,classifySqlServerField,recoverSqlServerFieldCapture,readJsonValue,writeJsonValue,copyJson} from '../../src';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-sqlserver-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
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
 await sql('master','CREATE DATABASE umf_source; CREATE DATABASE umf_replayed;');
 await sql('umf_source','CREATE SCHEMA sales;');const rows=[];
 for(const c of sqlServerFieldCases()){const result=projectFieldToSqlServer(c.author,c.request);if(!result.target)throw Error('Projection blocked');await sql('umf_source',result.nativeSql!);
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;if(JSON.stringify(recoverFieldFromSqlServer(receipt,receipt.nativeSql!))!==JSON.stringify(c.author.target))throw Error('Ideal loss');}
  rows.push({...c,result});
 }
 const query=await Bun.file('native/sqlserver/catalog.sql').text(),capture=JSON.parse((await sql('umf_source',query)).split(/\r?\n/).join('').trim());capture.query=query;
 if(capture.serverVersion!=='16.0.4295.3')throw Error('Wrong native build');
 for(const row of rows){const table=capture.tables.find((t:any)=>t.schema==='sales'&&t.name===row.request.tableName),column=table?.columns[0];if(table?.columns.length!==1||column.name!==row.request.columnName||column.system_type_id!==row.expectedTypeId||!column.is_nullable||column.is_identity||column.is_computed||column.description!==row.author.target.modules[0]!.elements[0]!.description)throw Error('Native column behavior differs');}
 const nativeSource=JSON.stringify(capture,null,2)+'\n',source=upgradeFieldEnvelope(importSqlServerCatalog(nativeSource,{id:'generated'})).target;
 for(const c of getSqlServerColumnMetadata(source)){const classified=classifySqlServerField(source,{column:c.path,nativeSource,mode:'strict'});if(!classified.target||recoverSqlServerFieldCapture(classified,classified.target)!==nativeSource)throw Error('Native-only recovery');}
 await Bun.write('fixtures/validation/field-sqlserver-projection-native.json',JSON.stringify({image,version:capture.serverVersion,rows,nativeSource,scope:'Explicit SQL Server Field carriers, names, descriptions, nullable storage and report-based ideal recovery'},null,2)+'\n');console.log(JSON.stringify({projections:rows.length,idealRecoveries:rows.length*2,nativeClassifications:rows.length}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
