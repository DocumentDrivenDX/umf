import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importSqlServerCatalog,projectBindingIndexesToSqlServer,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/sqlserver-indexes/case.json').json();
const nativeSource=await Bun.file(fixture.native).text();
const archive=importSqlServerCatalog(nativeSource,{id:'native-catalog'});
const report=projectBindingIndexesToSqlServer(fixture.logical as Document,fixture.binding as Document,archive,nativeSource,'report');
assert.equal(report.status,'reported');assert.equal(report.residuals.length,5);
assert.equal(report.nativeSource,nativeSource);
await Bun.write('fixtures/binding/sqlserver-indexes/generated.sql',report.candidate!);

const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090';
const name='umf-binding-index-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false;
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec(['/opt/mssql-tools18/bin/sqlcmd','-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
let observed:unknown;
try{
  await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
  let ready=false;for(let i=0;i<120;i++){if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{}await Bun.sleep(1000);}if(!ready)throw Error('SQL Server startup timeout');
  await sql('master','CREATE DATABASE umf_binding;');
  await sql('umf_binding',await Bun.file(fixture.sourceDdl).text());
  await sql('umf_binding',report.candidate!);
  const output=await sql('umf_binding',"SET NOCOUNT ON; SELECT i.name,i.type_desc,i.is_unique,i.has_filter,i.filter_definition FROM sys.indexes i WHERE i.object_id=OBJECT_ID(N'sales.Items') AND i.name LIKE N'umf_%' ORDER BY i.name FOR JSON PATH;");
  const rows=JSON.parse(output.split(/\r?\n/).join('').trim());
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map((r:any)=>r.name),['umf_active_filtered','umf_email_btree','umf_id_unique']);
  assert.equal(rows.find((r:any)=>r.name==='umf_active_filtered')?.has_filter,true);
  assert.equal(rows.find((r:any)=>r.name==='umf_id_unique')?.is_unique,true);
  observed=rows;
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
const files=['fixtures/binding/sqlserver-indexes/case.json',fixture.native,fixture.sourceDdl,'fixtures/binding/sqlserver-indexes/generated.sql','src/projections/binding-sqlserver/indexes.ts'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/binding/sqlserver-indexes/oracle.json',JSON.stringify({scope:'SQL Server 2022 isolated native execution of rowstore, unique and filtered index DDL; no query-plan or performance claim',image,sourceVersion:JSON.parse(nativeSource).serverVersion,observed,residuals:report.residuals,sha256},null,2)+'\n');
console.log(JSON.stringify({created:(observed as any[]).length,residuals:report.residuals.length}));
