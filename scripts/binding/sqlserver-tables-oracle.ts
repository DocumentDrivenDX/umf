import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {exportSqlServerCatalog,importSqlServerCatalog,projectBindingTablesToSqlServer,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/sqlserver-tables/case.json').json();
const report=projectBindingTablesToSqlServer(fixture.logical as Document,fixture.binding as Document,fixture.policy,'report');
assert.equal(report.status,'reported');assert.equal(report.residuals.length,10);
await Bun.write('fixtures/binding/sqlserver-tables/generated.sql',report.candidate!);

const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090';
const name='umf-binding-tables-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false;
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec(['/opt/mssql-tools18/bin/sqlcmd','-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
let observed:unknown,capturedVersion:string|undefined;
try{
  await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
  let ready=false;for(let i=0;i<120;i++){if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{}await Bun.sleep(1000);}if(!ready)throw Error('SQL Server startup timeout');
  await sql('master','CREATE DATABASE umf_binding;');
  await sql('umf_binding',fixture.partitionSetup);
  await sql('umf_binding',report.candidate!);
  const query=await Bun.file('native/sqlserver/catalog-v2.sql').text();
  const nativeSource=(await sql('umf_binding',query)).split(/\r?\n/).join('').trim()+'\n';
  const captured=JSON.parse(nativeSource);capturedVersion=captured.serverVersion;
  const native=importSqlServerCatalog(nativeSource,{id:'sqlserver-tables-recapture'});
  await Bun.write('fixtures/binding/sqlserver-tables/catalog.json',nativeSource);
  assert.deepEqual(JSON.parse(exportSqlServerCatalog(native)),captured);
  const retained=projectBindingTablesToSqlServer(fixture.logical as Document,fixture.binding as Document,fixture.policy,'report',nativeSource);
  assert.equal(retained.nativeSource,nativeSource);
  assert.deepEqual(JSON.parse(exportSqlServerCatalog(retained.nativeArchive!)),captured);
  const output=await sql('umf_binding',"SET NOCOUNT ON; SELECT SCHEMA_NAME(t.schema_id) AS [schema],t.name,ps.name AS partition_scheme,c.name AS partition_column FROM sys.tables t LEFT JOIN sys.indexes i ON i.object_id=t.object_id AND i.index_id IN (0,1) LEFT JOIN sys.partition_schemes ps ON ps.data_space_id=i.data_space_id LEFT JOIN sys.index_columns ic ON ic.object_id=t.object_id AND ic.index_id=i.index_id AND ic.partition_ordinal=1 LEFT JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=ic.column_id WHERE SCHEMA_NAME(t.schema_id)=N'sales' ORDER BY t.name FOR JSON PATH,INCLUDE_NULL_VALUES;");
  observed=JSON.parse(output.split(/\r?\n/).join('').trim());
  assert.deepEqual((observed as any[]).map(x=>x.name),['Items','Shipments']);
  assert.equal((observed as any[]).find(x=>x.name==='Shipments')?.partition_scheme,'ps_umf_ship');
  assert.equal((observed as any[]).find(x=>x.name==='Shipments')?.partition_column,'part');
  const items=captured.tables.find((t:any)=>t.schema==='sales'&&t.name==='Items');
  assert.deepEqual(items.columns.map((c:any)=>[c.name,c.base_type_name,c.is_nullable]),[['id','int',false],['email','nvarchar',true],['payload','nvarchar',true]]);
  assert.equal(items.columns.find((c:any)=>c.name==='payload')?.max_length,-1);
  assert.equal(items.checks.some((c:any)=>c.name==='CK_Items_payload_json'&&/isjson/i.test(c.definition)&&c.is_disabled===false&&c.is_not_trusted===false),true,JSON.stringify(items.checks));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
const files=['fixtures/binding/sqlserver-tables/case.json','fixtures/binding/sqlserver-tables/generated.sql','fixtures/binding/sqlserver-tables/catalog.json','src/projections/binding-sqlserver/tables.ts','native/sqlserver/catalog-v2.sql'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/binding/sqlserver-tables/oracle.json',JSON.stringify({scope:'Isolated SQL Server 2022 execution of authored table, nullable columns, JSON text carrier and partition-scheme placement; document path semantics remain residual',image,serverVersion:capturedVersion,observed,nativeRecovery:{retainedCatalogBytes:true,adapterExport:'structurally equal JSON; escaped slash spelling is normalized'},residuals:report.residuals,sha256},null,2)+'\n');
console.log(JSON.stringify({tables:(observed as any[]).length,residuals:report.residuals.length}));
