// SPDX-License-Identifier: MIT OR Apache-2.0
/** Separate ideal-admission and qualified five-target delivery decision, following CONTRACT-040/076. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectBit128Model,recoverBit128ModelProjection} from '../../src/projections/bit128-model';
import {uuidModel} from '../../tests/helpers/uuid-model-fixtures';
export const uuidSystems=['postgresql','sqlserver','avro','parquet','tablespec'] as const;
export async function verifyUuidFingerprints(record:any){
 assert.ok(record.fingerprints&&Object.keys(record.fingerprints).length>0,'Missing source-bound proof closure');
 for(const pattern of ['src/**/*.ts','spec/**/*.json','scripts/uuid/*','fixtures/validation/uuid/model-files/*'])for await(const path of new Bun.Glob(pattern).scan('.'))assert.ok(Object.hasOwn(record.fingerprints,path),'Missing proof source: '+path);
 for(const path of ['package.json','bun.lock','native/postgresql/runtime.ts','native/sqlserver/catalog-v3.sql','scripts/uuid-browser.ts','fixtures/validation/uuid/bit128-oracle.json','fixtures/validation/uuid/native-adapter-roundtrips.json','fixtures/validation/uuid/postgresql-model.json','fixtures/validation/uuid/sqlserver-model.json','fixtures/validation/uuid/model-browser.json','fixtures/validation/uuid/returned-verification.json','fixtures/validation/uuid/file-model-artifacts.json','fixtures/validation/uuid/file-model-returned.json','fixtures/validation/uuid/tablespec-model-returned.json'])assert.ok(Object.hasOwn(record.fingerprints,path),'Missing native proof: '+path);
 for(const [path,hash] of Object.entries(record.fingerprints)){
  assert.ok(!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').includes('..'),'Unsafe evidence path');
  const actual=createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');assert.equal(actual,hash,'Stale proof: '+path);
 }
}
export function evaluateUuidAdmission(qualification:any,native:any){
 assert.equal(qualification.profile,'uuid-model1');assert.equal(qualification.boundedModelQualification,true);assert.equal(qualification.twoDatabaseValueAndNativeUuidClassificationGate,true);assert.equal(qualification.fiveTargetModelValueDeliveryGate,true);
 assert.equal(qualification.databases.length,2);assert.deepEqual(qualification.databases.map((x:any)=>x.system),['postgresql','sqlserver']);for(const db of qualification.databases){assert.match(db.version,db.system==='postgresql'?/^PostgreSQL 17\.9 /:/^16\./);assert.equal(db.cases,7);assert.equal(db.exactValueRecoveries,2709);}
 assert.equal(qualification.fileCases,16);assert.equal(qualification.fileChecks,8978);assert.equal(qualification.sparkRows,780);assert.equal(qualification.returnedNativeRows,9750);assert.equal(qualification.returnedNativeRefusals,4);
 assert.equal(qualification.browser.models,18);assert.equal(qualification.browser.checks,7038);assert.equal(qualification.browser.refusals,18);assert.equal(qualification.browser.nodeGlobalsAbsent,true);
 assert.equal(native.recoveries,128);assert.equal(native.cases.length,32);
 const delivery=Object.fromEntries(uuidSystems.map(system=>{const cases=native.cases.filter((c:any)=>c.system===system);assert.equal(cases.length,system==='tablespec'?2:system==='parquet'?9:7);for(const c of cases){assert.equal(c.authoredRecoveries,2);assert.equal(c.nativeRecoveries,2);}return [system,{cases:cases.length,authoredRecoveries:cases.length*2,nativeRecoveries:cases.length*2}];}));
 for(const system of ['avro','parquet'])assert.equal(native.cases.find((c:any)=>c.system===system&&c.kind==='native-uuid').classification.scalarType,'uuid');
 for(const name of ['typecheck','build','schemas','tests','bindingRegression','postgresql','sqlserver','artifacts','files','tablespec','nativeAdapters','returned','browser','coreBrowser'])assert.equal(qualification.commands[name],0);
 return {idealAdmitted:true,priorityDelivery:true,nativeEquivalence:false,consumerRuntimeAdoption:false,usefulSystems:['postgresql','sqlserver'],delivery};
}
export function verifyUuidConflictBoundaries(){
 const counts:Record<string,number>={};
 for(const system of uuidSystems){let refused=0;const reject=(f:()=>unknown)=>{assert.throws(f);refused++;};
  const base=uuidModel(system==='tablespec'?'uuid-text':'words64',system),r=projectBit128Model(base.binding,base.logical,'report');assert.ok(r.candidate);
  reject(()=>recoverBit128ModelProjection(r,r.candidate!.text+' '));
  const missing=structuredClone(base);(missing.binding.extensions!['umf.binding'] as any).fields.pop();reject(()=>projectBit128Model(missing.binding,missing.logical,'report'));
  const collision=structuredClone(base);const fields=(collision.binding.extensions!['umf.binding'] as any).fields;fields[2].carrier=structuredClone(fields[1].carrier);reject(()=>projectBit128Model(collision.binding,collision.logical,'report'));
  const unknown=structuredClone(base);unknown.logical.modules[0]!.elements[4]!.futureMeaning={doNotDiscard:true};reject(()=>projectBit128Model(unknown.binding,unknown.logical,'report'));
  if(['avro','parquet','tablespec'].includes(system))assert.equal(projectBit128Model(base.binding,base.logical,'strict').status,'blocked');
  counts[system]=refused;
 }
 return counts;
}
export async function verifyUuidConformance(){
 const q=await Bun.file('fixtures/validation/uuid/model-qualification.json').json();await verifyUuidFingerprints(q);
 const native=await Bun.file('fixtures/validation/uuid/native-adapter-roundtrips.json').json(),result=evaluateUuidAdmission(q,native),conflicts=verifyUuidConflictBoundaries();await verifyUuidFingerprints(q);
 return {...result,scope:'Qualified uuid/bits128 singular Record/Key/carrier ideal admission and five-priority delivery under uuid-model1; no universal adapter equivalence',conflicts,limits:[
  'This accepts the versioned128-bit concept and its declared carrier/model subset, not composition of every earlier scalar/container/group/partition or association layout.',
  'File/model targets retain explicit uniqueness, relationship, index, string-grammar and default/refinement residuals. Native canonical strings and pair groups do not invent engine constraints.',
  'SQL observations qualify full-row operations in the tested native sessions. Independent half writes, other isolation modes and deployed consumer migrations require their own qualification.',
  'Portable unsigned byte comparison is distinct from native UUID/signed-pair index order; ordering remains explicit rather than silently reinterpreted.',
  'Native replacement/equivalence, UUID generation, performance optimality and Truss/Weft adoption are not admitted.'
 ]};
}
if(import.meta.main){const result=await verifyUuidConformance();await Bun.write('fixtures/validation/uuid/conformance.json',JSON.stringify(result,null,2)+'\n');console.log(result);}
