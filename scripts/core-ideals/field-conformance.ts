import {assertJsonDataEqual} from './json-data-assert';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {fieldReportCases} from './field-report-cases';
import {classificationReportCases} from './classification-report-cases';
import {copyJson, readJsonValue, writeJsonValue, exportTableSpec, exportAvroSchema, exportParquetCapture, recoverFieldFromTableSpec, recoverFieldFromPostgresql, recoverFieldFromSqlServer, recoverFieldFromAvro, recoverFieldFromParquet, recoverPostgresqlFieldCapture, recoverSqlServerFieldCapture, recoverAvroFieldBundle, recoverParquetFieldBytes, verifyTableSpecFieldClassification, inspectFieldProjection, inspectFieldClassification} from '../../src';
import type {AuthoredFieldProjection} from '../../src/core-ideals/field-report';
import type {NativeFieldClassification} from '../../src/core-ideals/classification-report';
import type {Element} from '../../src/model/types';

export const fieldSystems=['tablespec','postgresql','sqlserver','avro','parquet'] as const;
const evidenceFiles=['field-core-acceptance-evidence','field-tablespec-acceptance-evidence','field-postgresql-acceptance-evidence','remaining-field-bindings-acceptance-evidence'];
const requiredProofs:Record<string,string[]>={
 'field-core-acceptance-evidence':['spec/core/field-document.schema.json','src/model/field-kind.ts','src/model/field-transition.ts','fixtures/validation/core-field-browser.json',
  'spec/core/nullability-document.schema.json','spec/core/kind-operation-v2.schema.json','spec/core/record-type-operation-v2.schema.json',
  'src/model/nullability.ts','src/model/nullability-transition.ts',
  'spec/core/cardinality-document.schema.json','spec/core/cardinality-operation.schema.json','spec/core/cardinality-transition.schema.json','spec/core/cardinality-selection.schema.json','spec/core/kind-operation-v3.schema.json','spec/core/record-type-operation-v3.schema.json','spec/core/nullability-operation-v2.schema.json','src/model/cardinality.ts','src/model/cardinality-transition.ts'],
 'field-tablespec-acceptance-evidence':['field-tablespec-classification','field-tablespec-native','field-tablespec-projection','field-tablespec-projection-native'].map(n=>`fixtures/validation/${n}.json`),
 'field-postgresql-acceptance-evidence':['field-postgresql-native','field-postgresql-browser','field-postgresql-projection-native','field-postgresql-projection-browser','postgresql-ddl-kinds-native','postgresql-ddl-kinds-browser'].map(n=>`fixtures/validation/${n}.json`),
 'remaining-field-bindings-acceptance-evidence':[
  ...['sqlserver','avro','parquet'].flatMap(s=>[`field-${s}-native`,`field-${s}-browser`,`field-${s}-projection-native`,`field-${s}-projection-browser`]),
  'avro-record-type-native','avro-record-type-browser','field-avro-fastavro-native',
 ].map(n=>`fixtures/validation/${n}.json`),
};
type Reader=(path:string)=>Promise<Uint8Array>;
const read:Reader=async path=>new Uint8Array(await Bun.file(path).arrayBuffer());
type HistoricalFieldEvidence={historicalQualification:'COMPLETE'|'PARTIALLY_REVALIDATED';currentCoreQualification:'UNQUALIFIED'|'QUALIFIED';unqualified:{proof:string;path:string;pinnedSha256:string;observedSha256:string}[]};
export function requireCurrentCoreFieldQualification(evidence:{currentCoreQualification:string}):void {if(evidence.currentCoreQualification!=='QUALIFIED')throw new Error('Field native evidence is not qualified for the current core');}
export function fieldConformanceStatus(evidence:{historicalQualification:string;currentCoreQualification:string}){return {
 scope:'Current Field authoring and receipt behavior is reported separately from partially revalidated historical native evidence; current-core native qualification is unavailable',
 idealAdmitted:false,sourceOperationsVerified:true,sourceUsefulSystems:[...fieldSystems],
 historicalQualification:evidence.historicalQualification,currentNativeQualification:evidence.currentCoreQualification,
 priorityDelivery:false,qualifiedBindings:0,nativeEquivalence:false,
};}
/** Integrity/consistency check of retained evidence, not authentication or a native engine rerun. */
export async function verifyFieldEvidence(reader:Reader=read,options:{allowUnqualifiedHistorical?:boolean}={}){
 const records:any[]=[];let fingerprints=0;const unqualified:HistoricalFieldEvidence['unqualified']=[];
 const recoveryPath='docs/helix/04-build/evidence/metamodel-authority/historical-field-artifact-recovery/comparison.json';
 const recovery=JSON.parse(new TextDecoder().decode(await reader(recoveryPath)));
 const historyPath='docs/helix/04-build/evidence/metamodel-authority/history/manifest.json',history=JSON.parse(new TextDecoder().decode(await reader(historyPath)));
 assert.equal(recovery.scope,'Bounded recovery attempt for frozen historical field/facet artifacts; no old observation or hash was relabelled.');
 assert.equal(recovery.outcome,'No missing historical artifact recovered: SDK lacks standalone test bundles; only the already-available libpg-query.wasm matches. Current native qualification remains unknown for those original artifact pins.');
 async function compare(proof:string,path:string,expected:string,actual:string){
  if(actual===expected)return;
  if(options.allowUnqualifiedHistorical){
   if(path.startsWith('dist/')){const artifact=recovery.comparisons.find((entry:any)=>entry.path===path&&entry.expected===expected);assert.ok(artifact&&!artifact.matches,'Only unrecovered historical build artifacts may be left unqualified');}
   unqualified.push({proof,path,pinnedSha256:expected,observedSha256:actual});return;
  }
  assert.equal(actual,expected,`${proof}: stale ${path}`);
 }
 async function observedHash(path:string,expected:string){
  let actual:string;
  try{actual=createHash('sha256').update(await reader(path)).digest('hex');}catch(error){if(!options.allowUnqualifiedHistorical||!String(error).includes('ENOENT'))throw error;actual='MISSING';}
  if(actual!==expected){const archived=history.entries.find((entry:any)=>entry.path===path&&entry.sha256===expected)?.archive;if(archived&&createHash('sha256').update(await reader(archived)).digest('hex')===expected)return expected;}
  return actual;
 }
 for(const name of evidenceFiles){
  const path=`fixtures/validation/${name}.json`,bytes=await reader(path),record=JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(record.results.failures,0,`${name}: failures`);
  assert.equal(record.results.typecheck,'passed',`${name}: typecheck`);
  assert.ok(Object.keys(record.sha256??{}).length>0,`${name}: missing fingerprints`);
  for(const file of ['src/validation/document.ts','fixtures/validation/field-gate-refresh-evidence.json',...requiredProofs[name]!])assert.ok(Object.hasOwn(record.sha256,file),`${name}: missing required proof ${file}`);
  for(const [file,expected] of Object.entries(record.sha256)){
   assert.ok(!file.startsWith('/')&&!file.split('/').includes('..'),'Evidence path must be relative');
   assert.match(String(expected),/^[0-9a-f]{64}$/);
   const actual=await observedHash(file,String(expected));
   await compare(name,file,String(expected),actual);fingerprints++;
  }
  records.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),record});
 }
 const [,ts,pg,remaining]=records.map(r=>r.record);
 const refreshed=JSON.parse(new TextDecoder().decode(await reader('fixtures/validation/field-gate-refresh-evidence.json')));
 assert.equal(refreshed.regression.failures,0);assert.ok(refreshed.runs.length>=26);
 for(const run of refreshed.runs)assert.equal(run.exitCode,0,`Failed refresh ${run.command}`);
 for(const [file,expected] of Object.entries(refreshed.sha256)){
  await compare('field-gate-refresh-evidence',file,String(expected),await observedHash(file,String(expected)));fingerprints++;
 }
 assert.equal(ts.bead,'umf-97221618-8beaed05');assert.equal(pg.bead,'umf-97221618-920262ff');
 assert.ok(ts.results.nativeFieldOutputsAccepted>0&&ts.results.nativeRecordOutputsAccepted>0);
 assert.ok(pg.results.native.executedFieldProjections>0&&pg.results.native.executedRecordProjections>0);
 for(const system of ['sqlserver','avro','parquet'])assert.ok(remaining.systems[system],`Missing ${system} evidence`);
 assert.equal(remaining.systems.sqlserver.collationGuardChecked,true);
 assert.equal(remaining.systems.avro.floatNarrowingConfirmed,true);
 assert.ok(remaining.systems.parquet.fieldOutputs>0&&remaining.systems.parquet.recordOutputs>0);
 for(const file of ['field-tablespec-classification','field-tablespec-projection']){
  const browser=JSON.parse(new TextDecoder().decode(await reader(`fixtures/validation/${file}.json`)));
  assert.equal(browser.browser,ts.results.browser);assert.deepEqual(browser.externalRequests,[]);
  assert.ok(browser.rows.length>0&&Object.keys(browser.checks).length>0);
 }
 for(const record of [ts.results.browser,...Object.values(pg.results.browser),...Object.values(remaining.systems).flatMap((s:any)=>Object.values(s.browser))]){
  // TableSpec records browser version and its checks separately.
  if(typeof record==='string'){assert.equal(record,refreshed.browser??'148.0.7778.0');continue;}
  const browser=record as any;assert.equal(browser.browser,refreshed.browser??'148.0.7778.0');assert.deepEqual(browser.externalRequests,[]);
  assert.ok(Object.keys(browser.checks).length>0);
 }
 return {records:records.map(({path,sha256})=>({path,sha256})),fingerprints,systems:[...fieldSystems],historicalQualification:unqualified.length?'PARTIALLY_REVALIDATED':'COMPLETE',currentCoreQualification:'UNQUALIFIED' as const,unqualified,artifactRecovery:{path:recoveryPath,archiveSha256:recovery.archiveSha256,outcome:recovery.outcome}};
}

async function recoverAuthored(receipt:AuthoredFieldProjection){
 assert.ok(receipt.target);
 switch(receipt.operation){
  case 'project-field-tablespec':return recoverFieldFromTableSpec(receipt,exportTableSpec(receipt.target));
  case 'project-field-postgresql':return recoverFieldFromPostgresql(receipt,receipt.nativeSql!,backend);
  case 'project-field-sqlserver':return recoverFieldFromSqlServer(receipt,receipt.nativeSql!);
  case 'project-field-avro':return recoverFieldFromAvro(receipt,exportAvroSchema(receipt.target));
  case 'project-field-parquet':return recoverFieldFromParquet(receipt,exportParquetCapture(receipt.target));
 }
}
function recoverNative(receipt:NativeFieldClassification){
 assert.ok(receipt.target);
 switch(receipt.operation){
  case 'classify-tablespec-field':verifyTableSpecFieldClassification(receipt,receipt.target);assert.equal(exportTableSpec(receipt.target),exportTableSpec(receipt.source));break;
  case 'classify-postgresql-field':assert.equal(recoverPostgresqlFieldCapture(receipt,receipt.target),receipt.request.nativeSource);break;
  case 'classify-sqlserver-field':assert.equal(recoverSqlServerFieldCapture(receipt,receipt.target),receipt.request.nativeSource);break;
  case 'classify-avro-field':assertJsonDataEqual(recoverAvroFieldBundle(receipt,receipt.target),{schema:receipt.request.nativeSource,dependencies:receipt.request.dependencies??[]});break;
  case 'classify-parquet-field':assert.deepEqual(recoverParquetFieldBytes(receipt,receipt.target),exportParquetCapture(receipt.source));break;
 }
 // Kind classification must leave every native extension payload untouched.
 assert.equal(receipt.target.extensions===undefined,receipt.source.extensions===undefined);
 if(receipt.source.extensions!==undefined)assertJsonDataEqual(receipt.target.extensions,receipt.source.extensions);
 for(const module of receipt.source.modules)for(const element of module.elements){
  const after:Element|undefined=receipt.target.modules.find(m=>m.id===module.id)?.elements.find(e=>e.id===element.id);
  assert.ok(after,'Native element must survive field classification: '+element.id);
  assertJsonDataEqual(after.extensions,element.extensions);
 }
}

export async function verifyFieldRoundTrips(){
 const coverage=Object.fromEntries(fieldSystems.map(s=>[s,{usefulTargets:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeRecoveries:0,conflictBlocks:0}]));
 for(const row of await fieldReportCases()){
  const report=await inspectFieldProjection(row.receipt,backend),counts=coverage[row.system]!;
  assert.equal(report.status,row.variant==='loss'&&row.receipt.request.mode==='strict'?'blocked':'projected');
  assert.equal(report.mapping.origin,'authored');assertJsonDataEqual(report.mapping.binding,row.receipt.binding);
  if(row.variant==='loss'){
   assert.ok(report.residuals.some(r=>r.sourcePath.endsWith('/future')&&JSON.stringify(r.sourceValue)===JSON.stringify({constraint:'retain',exact:'9007199254740993'})));
  }
  if(report.status==='blocked'){
   assert.equal(row.receipt.target,undefined);assert.ok(!('nativeSql'in row.receipt));counts.strictBlocks++;continue;
  }
  if(row.variant==='clean')counts.usefulTargets++;else counts.reportResiduals++;
  for(const format of ['json','yaml'] as const){
   const receipt=readJsonValue(writeJsonValue(copyJson(row.receipt),format),format) as unknown as AuthoredFieldProjection;
   assertJsonDataEqual(await recoverAuthored(receipt),row.receipt.source);counts.idealRecoveries++;
  }
 }
 for(const input of await classificationReportCases()){
  const report=inspectFieldClassification(input),counts=coverage[input.operation.replace('classify-','').replace('-field','')]!;
  assert.equal(report.mapping.origin,'classified');assertJsonDataEqual(report.mapping.nativeFragment,input.mapping.nativeFragment);
  if(input.status==='blocked'){
   assert.equal(input.target,undefined);assert.ok(report.residuals.some(r=>r.sourceValue==='future-kind'));counts.conflictBlocks++;continue;
  }
  for(const format of ['json','yaml'] as const){
   const receipt=readJsonValue(writeJsonValue(copyJson(input),format),format) as unknown as NativeFieldClassification;
   recoverNative(receipt);counts.nativeRecoveries++;
  }
 }
 for(const system of fieldSystems)assert.deepEqual(coverage[system],{usefulTargets:2,strictBlocks:1,reportResiduals:1,idealRecoveries:6,nativeRecoveries:2,conflictBlocks:2});
 return coverage;
}

if(import.meta.main){
 const evidence=await verifyFieldEvidence(read,{allowUnqualifiedHistorical:true}),roundTrips=await verifyFieldRoundTrips();
 const status=fieldConformanceStatus(evidence);
 const result={...status,nativeEvidenceSystems:[...fieldSystems],
  sourceCoverage:{meaning:'CONTRACT-040 / Element.kind',roundTrips},evidence,
  limits:['Source authoring and round trips do not establish current-core native equivalence','Historical native subsets remain bounded by their original acceptance records']};
 await Bun.write('fixtures/validation/field-conformance.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({...status,systems:fieldSystems.length,fingerprints:evidence.fingerprints,sourceRecoveries:30,nativeRecoveries:10}));
}
