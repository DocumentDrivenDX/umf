// Runs only authored fixtures in a disposable, network-isolated local database.
import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,readDocument,writeDocument,importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlCatalogReconstruction,queryPostgresqlCatalogDependencies,projectPostgresqlRowToJsonSchema} from '../src';
import {createValidator} from '../src/validation/schema';
import {createHash,randomUUID} from 'node:crypto';
const name='umf-postgresql-catalog-'+randomUUID();
const fixtureDir='fixtures/postgresql/';
async function run(args:string[],input?:string){
 const child=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){child.stdin!.write(input);child.stdin!.end();}
 const [stdout,stderr,status]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 if(status)throw Error(args.slice(0,3).join(' ')+': '+stderr);return stdout;
}
const imageManifest=await Bun.file('native/postgresql/catalog/image.json').json();
const image=imageManifest.reference;
if(!/^postgres@sha256:[0-9a-f]{64}$/.test(image))throw Error('Expected pinned PostgreSQL image digest');
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(db:string,query:string)=>exec(['psql','-X','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',db,'-At'],query);
const snapshotSql=await Bun.file('native/postgresql/catalog/snapshot.sql').text();
let created=false;
try{
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Still initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}
 if(!ready)throw Error('Temporary PostgreSQL did not become ready');
 const version=(await sql('postgres','SHOW server_version_num;')).trim();if(version!=='170004')throw Error('Unexpected server version '+version);
 for(const db of ['source','regenerated','restored'])await exec(['createdb','-U','postgres',db]);
 const source=(await Promise.all(['domain.sql','advanced.sql','catalog-objects.sql','scalar-types.sql'].map(file=>Bun.file(fixtureDir+file).text()))).join('\n');
 await sql('source',source);
 const doc=await importPostgresqlSql(source,backend,{id:'catalog-source'});
 const transformed=await exportPostgresqlSql(readDocument(writeDocument(doc,'yaml'),'yaml'),backend);
 await sql('regenerated',transformed);
 const dump=await exec(['pg_dump','-U','postgres','--schema-only','source']);
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:Number(version),query:snapshotSql,snapshot:JSON.parse(await sql('source',snapshotSql)),reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:dump}};
 const captured=importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'live-catalog-capture'});
 for(const format of ['json','yaml'] as const){const round=readDocument(writeDocument(captured,format),format);if(JSON.stringify(JSON.parse(exportPostgresqlCatalogCapture(round).json))!==JSON.stringify(capture))throw Error('Catalog capture changed through '+format);}
 const dependencyRead=queryPostgresqlCatalogDependencies(captured,{side:'referenced',object:{catalog:'pg_type',type:'type',identity:'sales.address'}});if(!dependencyRead.available||dependencyRead.edges.length!==3)throw Error('Live dependency lookup failed');
 const archive=getPostgresqlCatalogReconstruction(readDocument(writeDocument(captured,'yaml'),'yaml'));
 const dumped=await importPostgresqlSql(archive.sql,backend,{id:'catalog-dump'});
 const restoredSql=await exportPostgresqlSql(readDocument(writeDocument(dumped,'json'),'json'),backend);
 await sql('restored',restoredSql);
 const snapshots:Record<string,any>={};for(const db of ['source','regenerated','restored'])snapshots[db]=JSON.parse(await sql(db,snapshotSql));
 for(const db of ['regenerated','restored'])if(JSON.stringify(snapshots.source)!==JSON.stringify(snapshots[db]))throw Error('Catalog snapshot differs in '+db);
 await sql('postgres','CREATE ROLE umf_catalog_reader NOLOGIN;');
 const probes=await Bun.file('native/postgresql/catalog/probes.json').json();const behavior=[];
 for(const db of ['source','regenerated','restored']){
  for(const p of probes.success){
   const output=await sql(db,p.sql);const lines=output.split('\n').filter(l=>l.startsWith('{'));
   if(lines.length!==1||JSON.stringify(JSON.parse(lines[0]!))!==JSON.stringify(p.expected))throw Error('Behavior mismatch '+db+'/'+p.id+': '+output);
   behavior.push({database:db,id:p.id,status:'passed'});
  }
  for(const p of probes.reject){
   let rejected=false;try{await sql(db,p.sql);}catch(error){if(!(error as Error).message.includes(p.sqlstate+':'))throw error;rejected=true;}
   if(!rejected)throw Error('Expected SQLSTATE '+p.sqlstate+' for '+db+'/'+p.id);
   behavior.push({database:db,id:p.id,status:'rejected',sqlstate:p.sqlstate});
  }
 }
 const rowProjections=[];
 for(const selection of [
  {name:'orders',columns:{id:'sql-text',total:'sql-text',details:'json-value'}},
  {name:'order_lines',columns:{line_no:'json-int32',quantity:'json-int32'}},
  {name:'row_encodings',columns:{id:'json-int32',active:'json-boolean',optional_flag:'json-boolean',nullable_json:'json-value',required_json:'json-value',label:'sql-text',small_value:'json-int32'}}
 ] as const){
  const projection=projectPostgresqlRowToJsonSchema(captured,{id:'rows-'+selection.name,schemaId:'urn:test:postgresql:rows:'+selection.name,relation:{schema:'sales',name:selection.name},columns:selection.columns,lossPolicy:'allow-reported-loss'});
  if(!projection.target||!projection.sql||!projection.nativeSchema)throw Error('Expected executable row projection');
  const validate=createValidator(false).compile(JSON.parse(projection.nativeSchema));const observations=[];
  for(const db of ['source','regenerated','restored']){
   const setup=selection.name==='row_encodings'?`BEGIN; INSERT INTO sales.row_encodings VALUES (1,true,false,NULL,'null',NULL,-32768),(2,false,NULL,'null','{}','café',32767),(3,true,true,'{"flag":false}','false','',0);`:`BEGIN; INSERT INTO sales.orders(id,external_id,details) OVERRIDING SYSTEM VALUE VALUES (9007199254740993,'00000000-0000-0000-0000-000000000004','{"exact":9007199254740993}'); INSERT INTO sales.order_lines(order_id,line_no,quantity) SELECT id,1,2 FROM sales.orders;`;
   const output=await sql(db,setup+projection.sql+' ROLLBACK;');const rows=output.split('\n').filter(x=>x.startsWith('{'));
   if(rows.length!==(selection.name==='row_encodings'?3:1)||!rows.every(row=>validate(JSON.parse(row))))throw Error('Projected rows violate JSON Schema');
   if(selection.name==='orders'&&(!rows[0]!.includes('9007199254740993.123456789')||!rows[0]!.includes('9007199254740993}')))throw Error('Exact native row values changed');
   observations.push({database:db,rows});
  }
  rowProjections.push({relation:selection.name,schema:JSON.parse(projection.nativeSchema),sql:projection.sql,issues:projection.issues,observations});
 }
 await Bun.write(fixtureDir+'row-projection-results.json',JSON.stringify(rowProjections,null,2)+'\n');
 await Bun.write(fixtureDir+'catalog-capture.json' ,JSON.stringify(capture,null,2)+'\n');
 await Bun.write(fixtureDir+'catalog-source.sql',dump);
 await Bun.write(fixtureDir+'catalog-regenerated.sql',restoredSql+'\n');
 await Bun.write(fixtureDir+'catalog-snapshot.json',JSON.stringify(snapshots.source,null,2)+'\n');
 const evidence={image,serverVersion:Number(version),parserVersion:170004,pgDumpVersion:(await exec(['pg_dump','--version'])).trim(),sourceStatements:(await backend.parse(source) as any).stmts.length,catalogComparisons:['authored SQL versus UMF-regenerated SQL','source database versus pg_dump through UMF into a fresh database'],catalogsEqual:true,rowProjectionCases:rowProjections.length,rowProjectionDatabases:3,captureJsonAndYamlRoundTrip:true,captureAdapterSha256:createHash('sha256').update(await Bun.file('src/adapters/postgresql/catalog.ts').bytes()).digest('hex'),captureSchemaSha256:createHash('sha256').update(await Bun.file('spec/extensions/postgresql-catalog/capture.schema.json').bytes()).digest('hex'),reconstructionFromCapture:true,behavior,dependencyEdges:snapshots.source.dependencies.length,relations:snapshots.source.relations.length,types:snapshots.source.types.length,triggers:snapshots.source.triggers.length,compositeTypes:snapshots.source.compositeTypes.length,rangeTypes:snapshots.source.rangeTypes.length,collations:snapshots.source.collations.length,functions:snapshots.source.functions.length,snapshotQuerySha256:createHash('sha256').update(snapshotSql).digest('hex'),probesSha256:createHash('sha256').update(await Bun.file('native/postgresql/catalog/probes.json').bytes()).digest('hex'),adapterSha256:createHash('sha256').update(await Bun.file('native/postgresql/runtime.ts').bytes()).digest('hex'),sourceSha256:createHash('sha256').update(source).digest('hex'),dumpSha256:createHash('sha256').update(dump).digest('hex'),scope:'Only the authored fixtures and fields in the evidence query. OIDs and physical identifiers excluded; no complete catalog interchange, cluster roles/tablespaces, data backup, arbitrary dump, migration or cross-system equivalence claim.'};
 await Bun.write(fixtureDir+'catalog-results.json',JSON.stringify(evidence,null,2)+'\n');console.log({...evidence,behavior:behavior.length+' probes passed across three databases'});
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
