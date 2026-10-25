// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {consumeVerifiedG10Deployment,verifyAndRememberG10Deployment} from '../../src/table-migration/inventory-verified-deployment';
import {validateG10RequestShape} from '../../src/table-migration/inventory-options';
import {R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {verifyG10BundleForLineage,withVerifiedG10BundleScope} from '../../src/table-migration/inventory-verified-deployment';

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
