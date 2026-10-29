// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {projectG10BundleWithAccounting} from '../../src/table-migration/inventory-projection';
import {consumeVerifiedG10Deployment,verifyAndRememberG10Deployment} from '../../src/table-migration/inventory-verified-deployment';
import {validateG10RequestShape} from '../../src/table-migration/inventory-options';
import {R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {verifyG10BundleForLineage,verifyG10BundleForShape,verifyScopedG10SourceBundle,withVerifiedG10BundleScope} from '../../src/table-migration/inventory-verified-deployment';

const configuration={module:'demo',schema:'verified_demo',ownerRole:'verified_owner',personRole:'verified_person',batchRole:'verified_batch',groupRoles:{}};
function bundle(){
 const compiled=compileTableDeployment({text:JSON.stringify(fixture),configuration});
 if(compiled.status!=='compiled')throw new Error(JSON.stringify(compiled.diagnostics));
 return compiled.bundle;
}
function seededBundle(){
 const source=JSON.parse(bundle().source.utf8) as any;
 source.modules[0]!.extensions['umf.tables'].seedSets.push({id:'verified-note-seed',conflict:'error',rows:[{table:'notes',values:[{field:{module:'demo',element:'id'},value:{string:'note-1'}},{field:{module:'demo',element:'owner'},value:{string:'person-1'}}]}]});
 const compiled=compileTableDeployment({text:JSON.stringify(source),configuration});
 if(compiled.status!=='compiled')throw new Error(JSON.stringify(compiled.diagnostics));
 return compiled.bundle;
}
function request(next:ReturnType<typeof bundle>){
 return {id:'verified-bundle-reuse',predecessor:null,previous:null,next,options:{version:'umf.table-inventory-migration-options/0.1',tableIntents:[],backfills:[],defaultChanges:[],conversions:[],concurrentIndexes:[],validations:[],reviewedChanges:[],seedSets:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[]},history:{profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]}};
}

test('metered G10 admission can consume only its own completed exact bundle verification once',()=>{
 const meter=new R2WorkMeter(),validated=validateG10RequestShape(request(bundle()),undefined,meter);
 const copied={...validated.next};
 expect(consumeVerifiedG10Deployment(copied,meter,'/next')).toBeUndefined();
 expect(consumeVerifiedG10Deployment(validated.next,new R2WorkMeter(),'/next')).toBeUndefined();
 const verified=consumeVerifiedG10Deployment(validated.next,meter,'/next');
 expect(verified?.bundle).toBe(validated.next);
 expect(verified?.document.modules[0]?.id).toBe('demo');
 expect(verified?.operations.length).toBeGreaterThan(0);
 expect(consumeVerifiedG10Deployment(validated.next,meter,'/next')).toBeUndefined();

 const secondMeter=new R2WorkMeter(),remembered=verifyAndRememberG10Deployment(bundle(),secondMeter);
 expect(Object.hasOwn(remembered,'document')).toBe(false);
 expect(Object.hasOwn(remembered,'operations')).toBe(false);
 expect(consumeVerifiedG10Deployment(remembered,secondMeter,'/next')?.document.modules[0]?.id).toBe('demo');
});

test('changed or unsuccessfully verified bundles cannot borrow a completed verification result',()=>{
 const meter=new R2WorkMeter(),validated=validateG10RequestShape(request(bundle()),undefined,meter);
 validated.next.bundleDigest='f'.repeat(64);
 expect(()=>consumeVerifiedG10Deployment(validated.next,meter,'/next')).toThrow('R2_VERIFIED_BUNDLE_CHANGED:/next');

 const failedMeter=new R2WorkMeter(),invalid={...bundle(),bundleDigest:'0'.repeat(64)};
 expect(()=>validateG10RequestShape(request(invalid),undefined,failedMeter)).toThrow();
 expect(consumeVerifiedG10Deployment(invalid,failedMeter,'/next')).toBeUndefined();
});


test('lineage reuse is full-verification-backed, invocation-local, and bundle-only',()=>{
 const original=bundle(),equalCopy=structuredClone(original),meter=new R2WorkMeter();
 withVerifiedG10BundleScope(meter,()=>{
  const oneShot=verifyAndRememberG10Deployment(original,meter);
  const completed=consumeVerifiedG10Deployment(oneShot,meter,'/producer');
  expect(completed).toBeDefined();
  Object.assign(oneShot,{bundleDigest:'f'.repeat(64)});
  if(completed?.document.modules[0])Object.assign(completed.document.modules[0],{id:'mutated'});
  completed?.operations.splice(0);

  const hit=verifyG10BundleForLineage(equalCopy,meter,'/lineage/first');
  const secondIndependentCopy=structuredClone(equalCopy),sameHit=verifyG10BundleForLineage(secondIndependentCopy,meter,'/lineage/second');
  expect(hit).toBe(sameHit);
  expect(hit.bundleDigest).toBe(equalCopy.bundleDigest);
  expect(Object.isFrozen(hit)).toBe(true);
  expect(Object.isFrozen(hit.source)).toBe(true);
  expect(hit).not.toBe(equalCopy);
 });
});

test('lineage reuse requires exact owned bytes, rejects accessors, and never crosses meters or invocations',()=>{
 const valid=seededBundle(),meter=new R2WorkMeter();
 let resident:ReturnType<typeof verifyG10BundleForLineage>|undefined;
 withVerifiedG10BundleScope(meter,()=>{
  verifyAndRememberG10Deployment(valid,meter);
  resident=verifyG10BundleForLineage(structuredClone(valid),meter,'/same-invocation');
  const changed=[
   (()=>{const v=structuredClone(valid);v.source.utf8+=' ';return v;})(),
   (()=>{const v=structuredClone(valid);v.configuration.schema+='x';return v;})(),
   (()=>{const v=structuredClone(valid);if(v.steps[0])Object.assign(v.steps[0],{sql:`${'sql'in v.steps[0]?String(v.steps[0].sql):''} `});return v;})(),
   (()=>{const v=structuredClone(valid);if(v.expectedCatalog.columns[0])Object.assign(v.expectedCatalog.columns[0],{nullable:!v.expectedCatalog.columns[0].nullable});return v;})(),
   (()=>{const v=structuredClone(valid);if(v.seedSets[0])Object.assign(v.seedSets[0],{id:`${v.seedSets[0].id}-changed`});return v;})(),
  ];
  for(let index=0;index<changed.length;index++)expect(()=>verifyG10BundleForLineage(changed[index]!,meter,`/changed/${index}`)).toThrow();

  let getterCalls=0;const accessor=structuredClone(valid);
  Object.defineProperty(accessor.source,'utf8',{get(){getterCalls++;return valid.source.utf8;},enumerable:true,configurable:true});
  expect(()=>verifyG10BundleForLineage(accessor,meter,'/accessor')).toThrow();
  expect(getterCalls).toBe(0);

  const foreignMeter=new R2WorkMeter();
  const foreign=withVerifiedG10BundleScope(foreignMeter,()=>verifyG10BundleForLineage(structuredClone(valid),foreignMeter,'/foreign'));
  expect(foreign).not.toBe(resident);
 });
 if(resident===undefined)throw new Error('same-invocation lineage result missing');
 const nextInvocation=withVerifiedG10BundleScope(meter,()=>verifyG10BundleForLineage(structuredClone(valid),meter,'/new-invocation'));
 expect(nextInvocation).not.toBe(resident);
 expect(Object.isFrozen(nextInvocation)).toBe(true);
});

test('failed lineage verification does not seed a later retry',()=>{
 const valid=bundle(),invalid=structuredClone(valid),meter=new R2WorkMeter();invalid.bundleDigest='0'.repeat(64);
 withVerifiedG10BundleScope(meter,()=>{
  expect(()=>verifyG10BundleForLineage(invalid,meter,'/failed-first')).toThrow();
  expect(()=>verifyG10BundleForLineage(invalid,meter,'/failed-retry')).toThrow();
 });
});

test('fixed G02 source reuse is exact, meter-local, and falls back to full verification',()=>{
 const valid=bundle(),meter=new R2WorkMeter(),foreignMeter=new R2WorkMeter();let resident:ReturnType<typeof verifyScopedG10SourceBundle>|undefined,foreign:ReturnType<typeof verifyScopedG10SourceBundle>|undefined;
 withVerifiedG10BundleScope(meter,()=>{
  verifyAndRememberG10Deployment(valid,meter);
  const sameScope=verifyScopedG10SourceBundle(structuredClone(valid),meter,'/g02/previous');resident=sameScope;
  expect(Object.isFrozen(sameScope)).toBe(true);
  expect(Object.hasOwn(sameScope,'document')).toBe(false);
  expect(Object.hasOwn(sameScope,'operations')).toBe(false);
  expect(consumeVerifiedG10Deployment(sameScope,meter,'/g02/previous')).toBeUndefined();
  const changed=structuredClone(valid);changed.source.utf8+=' ';
  expect(()=>verifyScopedG10SourceBundle(changed,meter,'/g02/changed')).toThrow();
  foreign=withVerifiedG10BundleScope(foreignMeter,()=>verifyScopedG10SourceBundle(structuredClone(valid),foreignMeter,'/g02/foreign'));
  expect(foreign).not.toBe(sameScope);expect(foreign.bundleDigest).toBe(valid.bundleDigest);
 });
 if(!resident)throw new Error('same-scope verified bundle missing');
 if(!foreign)throw new Error('foreign-meter full verification missing');
 const outside=verifyScopedG10SourceBundle(structuredClone(valid),new R2WorkMeter(),'/g02/outside-scope');
 expect(outside.bundleDigest).toBe(valid.bundleDigest);expect(outside).not.toBe(resident);
 const invalid=structuredClone(valid);invalid.bundleDigest='0'.repeat(64);
 expect(()=>verifyScopedG10SourceBundle(invalid,new R2WorkMeter(),'/g02/invalid-outside')).toThrow();
});


test('metered shape reuse returns only a cached frozen bundle and does not renew one-shot auxiliaries',()=>{
 const original=bundle(),meter=new R2WorkMeter();
 withVerifiedG10BundleScope(meter,()=>{
  const produced=verifyAndRememberG10Deployment(original,meter);
  expect(consumeVerifiedG10Deployment(produced,meter,'/producer')).toBeDefined();
  const hit=verifyG10BundleForShape(structuredClone(original),meter,'/shape-hit');
  expect(hit).not.toBe(original);
  expect(Object.isFrozen(hit)).toBe(true);
  expect(Object.hasOwn(hit,'document')).toBe(false);
  expect(Object.hasOwn(hit,'operations')).toBe(false);
  expect(consumeVerifiedG10Deployment(hit,meter,'/shape-hit')).toBeUndefined();
 });
});

test('shape miss keeps a genuine complete verifier result available to projection fallback',()=>{
 const original=bundle(),meter=new R2WorkMeter();
 withVerifiedG10BundleScope(meter,()=>{
  const producer=verifyAndRememberG10Deployment(original,meter);
  expect(consumeVerifiedG10Deployment(producer,meter,'/shape-fallback-producer')).toBeDefined();
  const hit=verifyG10BundleForShape(structuredClone(original),meter,'/shape-hit-without-auxiliaries');
  expect(consumeVerifiedG10Deployment(hit,meter,'/shape-hit-without-auxiliaries')).toBeUndefined();
  const projected=projectG10BundleWithAccounting(hit,'next',meter);
  expect(projected.document.modules[0]?.id).toBe('demo');
  expect(projected.projection.rendererOperations.length).toBeGreaterThan(0);
  expect(projected.bundle.bundleDigest).toBe(hit.bundleDigest);
  expect(projected.bundle).not.toBe(hit);
 });
});

test('shape reuse remains exact, descriptor-safe, and local to its meter and invocation',()=>{
 const valid=seededBundle(),meter=new R2WorkMeter();
 let resident:ReturnType<typeof verifyG10BundleForShape>|undefined;
 withVerifiedG10BundleScope(meter,()=>{
  verifyAndRememberG10Deployment(valid,meter);
  resident=verifyG10BundleForShape(structuredClone(valid),meter,'/shape-resident');
  const changed=[
   (()=>{const v=structuredClone(valid);v.source.utf8+=' ';return v;})(),
   (()=>{const v=structuredClone(valid);v.configuration.schema+='x';return v;})(),
   (()=>{const v=structuredClone(valid);if(v.steps[0])Object.assign(v.steps[0],{sql:`${'sql'in v.steps[0]?String(v.steps[0].sql):''} `});return v;})(),
   (()=>{const v=structuredClone(valid);if(v.expectedCatalog.columns[0])Object.assign(v.expectedCatalog.columns[0],{nullable:!v.expectedCatalog.columns[0].nullable});return v;})(),
   (()=>{const v=structuredClone(valid);if(v.seedSets[0])Object.assign(v.seedSets[0],{id:`${v.seedSets[0].id}-changed`});return v;})(),
  ];
  for(let index=0;index<changed.length;index++)expect(()=>verifyG10BundleForShape(changed[index]!,meter,`/shape-changed/${index}`)).toThrow();
  let getterCalls=0;const accessor=structuredClone(valid);
  Object.defineProperty(accessor.source,'utf8',{get(){getterCalls++;return valid.source.utf8;},enumerable:true,configurable:true});
  expect(()=>verifyG10BundleForShape(accessor,meter,'/shape-accessor')).toThrow();expect(getterCalls).toBe(0);
  const foreignMeter=new R2WorkMeter();
  const foreign=withVerifiedG10BundleScope(foreignMeter,()=>verifyG10BundleForShape(structuredClone(valid),foreignMeter,'/shape-foreign'));
  expect(foreign).not.toBe(resident);
 });
 if(resident===undefined)throw new Error('same-invocation shape result missing');
 const next=withVerifiedG10BundleScope(meter,()=>verifyG10BundleForShape(structuredClone(valid),meter,'/shape-next-invocation'));
 expect(next).not.toBe(resident);
 const invalid=structuredClone(valid);invalid.bundleDigest='0'.repeat(64);const retryMeter=new R2WorkMeter();
 withVerifiedG10BundleScope(retryMeter,()=>{
  expect(()=>verifyG10BundleForShape(invalid,retryMeter,'/shape-failed-first')).toThrow();
  expect(()=>verifyG10BundleForShape(invalid,retryMeter,'/shape-failed-retry')).toThrow();
 });
 const missingDigest=structuredClone(valid) as Partial<typeof valid>;
 delete missingDigest.bundleDigest;
 const missingDigestMeter=new R2WorkMeter();
 withVerifiedG10BundleScope(missingDigestMeter,()=>{
  verifyAndRememberG10Deployment(valid,missingDigestMeter);
  expect(()=>verifyG10BundleForShape(missingDigest as typeof valid,missingDigestMeter,'/shape-missing-digest')).toThrow();
 });
});
