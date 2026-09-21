import {upgradeFieldEnvelope,classifySqlServerField,recoverSqlServerFieldCapture,readJsonValue,writeJsonValue,copyJson} from '../../src';
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
 const ddl=await Bun.file('fixtures/sqlserver/schema.sql').text(),query=await Bun.file('native/sqlserver/catalog.sql').text();
 for(const db of ['umf_source','umf_replayed'])await sql(db,ddl);
 const capture=JSON.parse((await sql('umf_source',query)).split(/\r?\n/).join('').trim());capture.query=query;
 const second=JSON.parse((await sql('umf_replayed',query)).split(/\r?\n/).join('').trim());second.query=query;
 if(JSON.stringify(capture)!==JSON.stringify(second))throw Error('Replayed native DDL catalog differs');
 const source=JSON.stringify(capture,null,2)+'\n',doc=importSqlServerCatalog(source,{id:'live-sqlserver'}),view=getSqlServerColumnMetadata(doc);
 for(const format of ['json','yaml'] as const)if(JSON.stringify(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(doc,format),format))))!==JSON.stringify(capture))throw Error('Catalog recovery differs');
 const version=view.filter(c=>c.element.name==='version_stamp');if(version.length!==2||version.some(c=>c.element.scalarType!=='binary'))throw Error('Rowversion classification differs');
 const behavior=JSON.parse((await sql('umf_source',`SET NOCOUNT ON; INSERT INTO sales.Types(flag,ordinary,amount) VALUES (1,5,0); DECLARE @old binary(8)=(SELECT version_stamp FROM sales.Types); UPDATE sales.Types SET ordinary=6; SELECT CONVERT(nvarchar(128),id) AS exactIdentity,computed,CONVERT(bit,CASE WHEN version_stamp<>@old THEN 1 ELSE 0 END) AS rowversionChanged,DATALENGTH(version_stamp) AS rowversionBytes FROM sales.Types FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;`)).split(/\r?\n/).join('').trim());
 if(behavior.exactIdentity!=='9007199254740993'||behavior.computed!==7||!behavior.rowversionChanged||behavior.rowversionBytes!==8)throw Error('Native behavior differs');
 const fields=upgradeFieldEnvelope(doc).target,rows=[];
 for(const column of view){const result=classifySqlServerField(fields,{column:column.path,nativeSource:source,mode:'strict'});if(!result.target)throw Error('Native field blocked');
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;if(recoverSqlServerFieldCapture(receipt,receipt.target!)!==source)throw Error('Native capture lost');}
  rows.push({path:column.path,name:column.element.name,table:column.table,scalarType:column.element.scalarType??null});
 }
 const independent=JSON.parse((await sql('umf_source',"SET NOCOUNT ON; SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name AS [table],c.name AS [column] FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.is_ms_shipped=0 ORDER BY SCHEMA_NAME(t.schema_id),t.name,c.column_id FOR JSON PATH;")).split(/\r?\n/).join('').trim());
 if(JSON.stringify(rows.map(r=>({schema:r.table.schema,table:r.table.name,column:r.name})))!==JSON.stringify(independent))throw Error('Independent native membership differs');
 await Bun.write('fixtures/validation/field-sqlserver-native.json',JSON.stringify({image,version:capture.serverVersion,nativeSource:source,rows,recoveries:rows.length*2,scope:'Captured native member roles; permission-limited, no ideal identity/constraint inference'},null,2)+'\n');console.log(JSON.stringify({columns:rows.length,recoveries:rows.length*2,version:capture.serverVersion}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
