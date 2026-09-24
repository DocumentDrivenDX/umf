import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerConstraintMetadata,readDocument,writeDocument} from '../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-sqlserver-constraints-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false;
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec(['/opt/mssql-tools18/bin/sqlcmd','-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
const json=(s:string)=>JSON.parse(s.split(/\r?\n/).join('').trim());
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{}if(i%20===19)console.log('Waiting for SQL Server: '+(i+1));await Bun.sleep(1000);}if(!ready)throw Error('SQL Server startup timeout');
 await sql('master','CREATE DATABASE umf_source; CREATE DATABASE umf_replayed; CREATE DATABASE umf_empty;');
 const ddl=await Bun.file('fixtures/sqlserver/constraints.sql').text(),query=await Bun.file('native/sqlserver/catalog-v2.sql').text();for(const db of ['umf_source','umf_replayed'])await sql(db,ddl);
 const empty=json(await sql('umf_empty',query));empty.query=query;if(JSON.stringify(empty.tables)!=='[]'||getSqlServerConstraintMetadata(importSqlServerCatalog(JSON.stringify(empty),{id:'empty'})).tables.length)throw Error('Empty database observation differs');await Bun.write('fixtures/sqlserver/constraints-empty.json',JSON.stringify(empty,null,2)+'\n');
 const captures=[];for(const db of ['umf_source','umf_replayed']){const c=json(await sql(db,query));c.query=query;captures.push(c);}if(JSON.stringify(captures[0])!==JSON.stringify(captures[1]))throw Error('Replayed catalog differs');
 const capture=captures[0],source=JSON.stringify(capture,null,2)+'\n',doc=importSqlServerCatalog(source,{id:'sqlserver-constraints'}),view=getSqlServerConstraintMetadata(doc);
 for(const format of ['json','yaml'] as const)if(JSON.stringify(json(exportSqlServerCatalog(readDocument(writeDocument(doc,format),format))))!==JSON.stringify(capture))throw Error('UMF recovery differs');
 const behaviors=[];
 for(const db of ['umf_source','umf_replayed']){
  await sql(db,'SET NOCOUNT ON; INSERT INTO sales.Parent VALUES(1,2,N\'one\'); INSERT INTO sales.Child VALUES(1,2,1,0,1); UPDATE sales.Parent SET a=3 WHERE a=1;');
  const update=json(await sql(db,'SET NOCOUNT ON; SELECT parent_a,parent_b FROM sales.Child FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;'));if(update.parent_a!==3||update.parent_b!==2)throw Error('Cascade update differs');
  const rejects=["INSERT INTO sales.Child VALUES(2,99,99,0,1);","INSERT INTO sales.Child VALUES(2,NULL,NULL,-1,1);","INSERT INTO sales.Child VALUES(2,NULL,NULL,0,-1);","INSERT INTO sales.Parent VALUES(9,9,N'one');","INSERT INTO sales.Untrusted VALUES(1,N'absent');"];
  for(const command of rejects){let rejected=false;try{await sql(db,'SET NOCOUNT ON; '+command);}catch(error){if(!/Msg (547|2627),/.test(String(error)))throw error;rejected=true;}if(!rejected)throw Error('Expected constraint rejection');}
  // Disabled check permits negative id; CHECK allows SQL UNKNOWN for qty=NULL.
  await sql(db,'SET NOCOUNT ON; INSERT INTO sales.Child VALUES(-1,NULL,NULL,NULL,1); DELETE FROM sales.Parent WHERE a=3;');
  const remaining=json(await sql(db,'SET NOCOUNT ON; SELECT id FROM sales.Child FOR JSON PATH;'));if(JSON.stringify(remaining)!==JSON.stringify([{id:-1}]))throw Error('Delete cascade or disabled check differs');
  behaviors.push({database:db,cascadeUpdate:update,cascadeDelete:true,rejections:rejects.length,disabledCheckAllowsNegativeId:true,checkAllowsNull:true,untrustedConstraintStillEnforcesNewRows:true});
 }
 await Bun.write('fixtures/sqlserver/constraints-catalog.json',source);await Bun.write('fixtures/sqlserver/constraint-metadata.json',JSON.stringify(view,null,2)+'\n');
 const evidence={image,version:capture.serverVersion,tables:view.tables.length,nativeDdlReplay:true,emptyDatabase:true,umfRecoveries:2,behaviors,querySha256:new Bun.CryptoHasher('sha256').update(query).digest('hex'),ddlSha256:new Bun.CryptoHasher('sha256').update(ddl).digest('hex'),scope:'Named constraints in authored DDL; no arbitrary reconstruction or full catalog claim'};
 await Bun.write('fixtures/sqlserver/constraints-oracle.json',JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
