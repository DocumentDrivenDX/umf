import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {fieldReportCases} from './field-report-cases';
import {classificationReportCases} from './classification-report-cases';
import {
 copyJson,readJsonValue,writeJsonValue,exportTableSpec,exportAvroSchema,exportParquetCapture,
 recoverFieldFromTableSpec,recoverFieldFromPostgresql,recoverFieldFromSqlServer,recoverFieldFromAvro,recoverFieldFromParquet,
 recoverPostgresqlFieldCapture,recoverSqlServerFieldCapture,recoverAvroFieldBundle,recoverParquetFieldBytes,
 verifyTableSpecFieldClassification,inspectFieldProjection,inspectFieldClassification,
} from '../../src';
import type {AuthoredFieldProjection} from '../../src/core-ideals/field-report';
import type {NativeFieldClassification} from '../../src/core-ideals/classification-report';
import type {Element} from '../../src/model/types';

export const fieldSystems=['tablespec','postgresql','sqlserver','avro','parquet'] as const;
const evidenceFiles=['field-core-acceptance-evidence','field-tablespec-acceptance-evidence','field-postgresql-acceptance-evidence','remaining-field-bindings-acceptance-evidence'];
const requiredProofs:Record<string,string[]>={
 'field-core-acceptance-evidence':['spec/core/field-document.schema.json','src/model/field-kind.ts','src/model/field-transition.ts','fixtures/validation/core-field-browser.json',
  'spec/core/nullability-document.schema.json','spec/core/kind-operation-v2.schema.json','spec/core/record-type-operation-v2.schema.json',
  'src/model/nullability.ts','src/model/nullability-transition.ts'],
 'field-tablespec-acceptance-evidence':['field-tablespec-classification','field-tablespec-native','field-tablespec-projection','field-tablespec-projection-native'].map(n=>`fixtures/validation/${n}.json`),
 'field-postgresql-acceptance-evidence':['field-postgresql-native','field-postgresql-browser','field-postgresql-projection-native','field-postgresql-projection-browser','postgresql-ddl-kinds-native','postgresql-ddl-kinds-browser'].map(n=>`fixtures/validation/${n}.json`),
 'remaining-field-bindings-acceptance-evidence':[
  ...['sqlserver','avro','parquet'].flatMap(s=>[`field-${s}-native`,`field-${s}-browser`,`field-${s}-projection-native`,`field-${s}-projection-browser`]),
  'avro-record-type-native','avro-record-type-browser','field-avro-fastavro-native',
 ].map(n=>`fixtures/validation/${n}.json`),
};
type Reader=(path:string)=>Promise<Uint8Array>;
const read:Reader=async path=>new Uint8Array(await Bun.file(path).arrayBuffer());
/** Integrity/consistency check of retained evidence, not authentication or a native engine rerun. */
export async function verifyFieldEvidence(reader:Reader=read){
 const records:any[]=[];let fingerprints=0;
 for(const name of evidenceFiles){
  const path=`fixtures/validation/${name}.json`,bytes=await reader(path),record=JSON.parse(new TextDecoder().decode(bytes));
  assert.equal(record.results.failures,0,`${name}: failures`);
  assert.equal(record.results.typecheck,'passed',`${name}: typecheck`);
  assert.ok(Object.keys(record.sha256??{}).length>0,`${name}: missing fingerprints`);
  for(const file of ['src/validation/document.ts','fixtures/validation/field-gate-refresh-evidence.json',...requiredProofs[name]!])assert.ok(Object.hasOwn(record.sha256,file),`${name}: missing required proof ${file}`);
  for(const [file,expected] of Object.entries(record.sha256)){
   assert.ok(!file.startsWith('/')&&!file.split('/').includes('..'),'Evidence path must be relative');
   assert.match(String(expected),/^[0-9a-f]{64}$/);
   const actual=createHash('sha256').update(await reader(file)).digest('hex');
   assert.equal(actual,expected,`${name}: stale ${file}`);fingerprints++;
  }
  records.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),record});
 }
 const [,ts,pg,remaining]=records.map(r=>r.record);
 const refreshed=JSON.parse(new TextDecoder().decode(await reader('fixtures/validation/field-gate-refresh-evidence.json')));
 assert.equal(refreshed.regression.failures,0);assert.ok(refreshed.runs.length>=26);
 for(const run of refreshed.runs)assert.equal(run.exitCode,0,`Failed refresh ${run.command}`);
 for(const [file,expected] of Object.entries(refreshed.sha256)){
  assert.equal(createHash('sha256').update(await reader(file)).digest('hex'),expected,`Stale refresh proof ${file}`);fingerprints++;
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
  if(typeof record==='string'){assert.match(record,/^148\./);continue;}
  const browser=record as any;assert.match(browser.browser,/^148\./);assert.deepEqual(browser.externalRequests,[]);
  assert.ok(Object.keys(browser.checks).length>0);
 }
 return {records:records.map(({path,sha256})=>({path,sha256})),fingerprints,systems:[...fieldSystems]};
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
  case 'classify-avro-field':assert.deepEqual(recoverAvroFieldBundle(receipt,receipt.target),{schema:receipt.request.nativeSource,dependencies:receipt.request.dependencies??[]});break;
  case 'classify-parquet-field':assert.deepEqual(recoverParquetFieldBytes(receipt,receipt.target),exportParquetCapture(receipt.source));break;
 }
 // Kind classification must leave every native extension payload untouched.
 assert.deepEqual(receipt.target.extensions,receipt.source.extensions);
 for(const module of receipt.source.modules)for(const element of module.elements){
  const after:Element|undefined=receipt.target.modules.find(m=>m.id===module.id)?.elements.find(e=>e.id===element.id);
  assert.deepEqual(after?.extensions,element.extensions);
 }
}

export async function verifyFieldRoundTrips(){
 const coverage=Object.fromEntries(fieldSystems.map(s=>[s,{usefulTargets:0,strictBlocks:0,reportResiduals:0,idealRecoveries:0,nativeRecoveries:0,conflictBlocks:0}]));
 for(const row of await fieldReportCases()){
  const report=await inspectFieldProjection(row.receipt,backend),counts=coverage[row.system]!;
  assert.equal(report.status,row.variant==='loss'&&row.receipt.request.mode==='strict'?'blocked':'projected');
  assert.equal(report.mapping.origin,'authored');assert.deepEqual(report.mapping.binding,row.receipt.binding);
  if(row.variant==='loss'){
   assert.ok(report.residuals.some(r=>r.sourcePath.endsWith('/future')&&JSON.stringify(r.sourceValue)===JSON.stringify({constraint:'retain',exact:'9007199254740993'})));
  }
  if(report.status==='blocked'){
   assert.equal(row.receipt.target,undefined);assert.ok(!('nativeSql'in row.receipt));counts.strictBlocks++;continue;
  }
  if(row.variant==='clean')counts.usefulTargets++;else counts.reportResiduals++;
  for(const format of ['json','yaml'] as const){
   const receipt=readJsonValue(writeJsonValue(copyJson(row.receipt),format),format) as unknown as AuthoredFieldProjection;
   assert.deepEqual(await recoverAuthored(receipt),row.receipt.source);counts.idealRecoveries++;
  }
 }
 for(const input of await classificationReportCases()){
  const report=inspectFieldClassification(input),counts=coverage[input.operation.replace('classify-','').replace('-field','')]!;
  assert.equal(report.mapping.origin,'classified');assert.deepEqual(report.mapping.nativeFragment,input.mapping.nativeFragment);
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
 const evidence=await verifyFieldEvidence(),roundTrips=await verifyFieldRoundTrips();
 const result={scope:'Qualified Field ideal gate; native evidence retained and fingerprint-checked, not rerun by this command',
  idealAdmission:{systems:[...fieldSystems],usefulBindings:5,meaning:'CONTRACT-040 / Element.kind',nativeEquivalence:false},
  delivery:{systems:[...fieldSystems],scope:'Published Field binding subsets only; not general native-language conformance'},evidence,roundTrips};
 await Bun.write('fixtures/validation/field-conformance.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({systems:fieldSystems.length,fingerprints:evidence.fingerprints,idealRecoveries:30,nativeRecoveries:10,nativeEquivalence:false}));
}
