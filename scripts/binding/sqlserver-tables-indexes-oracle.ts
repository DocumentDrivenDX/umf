import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {exportSqlServerCatalog,importSqlServerCatalog,projectBindingTablesAndIndexesFromPlanToSqlServer,type Document} from '../../src';

const directory='fixtures/binding/sqlserver-tables-indexes';
const fixture=await Bun.file(`${directory}/case.json`).json();
const source=await Bun.file('fixtures/binding/sqlserver-tables/catalog.json').text();
const report=projectBindingTablesAndIndexesFromPlanToSqlServer(fixture.logical as Document,fixture.binding as Document,fixture.policy,'report');
assert.equal(report.status,'reported');assert.equal(report.residuals.length,13);
assert.equal(report.nativeArchive,undefined);
const checked=projectBindingTablesAndIndexesFromPlanToSqlServer(fixture.logical as Document,fixture.binding as Document,fixture.policy,'report',source);
assert.equal(checked.candidate,report.candidate);
assert.equal(checked.nativeSource,source);
assert.deepEqual(JSON.parse(exportSqlServerCatalog(checked.nativeArchive!)),JSON.parse(source));
await Bun.write(`${directory}/generated.sql`,report.candidate!);

const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090';
const name='umf-binding-combined-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
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
  const capturedSource=(await sql('umf_binding',query)).split(/\r?\n/).join('').trim()+'\n';
  const captured=JSON.parse(capturedSource);capturedVersion=captured.serverVersion;
  const native=importSqlServerCatalog(capturedSource,{id:'sqlserver-combined-recapture'});
  await Bun.write(`${directory}/catalog.json`,capturedSource);
  assert.deepEqual(JSON.parse(exportSqlServerCatalog(native)),captured);
  const output=await sql('umf_binding',"SET NOCOUNT ON; SELECT i.name,i.is_unique AS [unique],i.has_filter AS filtered,i.filter_definition AS predicate FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=N'sales' AND t.name=N'Items' AND i.index_id>0 ORDER BY i.name FOR JSON PATH,INCLUDE_NULL_VALUES;");
  const indexes=JSON.parse(output.split(/\r?\n/).join('').trim());
  assert.deepEqual(indexes.map((x:any)=>x.name),['IX_Items_Id','IX_Items_Positive','UX_Items_Email']);
  assert.equal(indexes.find((x:any)=>x.name==='IX_Items_Positive')?.filtered,true);
  assert.equal(indexes.find((x:any)=>x.name==='UX_Items_Email')?.unique,true);
  observed={indexes};
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
const files=[`${directory}/case.json`,`${directory}/generated.sql`,`${directory}/catalog.json`,'fixtures/binding/sqlserver-tables/catalog.json','src/projections/binding-sqlserver/tables-indexes.ts','src/projections/binding-sqlserver/indexes.ts','native/sqlserver/catalog-v2.sql'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write(`${directory}/oracle.json`,JSON.stringify({scope:'Isolated SQL Server 2022 execution of catalog-free DDD-derived tables plus three physical rowstore indexes; other index kinds and relationships remain residual',image,serverVersion:capturedVersion,observed,nativeRecovery:{optionalInputCatalogRetained:true,outputCatalogRetained:true,adapterExport:'structurally equal JSON; escaped slash spelling may normalize'},residuals:report.residuals,sha256},null,2)+'\n');
console.log(JSON.stringify({indexes:(observed as any).indexes.length,residuals:report.residuals.length}));
