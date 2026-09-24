import assert from 'node:assert/strict';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';

type NativeCase = {system:string; name:string; source:u.Document; native:unknown; classify:(source:u.Document, mode:'strict'|'report')=>any; recover:(r:any,target:any)=>any; blocked?:boolean};

/** Replays independent captures and generated native schemas. Classification
 * never infers the retained author declarations used by ideal recovery. */
export async function verifyKeyNativeRoundTrips() {
 const rows: NativeCase[] = [];
 const ts = await Bun.file('fixtures/validation/key-tablespec-discovery-native.json').json();
 const generatedTs = await Bun.file('fixtures/validation/key-tablespec-projected-schemas.json').json();
 for (const row of [...ts.cases.map((r:any)=>({name:r.case,text:JSON.stringify(r.source)})), ...generatedTs.map((r:any)=>({name:r.name,text:r.nativeText}))]) {
  rows.push({system:'tablespec',name:row.name,source:u.importTableSpec(row.text,{id:'native-key-gate',format:'json'}),native:row.text,
   classify:(d,mode)=>u.classifyTableSpecKeys(d,{mode,profile:'declared-metadata'}),recover:u.recoverTableSpecKeySource});
 }
 const pg = await Bun.file('fixtures/validation/key-postgresql-discovery-native.json').json();
 const nativeSource = await Bun.file('fixtures/validation/key-postgresql-catalog-capture.json').text();
 const supplement = JSON.stringify({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query:await Bun.file('native/postgresql/keys/query.sql').text(),indexes:pg.indexes});
 rows.push({system:'postgresql',name:'independent-catalog',source:u.importPostgresqlCatalogCapture(nativeSource,{id:'native-key-gate'}),native:{nativeSource,supplement},
  classify:(d,mode)=>u.classifyPostgresqlKeys(d,{nativeSource,supplement,mode,profile:'captured-stored-values'},backend),recover:(r,t)=>u.recoverPostgresqlKeySource(r,t,backend)});
 for (const part of ['discovery','encoding','projection']) {
  const proof = await Bun.file(`fixtures/validation/key-sqlserver-${part}-native.json`).json(), text=proof.sourceText;
  rows.push({system:'sqlserver',name:part,source:u.importSqlServerCatalog(text,{id:'native-key-gate'}),native:text,
   classify:(d,mode)=>u.classifySqlServerKeys(d,{nativeSource:text,mode,profile:'captured-stored-values'}),recover:u.recoverSqlServerKeySource});
 }
 const avro = await Bun.file('fixtures/avro/key-discovery-cases.json').json();
 const generatedAvro = await Bun.file('fixtures/avro/key-projection-generated.json').json();
 for (const row of [...avro.cases, ...generatedAvro.cases.map((r:any)=>({...r,id:'projected-'+r.name}))]) {
  const archive={schema:row.schemaText,dependencies:[]};
  rows.push({system:'avro',name:row.id,source:u.importAvroSchema(archive.schema,{id:row.id}),native:archive,
   classify:(d,mode)=>u.classifyAvroKeys(d,{nativeSource:archive,mode,profile:'schema-declarations'}),recover:u.recoverAvroKeySource});
 }
 const parquet = await Bun.file('fixtures/validation/key-parquet-discovery-native.json').json();
 const generatedParquet = await Bun.file('fixtures/validation/key-parquet-projection-corpus.json').json();
 for (const row of [...parquet.cases, ...generatedParquet.rows.map((r:any)=>({...r,id:'projected-'+r.name}))]) {
  const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer()),blocked=row.expectedSchema==='blocked';
  rows.push({system:'parquet',name:row.id,source:blocked?u.captureParquet(bytes,{id:row.id}):u.importParquetSchema(bytes,{id:row.id}),native:bytes,blocked,
   classify:(d,mode)=>u.classifyParquetKeys(d,{mode,profile:'file-schema'}),recover:u.recoverParquetKeySource});
 }
 const coverage: Record<string,{cases:number;classified:number;blocked:number;recoveries:number;refusals:number;strictBlocks:number}> = {};
 for (const row of rows) {
  const count=coverage[row.system]??={cases:0,classified:0,blocked:0,recoveries:0,refusals:0,strictBlocks:0}; count.cases++;
  row.source.vocabularies.future={version:'1.0.0'};
  row.source.extensions={...row.source.extensions,future:{opaque:['9007199254740993',null,{uninterpreted:true}]}};
  const before=structuredClone(row.source),r=await row.classify(row.source,'report');
  assert.deepEqual(row.source,before,'classification mutated native source');
  const strict=await row.classify(row.source,'strict');
  if(r.residuals.length){assert.equal(strict.status,'blocked');assert.equal(strict.target,undefined);count.strictBlocks++;}
  if(row.blocked){
   assert.equal(r.status,'blocked');assert.equal(r.target,undefined);count.blocked++;
   for(const format of ['json','yaml'] as const){const stored=u.readJsonValue(u.writeJsonValue(r,format),format) as any;assert.deepEqual(u.exportParquetCapture(stored.source),row.native);count.recoveries++;}
   continue;
  }
  assert.equal(r.status,'classified');count.classified++;
  assert.deepEqual(r.target.modules,row.source.modules);
  assert.deepEqual(r.target.extensions.future,row.source.extensions.future);
  assert.ok(r.observations.every((o:any)=>o.authorIntent==='unknown'),'native observation invented authored identity');
  if(row.system==='postgresql'){
   const byTable=(name:string)=>r.observations.find((o:any)=>o.identity.table===name);
   assert.equal(byTable('partial').enforcement,'conditional');assert.equal(byTable('padded').equality,'incompatible');
  }
  if(row.system==='sqlserver'&&row.name==='discovery'){
   const byTable=(name:string)=>r.observations.find((o:any)=>o.identity.table===name&&o.identity.indexId>0);
   assert.equal(byTable('partial').enforcement,'conditional');assert.equal(byTable('disabled').enforcement,'unavailable');
   assert.equal(byTable('binary_text').equality,'incompatible');assert.equal(byTable('binary_value').equality,'incompatible');
  }
  for(const format of ['json','yaml'] as const){
   const saved=u.readJsonValue(u.writeJsonValue(r,format),format) as any;
   assert.deepEqual(await row.recover(saved,saved.target),row.native);count.recoveries++;
   const changed=structuredClone(saved.target);changed.id='stale-target';
   await assert.rejects(async()=>row.recover(saved,changed));count.refusals++;
   if(saved.observations.length){const forged=structuredClone(saved);forged.observations[0].authorIntent='authored';await assert.rejects(async()=>row.recover(forged,saved.target));count.refusals++;}
  }
 }
 assert.deepEqual(Object.keys(coverage),['tablespec','postgresql','sqlserver','avro','parquet']);
 return coverage;
}
