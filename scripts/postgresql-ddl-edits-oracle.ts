import {randomUUID,createHash} from 'node:crypto';
import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,readDocument,writeDocument} from '../src';
const base='fixtures/postgresql/edits/',fixture=await Bun.file(base+'candidates.json').json(),image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference,name='umf-postgresql-edits-'+randomUUID();
if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Expected pinned image');
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [out,err,status]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(status)throw Error(err);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input),sql=(db:string,text:string)=>exec(['psql','-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',db,'-At'],text),query=await Bun.file('native/postgresql/catalog/snapshot.sql').text();let created=false;
try{
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error();await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL not ready');
 if((await sql('postgres','SHOW server_version_num;')).trim()!=='170004')throw Error('Version differs');
 const databases=['source','expected','candidate','restored'];for(const db of databases)await exec(['createdb','-U','postgres',db]);
 await sql('source',fixture.source);await sql('expected',fixture.expectedSource);await sql('candidate',fixture.nativeSql);
 const dump=await exec(['pg_dump','-U','postgres','--schema-only','candidate']),dumpDoc=await importPostgresqlSql(dump,backend,{id:'edited-candidate-dump'}),restoredSql=await exportPostgresqlSql(readDocument(writeDocument(dumpDoc,'yaml'),'yaml'),backend);await sql('restored',restoredSql);
 const snapshots:Record<string,any>={},captures=[];
 for(const db of databases){
  snapshots[db]=JSON.parse(await sql(db,query));const archive=await exec(['pg_dump','-U','postgres','--schema-only',db]);
  const native={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:snapshots[db],reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:archive}},document=importPostgresqlCatalogCapture(JSON.stringify(native),{id:db+'-fresh-capture'});
  for(const format of ['json','yaml'] as const)if(JSON.stringify(JSON.parse(exportPostgresqlCatalogCapture(readDocument(writeDocument(document,format),format)).json))!==JSON.stringify(native))throw Error('Capture recovery differs');
  captures.push({database:db,document,columns:getPostgresqlColumnMetadata(document)});
 }
 for(const db of ['candidate','restored'])if(JSON.stringify(snapshots.expected)!==JSON.stringify(snapshots[db]))throw Error('Edited catalog differs from independently authored expectation: '+db);
 if(JSON.stringify(snapshots.source)===JSON.stringify(snapshots.expected))throw Error('Expected catalog changes missing');
 const behavior=[];
 for(const db of databases){
  const original=db==='source';
  const defaults=await sql(db,"BEGIN; INSERT INTO sales.edits(label,qty) VALUES ('default',11) RETURNING jsonb_build_object('id',id::text,'amount',amount::text); ROLLBACK;");
  const observed=JSON.parse(defaults.split('\n').find(line=>line.startsWith('{'))!);if(observed.id!=='9007199254740993'||observed.amount!==(original?'1.25':'1.234'))throw Error('Exact identity/default differs');behavior.push({database:db,id:'identity-and-default',observed});
  const probes=[
   {id:'long-label',sql:"INSERT INTO sales.edits(label,qty) VALUES ('sixteen_letters!',11);",state:original?'22001':undefined},
   {id:'nullable-label',sql:'INSERT INTO sales.edits(label,qty) VALUES (NULL,11);',state:original?'23502':undefined},
   {id:'check-threshold',sql:"INSERT INTO sales.edits(label,qty) VALUES ('check',1);",state:original?undefined:'23514'},
   {id:'outside-new-index-filter',sql:"INSERT INTO sales.edits(label,qty) VALUES ('dup',10),('dup',10);",state:original?'23505':undefined},
   {id:'inside-index-filter',sql:"INSERT INTO sales.edits(label,qty) VALUES ('dup',11),('dup',11);",state:'23505'},
   {id:'numeric-precision',sql:"INSERT INTO sales.edits(label,qty,amount) VALUES ('decimal',11,9999999.999);",state:original?'22003':undefined},
  ];
  for(const probe of probes){let state:string|undefined;try{await sql(db,'BEGIN; '+probe.sql+' ROLLBACK;');}catch(error){state=/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/.exec(String(error))?.[1];if(!state)throw error;}if(state!==probe.state)throw Error(db+'/'+probe.id+': expected '+probe.state+', got '+state);behavior.push({database:db,id:probe.id,status:state?'rejected':'accepted',...(state?{sqlstate:state}:{})});}
  const metadata=JSON.parse((await sql(db,"SELECT jsonb_build_object('comment',col_description('sales.edits'::regclass,3),'amount_type',format_type(atttypid,atttypmod)) FROM pg_attribute WHERE attrelid='sales.edits'::regclass AND attname='amount';")).trim());
  if(metadata.comment!==(original?'Original label':"Edited customer's label — 注文")||metadata.amount_type!==(original?'numeric(8,2)':'numeric(10,3)'))throw Error('Native comment/type differs');behavior.push({database:db,id:'comment-and-type',observed:metadata});
 }
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 await Bun.write(base+'oracle.json',JSON.stringify({image,serverVersion:170004,inputSha256:sha(await Bun.file(base+'candidates.json').text()),snapshotQuerySha256:sha(query),candidateSqlSha256:sha(fixture.nativeSql),catalogsEqual:['expected','candidate','restored'],captures,behavior,scope:'Six raw-AST edits, four fresh databases, bounded catalog comparison and authored behavior probes. Catalog edits are not automatically synchronized to SQL; original archives and unrelated UMF metadata remain separate.'},null,2)+'\n');
 console.log({databases:databases.length,edits:fixture.edits.length,captureRecoveries:captures.length*2,behavior:behavior.length});
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
