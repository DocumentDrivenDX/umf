// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableInventoryMigration,discoverTableInventoryMigrationChanges,verifyTableInventoryMigration,serializeTableInventoryMigration,irreversiblePurgeDisclosure,type TableInventoryMigrationRequest,type TableInventoryDiscoverySelector,type TableInventoryReviewedChangeCandidate} from '../../src/index-node-v4';
const load=async(name:string)=>await Bun.file('crates/umf-codegen/tests/fixtures/'+name).json();
const selector=(request:TableInventoryMigrationRequest):TableInventoryDiscoverySelector=>{
 const o=request.options;
 return {version:'umf.table-inventory-discovery/0.1',tableIntents:o.tableIntents,conversions:o.conversions,retiredSeedSets:o.retiredSeedSets,retirements:o.retirements,restorations:o.restorations,archiveSources:o.archiveSources};
};
for(const file of ['inventory-initial-request.json','inventory-g02-retained-request.json'])test('public Rust inventory compile/discover/serialize/verify '+file,async()=>{
 const request=await load(file) as TableInventoryMigrationRequest;
 const result=compileTableInventoryMigration(request);
 expect(result.status,JSON.stringify(result)).toBe('compiled');
 if(result.status!=='compiled')throw new Error('Expected compiled inventory');
 expect(verifyTableInventoryMigration(result.plan,request.history)).toEqual(result.plan);
 expect(JSON.parse(serializeTableInventoryMigration(result.plan,request.history))).toEqual(result.plan);
 const changes=discoverTableInventoryMigrationChanges(request.previous,request.next,selector(request),request.history);
 expect(changes.map(change=>change.id)).toEqual(request.options.reviewedChanges.map(change=>change.id));
 const changed=structuredClone(result.plan) as unknown as Record<string,unknown>;changed.unknown=true;
 expect(()=>verifyTableInventoryMigration(changed,request.history)).toThrow();
},120000);
test('public Rust inventory purge disclosure preserves current irreversible warning',async()=>{
 const removal=await load('inventory-removal-request.json');
 const candidate=removal.candidates.find((candidate:TableInventoryReviewedChangeCandidate)=>candidate.kind==='table-removal-effects');
 expect(irreversiblePurgeDisclosure(candidate)).toMatchObject({code:'IRREVERSIBLE_TABLE_PURGE',markerId:candidate.id,path:candidate.path});
});
