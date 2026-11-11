// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {assertNativeRepresentationEqual} from './json-data-assert';
import {createHash} from 'node:crypto';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {recordedRepositoryPath} from '../../tests/helpers/recorded-repository-path';
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
/** Re-author a retained explicit Cardinality decision under current core, preserving its authored item reference. */
export function replayCurrentCardinalityAuthor(row:any):u.CoreCardinalityDeclaration {
 const source=u.copyJson(row.author.source) as u.Document;
 if(source.umf===u.CURRENT_CORE_VERSION)return u.verifyCoreCardinalityDeclaration(row.author,row.author.target);
 assert.notEqual(source.umf,u.CURRENT_CORE_VERSION);source.umf=u.CURRENT_CORE_VERSION;
 const field=source.modules.find(module=>module.id===row.author.identity.module)?.elements.find(element=>element.id===row.author.identity.element);
 const authoredField=row.author.target.modules.find((module:any)=>module.id===row.author.identity.module)?.elements.find((element:any)=>element.id===row.author.identity.element);
 assert.ok(field,'historical author source must contain the declared element');assert.ok(authoredField,'historical author target must contain the declared element');
 const options:u.CoreCardinalityRequest={cardinality:row.author.provenance.cardinality,...(Object.hasOwn(authoredField,'itemType')?{itemType:u.copyJson(authoredField.itemType) as u.CoreItemTypeReference|null}:{})};
 return u.declareCoreCardinality(source,row.author.identity,options);
}
const upgrade=(source:u.Document)=>source;
function retained(before:u.Document,after:u.Document){
 for(const [key,value] of Object.entries(before.extensions??{}))assertNativeRepresentationEqual(after.extensions?.[key],value);
 for(const m of before.modules)for(const e of m.elements){const target=after.modules.find(x=>x.id===m.id)?.elements.find(x=>x.id===e.id);assert.ok(target);for(const [key,value] of Object.entries(e.extensions))assertNativeRepresentationEqual(target.extensions[key],value);}
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
 const coverage={} as Record<System,{authoredCases:number;strictBlocks:number;reportResiduals:number;idealRecoveries:number;nativeCases:number;nativeBlocks:number;nativeRecoveries:number;compositions:number;labels:string[];historicalReplayCases:number;historicalReplayInputsEqual:number;currentReplayCases:number;currentReplayInputsEqual:number}>;
 for(const system of cardinalitySystems){
  const b=bindings[system],counts={authoredCases:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeCases:0,nativeBlocks:0,nativeRecoveries:0,compositions:0,labels:[] as string[],historicalReplayCases:0,historicalReplayInputsEqual:0,currentReplayCases:0,currentReplayInputsEqual:0};coverage[system]=counts;
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
   const before=u.copyJson(row.author),r=await b.project(row);assertNativeRepresentationEqual(row.author,before);counts.authoredCases++;
   assert.equal(r.mapping.origin,'authored');assert.equal(r.mapping.cardinality,row.author.provenance.cardinality);
   if(!counts.labels.includes(r.mapping.cardinality))counts.labels.push(r.mapping.cardinality);
   if(r.status==='blocked'){assert.equal(row.request.mode,'strict');assert.equal(r.target,undefined);assert.ok(r.residuals.length);counts.strictBlocks++;continue;}
   assert.equal(r.status,'projected');assert.ok(r.target);
   if(row.request.mode==='strict')assert.equal(r.residuals.length,0);
   if(r.residuals.length){assert.equal(row.request.mode,'report');assert.notEqual(r.mapping.outcome,'exact');counts.reportResiduals++;}
   for(const format of ['json','yaml'] as const){assertNativeRepresentationEqual(await b.recover(roundTrip(r,format)),row.author.target);counts.idealRecoveries++;}
   if(b.compose){b.compose(r);counts.compositions++;}
   if(system==='tablespec'){
    const text=u.exportTableSpec(r.target),source=tableSpecCardinalitySource(text),c=u.classifyTableSpecCardinality(source,{column:0,profile:'runtime-model',mode:'report'});assert.ok(c.target);assert.equal(u.recoverTableSpecCardinalitySource(c,c.target),text);counts.compositions++;
   }
  }
  counts.labels.sort();assertNativeRepresentationEqual(counts.labels,['array','map','one','unspecified']);assert.ok(counts.strictBlocks&&counts.reportResiduals&&counts.idealRecoveries);
 }
 function native(system:System,source:u.Document,classify:(source:u.Document)=>any,recover:(r:any)=>unknown,expected:unknown,mode:string){
  const input=unknown(source),before=u.copyJson(input),r=classify(input),counts=coverage[system];counts.nativeCases++;assertNativeRepresentationEqual(input,before);assert.equal(r.mapping.origin,'classified');
  if(r.status==='blocked'){assert.equal(mode,'strict');assert.ok(r.residuals.length);assert.equal(r.target,undefined);counts.nativeBlocks++;return;}
  assert.equal(r.status,'classified');retained(input,r.target);if(mode==='strict')assert.equal(r.residuals.length,0);
  for(const format of ['json','yaml'] as const){assertNativeRepresentationEqual(recover(roundTrip(r,format)),expected);counts.nativeRecoveries++;}
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
 for(const row of (await Bun.file('fixtures/avro/cardinality-cases.json').json()).cases){const initial=avroAvailabilitySource(row.schema,[],'cardinality.Example'),source=initial.source;
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
  for(const row of proof.rows){
   if(row.result.status==='blocked')continue;
   // Re-author the recorded declaration under current core; do not infer item meaning from native storage.
   // Current receipts verify in place; only older receipts are re-authored under the current core.
   const isHistorical=row.author.source.umf!==u.CURRENT_CORE_VERSION,currentAuthor=replayCurrentCardinalityAuthor(row);
   const currentRow={author:currentAuthor,request:row.request},result=await bindings[system].project(currentRow);
   if(isHistorical)coverage[system].historicalReplayCases++;else coverage[system].currentReplayCases++;
   const historicalInput=system==='postgresql'?row.result.target.modules[0]?.elements[0]?.extensions?.['umf.postgresql']?.source:row.result.target.sql;
   const currentInput=system==='postgresql'?result.target?.modules[0]?.elements[0]?.extensions?.['umf.postgresql']?.source:result.target?.sql;
   assert.equal(typeof historicalInput,'string');assert.equal(currentInput,historicalInput,`${system} current authored replay differs from native input ${row.request.id}`);
   if(isHistorical)coverage[system].historicalReplayInputsEqual++;else coverage[system].currentReplayInputsEqual++;
   let classified:any;
   if(system==='postgresql'){
    const column=u.getPostgresqlColumnMetadata(source).find(c=>c.relation.name===row.request.tableName)!;assert.ok(column);
    classified=u.classifyPostgresqlCardinality(source,{column:column.path,nativeSource:proof.nativeSource,supplement:proof.supplement,profile:'stored-value',mode:'report'});
    assert.equal(classified.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='array'?'array':'unspecified');
    assertNativeRepresentationEqual(u.recoverPostgresqlCardinalitySource(classified,classified.target!),{nativeSource:proof.nativeSource,supplement:proof.supplement});
   }else{
    const column=u.getSqlServerColumnMetadata(source).find(c=>c.table.name===row.request.tableName)!;assert.ok(column);
    const check=u.getSqlServerConstraintMetadata(source).tables.find(t=>t.table.name===column.table.name)!.checks[0];
    const constraint=check?.kind==='object'&&check.members.name?.kind==='string'?check.members.name.value:null;
    classified=u.classifySqlServerCardinality(source,{column:column.path,nativeSource:proof.nativeSource,identity:{module:'logical',element:'value'},constraint,profile:row.request.storage==='scalar'?'native-scalar':row.request.storage,mode:'report'});
    assert.equal(classified.mapping.cardinality,row.request.storage==='scalar'?'one':row.request.storage==='json-array'?'array':'map');
    assert.equal(u.recoverSqlServerCardinalitySource(classified,classified.target!),proof.nativeSource);
   }
   if(result.mapping.outcome==='exact'&&result.mapping.cardinality!=='unspecified')assert.equal(classified.mapping.cardinality,result.mapping.cardinality);
   const recovered=await bindings[system].recover(result) as u.Document,historicalTarget=u.copyJson(row.author.target) as u.Document;
   // The authored replay above deliberately advances only the core marker; compare all remaining UMF and native content exactly.
   recovered.umf=historicalTarget.umf;
   assertNativeRepresentationEqual(recovered,historicalTarget);coverage[system].compositions++;
  }
 }
 for(const system of cardinalitySystems)assert.ok(coverage[system].nativeBlocks&&coverage[system].nativeRecoveries);
 return coverage;
}