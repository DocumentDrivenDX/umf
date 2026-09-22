import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isAbsolute,relative,resolve} from 'node:path';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {cardinalityTableSpecCases,tableSpecCardinalitySource} from './cardinality-tablespec-cases';
import {cardinalityTableSpecProjectionCases} from './cardinality-tablespec-projection-cases';
import {postgresqlCardinalityProjectionCases} from './cardinality-postgresql-projection-cases';
import {sqlserverCardinalityProjectionCases} from './cardinality-sqlserver-projection-cases';
import {avroCardinalityProjectionCases} from './cardinality-avro-projection-cases';
import {parquetCardinalityProjectionCases} from './cardinality-parquet-projection-cases';
import {verifyAvroCardinalityComposition} from './cardinality-avro-composition';
import {verifyParquetCardinalityComposition} from './cardinality-parquet-composition';
import {avroAvailabilitySource} from './nullability-avro-cases';
export const cardinalitySystems=['tablespec','postgresql','sqlserver','avro','parquet'] as const;
type System=typeof cardinalitySystems[number];
type Reader=(path:string)=>Promise<Uint8Array>;
const read:Reader=async path=>new Uint8Array(await Bun.file(path).arrayBuffer());
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const file=(name:string)=>`fixtures/validation/${name}.json`;
/** Retained proof consistency, not authentication or a fresh native execution. */
export async function verifyCardinalityEvidence(reader:Reader=read){
 const hashes=new Map<string,string>(),records:{path:string;sha256:string}[]=[],pending:{record:any;name:string}[]=[];let fingerprints=0;
 async function hash(path:string){if(!hashes.has(path))hashes.set(path,digest(await reader(path)));return hashes.get(path)!;}
 async function load(path:string){return JSON.parse(new TextDecoder().decode(await reader(path)));}
 async function verify(record:any,label:string){
  assert.ok(record.sha256&&Object.keys(record.sha256).length,`${label}: missing fingerprints`);
  for(const [path,expected] of Object.entries(record.sha256)){
   const local=relative(process.cwd(),resolve(path));
   assert.ok(!isAbsolute(local)&&!local.split('/').includes('..')&&!path.split('/').includes('..'),`${label}: unsafe evidence path`);
   assert.match(String(expected),/^[0-9a-f]{64}$/);assert.equal(await hash(path),expected,`${label}: stale ${path}`);fingerprints++;
  }
 }
 const required=(record:any,path:string)=>assert.ok(Object.hasOwn(record.sha256??{},path),`missing required proof ${path}`);
 for(const name of ['cardinality-core-acceptance-evidence',...cardinalitySystems.map(s=>`${s}-cardinality-acceptance-evidence`)]){
  const path=file(name),r=await load(path);assert.equal(r.results.failures,0,`${name}: failures`);assert.equal(r.results.typecheck,'passed');assert.equal(r.nativeEquivalence,false);
  assert.equal(name.startsWith('cardinality-core')?r.coreTaskAccepted:r.bindingAccepted,true,`${name}: not accepted`);
  for(const p of ['src/index.ts','spec/core/cardinality-document.schema.json','src/model/cardinality.ts','src/model/cardinality-transition.ts'])required(r,p);
  if(name.startsWith('cardinality-core')){
   for(const p of ['spec/core/cardinality-operation.schema.json','spec/core/cardinality-transition.schema.json','spec/core/cardinality-selection.schema.json','spec/core/kind-operation-v3.schema.json','spec/core/record-type-operation-v3.schema.json','spec/core/nullability-operation-v2.schema.json'])required(r,p);
   for(const proof of ['core-cardinality-browser','core-cardinality-operations-browser','cardinality-field-operations-browser','cardinality-selection-browser']){
    required(r,file(proof));const browser=await load(file(proof));assert.match(browser.browser,/^148\./);assert.deepEqual(browser.externalRequests,[]);assert.ok(Object.keys(browser.checks).length);
   }
  }
  if(!name.startsWith('cardinality-core')){
   const system=name.replace('-cardinality-acceptance-evidence','');
   for(const part of ['native','browser'])required(r,file(`cardinality-${system}-${part}`));
  }
  pending.push({record:r,name});records.push({path,sha256:await hash(path)});
 }
 const refresh=await load(file('field-gate-refresh-evidence'));
 assert.equal(refresh.regression.failures,0);assert.ok(refresh.regression.tests>=407);assert.equal(refresh.typecheck,'passed');
 for(const run of refresh.runs)assert.equal(run.exitCode,0,`Failed command ${run.command}`);
 for(const system of cardinalitySystems)for(const part of ['native','browser']){
  const script=`scripts/core-ideals/cardinality-${system}-${part==='native'?'oracle':'browser'}.ts`;
  assert.ok(refresh.runs.some((r:any)=>Array.isArray(r.command)&&r.command.includes(script)),`Missing command ${script}`);
  const path=file(`cardinality-${system}-${part}`);required(refresh,path);const r=await load(path);
  assert.ok(r.runs?.length,`${path}: missing child commands`);for(const run of r.runs)assert.equal(run.exitCode,0,`${path}: failed child command`);
  if(part==='browser'){
   assert.match(r.browser,/^148\./);assert.ok(Object.keys(r.checks).length);
   if(Object.hasOwn(r,'externalRequests'))assert.deepEqual(r.externalRequests,[]);
   const children=Object.keys(r.sha256??{}).filter(p=>p.endsWith('-browser.json'));assert.ok(children.length);
   for(const child of children){
    const local=relative(process.cwd(),resolve(child));
    assert.ok(!isAbsolute(local)&&!local.split('/').includes('..')&&!child.split('/').includes('..'),`${path}: unsafe evidence path`);
    const browser=await load(child);assert.equal(browser.browser,r.browser);assert.deepEqual(browser.externalRequests,[]);assert.ok(Object.keys(browser.checks).length);
   }
  }
  else {
   assert.equal(r.nativeEquivalence,false);
   if(system==='tablespec')assert.equal(r.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
   if(system==='postgresql')assert.equal(r.nativeVersion,'17.4');
   if(system==='sqlserver')assert.equal(r.nativeVersion,'16.0.4295.3');
   if(system==='avro')assert.deepEqual(r.nativeVersions,{apache:'1.12.0',fastavro:'1.12.2'});
   if(system==='parquet')assert.deepEqual(r.nativeVersions,{pyarrow:'21.0.0'});
  }
  await verify(r,path);
 }
 for(const {record,name} of pending)await verify(record,name);
 await verify(refresh,'refresh');
 return {systems:[...cardinalitySystems],records,fingerprints,refreshSha256:await hash(file('field-gate-refresh-evidence'))};
}
const upgrade=(source:u.Document)=>u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(source).target).target).target;
function retained(before:u.Document,after:u.Document){
 for(const [key,value] of Object.entries(before.extensions??{}))assert.deepEqual(after.extensions?.[key],value);
 for(const m of before.modules)for(const e of m.elements){const target=after.modules.find(x=>x.id===m.id)?.elements.find(x=>x.id===e.id);assert.ok(target);for(const [key,value] of Object.entries(e.extensions))assert.deepEqual(target.extensions[key],value);}
}
function unknown(source:u.Document){const d=u.copyJson(source) as unknown as u.Document;d.vocabularies.future={version:'1.0.0'};d.extensions={...d.extensions,future:{meaning:['9007199254740993',null]}};return d;}
// These are test orchestration adapters over independently schema-checked public receipts.
type Row={author:u.CoreCardinalityDeclaration;request:any};
interface Binding {rows:Row[];project:(row:Row)=>any;recover:(r:any)=>any;compose?:(r:any)=>any;}
const roundTrip=(value:any,format:'json'|'yaml')=>u.readJsonValue(u.writeJsonValue(u.copyJson(value),format),format) as any;
export async function verifyCardinalityRoundTrips(){
 const bindings:Record<System,Binding>={
  tablespec:{rows:cardinalityTableSpecProjectionCases(),project:r=>u.projectCardinalityToTableSpec(r.author,r.request),recover:r=>u.recoverCardinalityFromTableSpec(r,u.exportTableSpec(r.target))},
  postgresql:{rows:postgresqlCardinalityProjectionCases(),project:r=>u.projectCardinalityToPostgresql(r.author,r.request,backend),recover:r=>u.recoverCardinalityFromPostgresql(r,r.nativeSql,backend)},
  sqlserver:{rows:sqlserverCardinalityProjectionCases(),project:r=>u.projectCardinalityToSqlServer(r.author,r.request),recover:r=>u.recoverCardinalityFromSqlServer(r,r.nativeSql)},
  avro:{rows:avroCardinalityProjectionCases(),project:r=>u.projectCardinalityToAvro(r.author,r.request),recover:r=>u.recoverCardinalityFromAvro(r,r.nativeBundle),compose:verifyAvroCardinalityComposition},
  parquet:{rows:parquetCardinalityProjectionCases(),project:r=>u.projectCardinalityToParquet(r.author,r.request),recover:r=>u.recoverCardinalityFromParquet(r,u.exportParquetCapture(r.target)),compose:verifyParquetCardinalityComposition},
 };
 const coverage={} as Record<System,{authoredCases:number;strictBlocks:number;reportResiduals:number;idealRecoveries:number;nativeCases:number;nativeBlocks:number;nativeRecoveries:number;compositions:number;labels:string[]}>;
 for(const system of cardinalitySystems){
  const b=bindings[system],counts={authoredCases:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeCases:0,nativeBlocks:0,nativeRecoveries:0,compositions:0,labels:[] as string[]};coverage[system]=counts;
  // Cover every ideal independently of whether the binding can express it.
  const base=b.rows.find(r=>r.author.provenance.cardinality==='one')!;
  for(const cardinality of ['one','array','map','unspecified'] as const)for(const mode of ['strict','report'] as const){
   const source=unknown(base.author.source);const field=source.modules.find(m=>m.id===base.author.identity.module)!.elements.find(e=>e.id===base.author.identity.element)!;
   delete field.cardinality;delete field.itemType;if(cardinality==='array'||cardinality==='map')delete field.scalarType;
   field.future={opaque:'field'};source.modules[0]!.elements.push({id:'gate-item',kind:'field',cardinality:'array',nullability:'absent-allowed',itemType:{module:source.modules[0]!.id,element:'gate-item',future:{opaque:'reference'}},extensions:{future:{opaque:'item'}}});
   const author=u.declareCoreCardinality(source,base.author.identity,{cardinality,...(cardinality==='array'||cardinality==='map'?{itemType:{module:source.modules[0]!.id,element:'gate-item',future:{opaque:'reference'}}}:{})});
   b.rows.push({author,request:{...base.request,mode}});
  }
  for(const row of b.rows){
   const before=u.copyJson(row.author),r=await b.project(row);assert.deepEqual(row.author,before);counts.authoredCases++;
   assert.equal(r.mapping.origin,'authored');assert.equal(r.mapping.cardinality,row.author.provenance.cardinality);
   if(!counts.labels.includes(r.mapping.cardinality))counts.labels.push(r.mapping.cardinality);
   if(r.status==='blocked'){assert.equal(row.request.mode,'strict');assert.equal(r.target,undefined);assert.ok(r.residuals.length);counts.strictBlocks++;continue;}
   assert.equal(r.status,'projected');assert.ok(r.target);
   if(row.request.mode==='strict')assert.equal(r.residuals.length,0);
   if(r.residuals.length){assert.equal(row.request.mode,'report');assert.notEqual(r.mapping.outcome,'exact');counts.reportResiduals++;}
   for(const format of ['json','yaml'] as const){assert.deepEqual(await b.recover(roundTrip(r,format)),row.author.target);counts.idealRecoveries++;}
   if(b.compose){b.compose(r);counts.compositions++;}
   if(system==='tablespec'){
    const text=u.exportTableSpec(r.target),source=tableSpecCardinalitySource(text),c=u.classifyTableSpecCardinality(source,{column:0,profile:'runtime-model',mode:'report'});assert.ok(c.target);assert.equal(u.recoverTableSpecCardinalitySource(c,c.target),text);counts.compositions++;
   }
  }
  counts.labels.sort();assert.deepEqual(counts.labels,['array','map','one','unspecified']);assert.ok(counts.strictBlocks&&counts.reportResiduals&&counts.idealRecoveries);
 }
 function native(system:System,source:u.Document,classify:(source:u.Document)=>any,recover:(r:any)=>unknown,expected:unknown,mode:string){
  const input=unknown(source),before=u.copyJson(input),r=classify(input),counts=coverage[system];counts.nativeCases++;assert.deepEqual(input,before);assert.equal(r.mapping.origin,'classified');
  if(r.status==='blocked'){assert.equal(mode,'strict');assert.ok(r.residuals.length);assert.equal(r.target,undefined);counts.nativeBlocks++;return;}
  assert.equal(r.status,'classified');retained(input,r.target);if(mode==='strict')assert.equal(r.residuals.length,0);
  for(const format of ['json','yaml'] as const){assert.deepEqual(recover(roundTrip(r,format)),expected);counts.nativeRecoveries++;}
 }
 for(const c of cardinalityTableSpecCases())native('tablespec',c.source,s=>u.classifyTableSpecCardinality(s,c.request),r=>u.recoverTableSpecCardinalitySource(r,r.target),c.text,c.request.mode);
 const pg=await Bun.file(file('cardinality-postgresql-catalog-native')).json(),pgSource=upgrade(u.importPostgresqlCatalogCapture(pg.captureSource,{id:'gate'})),supplement=JSON.stringify(pg.supplement);
 for(const e of pgSource.modules.find(m=>m.id==='postgresql.columns')!.elements)e.kind='field';
 for(const column of u.getPostgresqlColumnMetadata(pgSource))for(const profile of ['stored-value','unresolved'] as const)for(const mode of ['strict','report'] as const)native('postgresql',pgSource,s=>u.classifyPostgresqlCardinality(s,{column:column.path,nativeSource:pg.captureSource,supplement,profile,mode}),r=>u.recoverPostgresqlCardinalitySource(r,r.target),{nativeSource:pg.captureSource,supplement},mode);
 const sql=await Bun.file(file('cardinality-sqlserver-profile-native')).json(),sqlSource=upgrade(u.importSqlServerCatalog(sql.nativeSource,{id:'gate'}));
 for(const column of u.getSqlServerColumnMetadata(sqlSource))for(const profile of ['native-scalar','json-array','json-object','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const check=u.getSqlServerConstraintMetadata(sqlSource).tables.find(t=>t.table.name===column.table.name)!.checks[0] as any;
  native('sqlserver',sqlSource,s=>u.classifySqlServerCardinality(s,{column:column.path,nativeSource:sql.nativeSource,identity:{module:'logical',element:'value'},constraint:profile==='native-scalar'?null:check?.members?.name?.value??null,profile,mode}),r=>u.recoverSqlServerCardinalitySource(r,r.target),sql.nativeSource,mode);
 }
 for(const row of (await Bun.file('fixtures/avro/cardinality-cases.json').json()).cases){const initial=avroAvailabilitySource(row.schema,[],'cardinality.Example'),source=u.upgradeCardinalityEnvelope(initial.source).target;
  for(const profile of ['present-non-null-schema','unresolved'] as const)for(const mode of ['strict','report'] as const)native('avro',source,s=>u.classifyAvroCardinality(s,{column:initial.column,nativeSource:row.schema,identity:{module:'logical',element:'value'},profile,mode}),r=>u.recoverAvroCardinalityBundle(r,r.target),{schema:row.schema,dependencies:[]},mode);
 }
 for(const row of (await Bun.file(file('cardinality-parquet-profile-native')).json()).cases){const bytes=await read(row.path);assert.equal(digest(bytes),row.sha256);const source=upgrade(u.importParquetSchema(bytes,{id:'gate'}));
  for(const profile of ['present-value-schema','unresolved'] as const)for(const mode of ['strict','report'] as const)native('parquet',source,s=>u.classifyParquetCardinality(s,{index:1,identity:{module:'logical',element:'value'},profile,mode}),r=>u.recoverParquetCardinalityBytes(r,r.target),bytes,mode);
 }
 // SQL re-ingestion uses independently captured engine output from the fingerprinted
 // native run. This gate replays captures; it does not claim to run either engine.
 for(const system of ['postgresql','sqlserver'] as const){
  const proof=await Bun.file(file(`cardinality-${system}-projection-native`)).json();
  const source=upgrade(system==='postgresql'?u.importPostgresqlCatalogCapture(proof.nativeSource,{id:'fresh'}):u.importSqlServerCatalog(proof.nativeSource,{id:'fresh'}));
  if(system==='postgresql')for(const e of source.modules.find(m=>m.id==='postgresql.columns')!.elements)e.kind='field';
  const seen=new Set<string>();
  for(const row of proof.rows){
   if(row.result.status==='blocked')continue;
   const key=row.request.storage+':'+row.author.provenance.cardinality;if(seen.has(key))continue;seen.add(key);
   const result=await bindings[system].project(row);assert.deepEqual(result,row.result);
   let classified:any;
   if(system==='postgresql'){
    const column=u.getPostgresqlColumnMetadata(source).find(c=>c.relation.name===row.request.tableName)!;assert.ok(column);
    classified=u.classifyPostgresqlCardinality(source,{column:column.path,nativeSource:proof.nativeSource,supplement:proof.supplement,profile:'stored-value',mode:'report'});
    assert.equal(classified.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='array'?'array':'unspecified');
    assert.deepEqual(u.recoverPostgresqlCardinalitySource(classified,classified.target!),{nativeSource:proof.nativeSource,supplement:proof.supplement});
   }else{
    const column=u.getSqlServerColumnMetadata(source).find(c=>c.table.name===row.request.tableName)!;assert.ok(column);
    const check=u.getSqlServerConstraintMetadata(source).tables.find(t=>t.table.name===column.table.name)!.checks[0];
    const constraint=check?.kind==='object'&&check.members.name?.kind==='string'?check.members.name.value:null;
    classified=u.classifySqlServerCardinality(source,{column:column.path,nativeSource:proof.nativeSource,identity:{module:'logical',element:'value'},constraint,profile:row.request.storage==='scalar'?'native-scalar':row.request.storage,mode:'report'});
    assert.equal(classified.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='json-array'?'array':'map');
    assert.equal(u.recoverSqlServerCardinalitySource(classified,classified.target!),proof.nativeSource);
   }
   if(result.mapping.outcome==='exact'&&result.mapping.cardinality!=='unspecified')assert.equal(classified.mapping.cardinality,result.mapping.cardinality);
   assert.deepEqual(await bindings[system].recover(result),row.author.target);coverage[system].compositions++;
  }
 }
 for(const system of cardinalitySystems)assert.ok(coverage[system].nativeBlocks&&coverage[system].nativeRecoveries);
 return coverage;
}
if(import.meta.main){
 const evidence=await verifyCardinalityEvidence(),roundTrips=await verifyCardinalityRoundTrips();
 const paths=['scripts/core-ideals/cardinality-conformance.ts','tests/core-ideals/cardinality-conformance.test.ts'];
 const result={scope:'Qualified Cardinality admission and five-system delivery; retained evidence consistency is not native re-execution or authentication',idealAdmission:{outcome:'passed',requiredBindings:2,usefulBindings:5,systems:[...cardinalitySystems],meaning:'CONTRACT-040 / Element.cardinality and itemType',nativeEquivalence:false},delivery:{outcome:'passed',requiredBindings:5,qualifiedBindings:5,systems:[...cardinalitySystems],scope:'Explicit supported profiles, including residuals and refusals; no general row conversion'},evidence,roundTrips,fingerprints:Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest(await read(p))])))};
 await Bun.write(file('cardinality-conformance'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({systems:5,fingerprints:evidence.fingerprints,roundTrips,nativeEquivalence:false}));
}
