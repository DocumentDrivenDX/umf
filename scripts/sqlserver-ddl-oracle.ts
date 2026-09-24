import {importSqlServerCatalog,exportSqlServerCatalog,projectSqlServerToDdl,proposeSqlServerCatalogEdit,readDocument,writeDocument,type SqlServerDdlPolicy} from '../src';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-sqlserver-ddl-'+crypto.randomUUID(),password='Umf!'+crypto.randomUUID()+'A9';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err||out||'Process failed');return out;}
let created=false;
const sql=(db:string,query:string)=>run(['docker','exec','-i','-e','SQLCMDPASSWORD='+password,name,'/opt/mssql-tools18/bin/sqlcmd','-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],query);
const json=(s:string)=>JSON.parse(s.split(/\r?\n/).join('').trim()),same=(a:unknown,b:unknown,scope:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(scope+' differs: '+JSON.stringify({a,b}));};
const policy:SqlServerDdlPolicy={aliases:'base-type',physicalLayout:'default-rowstore',nativeExpressions:'verbatim',sourceState:'captured-only',lossPolicy:'allow-reported-loss'};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){if((await run(['docker','inspect','--format','{{.State.Running}}',name])).trim()!=='true')throw Error('SQL Server stopped');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{}if(i%20===19)console.log('Waiting for SQL Server: '+(i+1));await Bun.sleep(1000);}if(!ready)throw Error('SQL Server startup timeout');
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),cases=[];
 for(const [index,file] of ['schema.sql','constraints.sql','indexes.sql'].entries()){
  console.log('Validating generated DDL: '+file);
  const sourceDb='umf_source_'+index,targetDb='umf_generated_'+index;await sql('master','CREATE DATABASE '+sourceDb+'; CREATE DATABASE '+targetDb+';');
  await sql(sourceDb,await Bun.file('fixtures/sqlserver/'+file).text());
  const captured=json(await sql(sourceDb,query));captured.query=query;const source=importSqlServerCatalog(JSON.stringify(captured),{id:file}),result=projectSqlServerToDdl(source,policy);if(result.status!=='projected')throw Error('DDL blocked: '+JSON.stringify(result.issues));
  for(const format of ['json','yaml'] as const)same(projectSqlServerToDdl(readDocument(writeDocument(source,format),format),policy),result,'UMF projection recovery');
  await sql(targetDb,result.nativeSource!);const generated=json(await sql(targetDb,query));generated.query=query;
  // Compare every captured column field. Only explicit alias lowering changes these four fields.
  const expectedColumns=captured.tables.map((t:any)=>({schema:t.schema,name:t.name,columns:t.columns.map((c:any)=>{const copy={...c};if(c.is_user_defined){copy.type_schema='sys';copy.type_name=c.base_type_name;copy.user_type_id=c.system_type_id;copy.is_user_defined=false;}return copy;})}));
  same(generated.tables.map((t:any)=>({schema:t.schema,name:t.name,columns:t.columns})),expectedColumns,'Captured column metadata');
  const constraints=(capture:any)=>capture.tables.map((t:any)=>({schema:t.schema,name:t.name,keys:t.keys.map((k:any)=>({...k,is_system_named:false})),checks:t.checks.map((c:any)=>({...c,is_system_named:false})),foreign_keys:t.foreign_keys.map((f:any)=>({...f,is_system_named:false}))}));
  same(constraints(generated),constraints(captured),'Keys/checks/foreign keys');
  const behavior=[];
  for(const db of [sourceDb,targetDb]){
   if(index===0){
    await sql(db,'SET NOCOUNT ON; INSERT INTO sales.Types(ordinary,amount) VALUES(4,12.3456);');const row=json(await sql(db,'SET NOCOUNT ON; SELECT CONVERT(varchar(30),id) AS id,flag,computed,CONVERT(varchar(30),amount) AS amount,DATALENGTH(version_stamp) AS rowversion_bytes FROM sales.Types FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;'));
    same(row,{id:'9007199254740993',flag:true,computed:5,amount:'12.3456',rowversion_bytes:8},'Identity/default/computed/alias/rowversion values');behavior.push({db,row});
   }else if(index===1){
    await sql(db,"SET NOCOUNT ON; INSERT INTO sales.Parent VALUES(1,2,N'one'); INSERT INTO sales.Child VALUES(1,2,1,0,1); UPDATE sales.Parent SET a=3 WHERE a=1;");same(json(await sql(db,'SET NOCOUNT ON; SELECT parent_a,parent_b FROM sales.Child FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;')),{parent_a:3,parent_b:2},'Cascade update');
    for(const command of ['INSERT INTO sales.Child VALUES(2,99,99,0,1);','INSERT INTO sales.Child VALUES(2,NULL,NULL,-1,1);','INSERT INTO sales.Child VALUES(2,NULL,NULL,0,-1);',"INSERT INTO sales.Untrusted VALUES(1,N'absent');"]){let rejected=false;try{await sql(db,'SET NOCOUNT ON; '+command);}catch(error){if(!/Msg 547,/.test(String(error)))throw error;rejected=true;}if(!rejected)throw Error('Constraint accepted invalid row');}
    await sql(db,'SET NOCOUNT ON; INSERT INTO sales.Child VALUES(-1,NULL,NULL,NULL,1); DELETE FROM sales.Parent WHERE a=3;');same(json(await sql(db,'SET NOCOUNT ON; SELECT id FROM sales.Child FOR JSON PATH;')),[{id:-1}],'Cascade/disabled/null behavior');behavior.push({db,rejections:4,cascadeUpdateAndDelete:true,disabledCheckAndSqlUnknownPreserved:true});
   }else{
    await sql(db,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(1,N'same',0,N'a'),(2,N'same',0,N'b'),(3,N'same',1,N'c'),(4,NULL,1,N'd'),(5,NULL,1,N'e'); INSERT INTO sales.Disabled VALUES(1,7),(2,7);");
    let rejected=false;try{await sql(db,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(6,N'same',1,N'f');");}catch(error){if(!/Msg (2601|2627),/.test(String(error)))throw error;rejected=true;}if(!rejected)throw Error('Filtered uniqueness differs');behavior.push({db,filteredDuplicateRejected:true,duplicatesOutsideFilterAndDisabledIndexAccepted:true});
   }
  }
  const persistence= index===0 ? await Promise.all([sourceDb,targetDb].map(async db=>({db,rows:json(await sql(db,"SET NOCOUNT ON; SELECT c.name,c.is_persisted FROM sys.computed_columns c FOR JSON PATH;"))}))) : [];
  const layouts=index===2?await Promise.all([sourceDb,targetDb].map(async db=>({db,rows:json(await sql(db,"SET NOCOUNT ON; SELECT OBJECT_NAME(i.object_id) AS table_name,i.name,i.type_desc,ds.type_desc AS data_space_type FROM sys.indexes i LEFT JOIN sys.data_spaces ds ON ds.data_space_id=i.data_space_id WHERE OBJECT_NAME(i.object_id) IN ('Analytics','Events') ORDER BY table_name,i.index_id FOR JSON PATH,INCLUDE_NULL_VALUES;"))}))):[];
  const candidateDb='umf_candidate_'+index;await sql('master','CREATE DATABASE '+candidateDb+';');
  const originalExport=exportSqlServerCatalog(source),edits:{path:string;value:unknown}[]=[];
  const tableIndex=(name:string)=>captured.tables.findIndex((t:any)=>t.name===name),columnPath=(table:string,column:string)=>{const ti=tableIndex(table);return '/tables/'+ti+'/columns/'+captured.tables[ti].columns.findIndex((c:any)=>c.name===column);};
  if(index===0){edits.push({path:columnPath('Types','words')+'/max_length',value:64},{path:columnPath('Types','words')+'/description',value:"Edited length, quote ' and 雪"},{path:columnPath('Types','flag')+'/default_definition',value:'((0))'});}
  else if(index===1){const ti=tableIndex('Child'),ci=captured.tables[ti].checks.findIndex((c:any)=>c.name==='CK_Child_qty');edits.push({path:'/tables/'+ti+'/checks/'+ci+'/definition',value:'([qty]>=(10))'});}
  else{const ti=tableIndex('Items'),ii=captured.tables[ti].indexes.findIndex((i:any)=>i.name==='UX_Items_active_email');edits.push({path:'/tables/'+ti+'/indexes/'+ii+'/filter_definition',value:captured.tables[ti].indexes[ii].filter_definition.replace('[active]=(1)','[active]=(0)')},{path:columnPath('Analytics','region')+'/is_nullable',value:true});}
  let candidate=source;for(const edit of edits)candidate=proposeSqlServerCatalogEdit(candidate,edit.path,JSON.stringify(edit.value));
  candidate.vocabularies['example.future']={version:'1.0.0'};candidate.extensions!['example.future']={keep:'uninterpreted candidate context'};
  same(exportSqlServerCatalog(source),originalExport,'Original source isolation');if(projectSqlServerToDdl(candidate,policy).status!=='blocked')throw Error('Implicit candidate generation accepted');
  const candidatePolicy={...policy,sourceState:'allow-candidate' as const},candidateProjection=projectSqlServerToDdl(candidate,candidatePolicy);if(candidateProjection.status!=='projected')throw Error('Explicit candidate generation blocked');
  for(const format of ['json','yaml'] as const)same(projectSqlServerToDdl(readDocument(writeDocument(candidate,format),format),candidatePolicy),candidateProjection,'Candidate UMF recovery');
  await sql(candidateDb,candidateProjection.nativeSource!);const candidateCapture=json(await sql(candidateDb,query));candidateCapture.query=query;
  const lookup=(object:any,path:string)=>path.slice(1).split('/').reduce((value,key)=>value[key],object);
  for(const edit of edits)same(lookup(candidateCapture,edit.path),edit.value,'Native candidate edit '+edit.path);
  let candidateBehavior:Record<string,unknown>;
  if(index===0){await sql(candidateDb,"SET NOCOUNT ON; INSERT INTO sales.Types(ordinary,amount,words) VALUES(4,12.3456,REPLICATE('x',60));");const row=json(await sql(candidateDb,'SET NOCOUNT ON; SELECT flag,LEN(words) AS length FROM sales.Types FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;'));same(row,{flag:false,length:60},'Edited default/length behavior');candidateBehavior=row;}
  else if(index===1){let rejected=false;try{await sql(candidateDb,'SET NOCOUNT ON; INSERT INTO sales.Child VALUES(1,NULL,NULL,1,1);');}catch(error){if(!/Msg 547,/.test(String(error)))throw error;rejected=true;}if(!rejected)throw Error('Edited check accepted qty=1');await sql(candidateDb,'SET NOCOUNT ON; INSERT INTO sales.Child VALUES(2,NULL,NULL,10,1);');candidateBehavior={quantityOneRejected:true,quantityTenAccepted:true};}
  else{await sql(candidateDb,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(1,N'same',1,N'a'),(2,N'same',1,N'b'),(3,N'zero',0,N'c'); INSERT INTO sales.Analytics VALUES(NULL,1,NULL);");let rejected=false;try{await sql(candidateDb,"SET NOCOUNT ON; INSERT INTO sales.Items VALUES(4,N'zero',0,N'd');");}catch(error){if(!/Msg (2601|2627),/.test(String(error)))throw error;rejected=true;}if(!rejected)throw Error('Edited filter failed to enforce active=0');candidateBehavior={activeOneDuplicatesAccepted:true,activeZeroDuplicateRejected:true,nullRegionAccepted:true};}
  const candidateEvidence={edits,source:candidate,projection:candidateProjection,capture:candidateCapture,behavior:candidateBehavior,umfRecoveries:2,generatedDdlSha256:new Bun.CryptoHasher('sha256').update(candidateProjection.nativeSource!).digest('hex')};
  cases.push({file,source,result,generated,behavior,persistence,layouts,candidate:candidateEvidence,sourceDdlSha256:new Bun.CryptoHasher('sha256').update(await Bun.file('fixtures/sqlserver/'+file).text()).digest('hex'),generatedDdlSha256:new Bun.CryptoHasher('sha256').update(result.nativeSource!).digest('hex')});await Bun.write('fixtures/sqlserver/ddl/'+file+'.generated.sql',result.nativeSource!);await Bun.write('fixtures/sqlserver/ddl/'+file+'.candidate.sql',candidateProjection.nativeSource!);
 }
 const evidence={image,policy,querySha256:new Bun.CryptoHasher('sha256').update(query).digest('hex'),cases,scope:'Generated DDL executes for three source schemas; captured column and constraint equality after declared alias/system-name lowering. Computed persistence, columnstore and partition layout losses observed separately; not full database equivalence.'};
 await Bun.write('fixtures/sqlserver/ddl-oracle.json',JSON.stringify(evidence,null,2)+'\n');console.log({schemas:cases.length,tables:cases.reduce((n,c)=>n+c.generated.tables.length,0),behaviorCases:cases.reduce((n,c)=>n+c.behavior.length,0)});
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
