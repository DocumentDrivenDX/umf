import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerIndexMetadata,readDocument,writeDocument} from '../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-sqlserver-indexes-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false;
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,query:string)=>exec(['/opt/mssql-tools18/bin/sqlcmd','-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
const json=(s:string)=>JSON.parse(s.split(/\r?\n/).join('').trim());
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{}if(i%20===19)console.log('Waiting for SQL Server: '+(i+1));await Bun.sleep(1000);}if(!ready)throw Error('SQL Server startup timeout');
 await sql('master','CREATE DATABASE umf_source; CREATE DATABASE umf_replayed; CREATE DATABASE umf_empty;');
 const ddl=await Bun.file('fixtures/sqlserver/indexes.sql').text(),query=await Bun.file('native/sqlserver/catalog-v3.sql').text();for(const db of ['umf_source','umf_replayed'])await sql(db,ddl);
 const empty=json(await sql('umf_empty',query));empty.query=query;if(JSON.stringify(empty.tables)!=='[]'||getSqlServerIndexMetadata(importSqlServerCatalog(JSON.stringify(empty),{id:'empty'})).tables.length)throw Error('Empty capture differs');
 const captures=[];for(const db of ['umf_source','umf_replayed']){const c=json(await sql(db,query));c.query=query;captures.push(c);}if(JSON.stringify(captures[0])!==JSON.stringify(captures[1]))throw Error('Replayed catalogs differ');
 const capture=captures[0],source=JSON.stringify(capture,null,2)+'\n',doc=importSqlServerCatalog(source,{id:'sqlserver-indexes'}),view=getSqlServerIndexMetadata(doc);
 for(const format of ['json','yaml'] as const)if(JSON.stringify(json(exportSqlServerCatalog(readDocument(writeDocument(doc,format),format))))!==JSON.stringify(capture))throw Error('UMF recovery differs');
 const behaviors=[];
 for(const db of ['umf_source','umf_replayed']){
  await sql(db,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(1,N'same',0,N'a'),(2,N'same',0,N'b'),(3,N'same',1,N'c'),(4,NULL,1,N'd'),(5,NULL,1,N'e'); INSERT INTO sales.Disabled VALUES(1,7),(2,7); INSERT INTO sales.Analytics VALUES(1,2,N'x'),(1,2,N'x'); INSERT INTO sales.Events VALUES(1,5,N'early'),(1,15,N'middle'),(1,25,N'late');");
  let duplicateRejected=false;try{await sql(db,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(6,N'same',1,N'f');");}catch(error){if(!/Msg (2601|2627),/.test(String(error)))throw error;duplicateRejected=true;}if(!duplicateRejected)throw Error('Filtered unique index did not reject duplicate');
  let enteringFilterRejected=false;try{await sql(db,'SET NOCOUNT ON; UPDATE sales.Items SET active=1 WHERE id=1;');}catch(error){if(!/Msg (2601|2627),/.test(String(error)))throw error;enteringFilterRejected=true;}if(!enteringFilterRejected)throw Error('Update entering filter did not reject duplicate');
  const observations=json(await sql(db,"SET NOCOUNT ON; SELECT (SELECT COUNT(*) FROM sales.Items) AS items,(SELECT COUNT(*) FROM sales.Disabled WHERE code=7) AS disabled_duplicates,(SELECT COUNT(*) FROM sales.Analytics) AS columnstore_rows,(SELECT COUNT(DISTINCT $PARTITION.pf_events(day_id)) FROM sales.Events) AS partitions FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));
  if(JSON.stringify(observations)!==JSON.stringify({items:5,disabled_duplicates:2,columnstore_rows:2,partitions:3}))throw Error('Native row behavior differs');behaviors.push({database:db,filteredDuplicateRejected:duplicateRejected,enteringFilterRejected,nullsOutsideFilterAccepted:true,observations});
 }
 await Bun.write('fixtures/sqlserver/indexes-catalog.json',source);await Bun.write('fixtures/sqlserver/indexes-empty.json',JSON.stringify(empty,null,2)+'\n');await Bun.write('fixtures/sqlserver/index-metadata.json',JSON.stringify(view,null,2)+'\n');
 const evidence={image,version:capture.serverVersion,tables:view.tables.length,indexes:view.tables.reduce((n,t)=>n+t.indexes.length,0),nativeDdlReplay:true,emptyDatabase:true,umfRecoveries:2,behaviors,querySha256:new Bun.CryptoHasher('sha256').update(query).digest('hex'),ddlSha256:new Bun.CryptoHasher('sha256').update(ddl).digest('hex'),scope:'Authored rowstore, filtered/disabled unique, covering, ordered columnstore, heap and partitioned index observations; no arbitrary DDL reconstruction or full physical catalog claim'};
 await Bun.write('fixtures/sqlserver/indexes-oracle.json',JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
