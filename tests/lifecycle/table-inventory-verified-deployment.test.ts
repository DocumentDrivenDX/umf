// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {consumeVerifiedG10Deployment,verifyAndRememberG10Deployment} from '../../src/table-migration/inventory-verified-deployment';
import {validateG10RequestShape} from '../../src/table-migration/inventory-options';
import {R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'verified_demo',ownerRole:'verified_owner',personRole:'verified_person',batchRole:'verified_batch',groupRoles:{}};
function bundle(){
 const compiled=compileTableDeployment({text:JSON.stringify(fixture),configuration});
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
