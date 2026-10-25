// SPDX-License-Identifier: MIT OR Apache-2.0
import {beforeAll,describe,expect,test} from 'bun:test';
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {UmfError} from '../../src/model/errors';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,compileTableInventoryMigration,discoverTableInventoryMigrationChanges,irreversiblePurgeDisclosure,serializeTableInventoryMigration,verifyTableInventoryMigration} from '../../src/table-migration';
import {compileG10InventoryPlan,createHistoricalG10Verifier} from '../../src/table-migration/inventory';
import {partitionRendererDependencies,verifySourcePublicationCoverage} from '../../src/table-migration/inventory-effects';
import {deriveInventorySeedLineage} from '../../src/table-migration/inventory-history';
import {R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import {inspectR2InventorySourceContext,prepareR2InventorySourceContext} from '../../src/table-migration/inventory';
import {projectG10Bundle} from '../../src/table-migration/inventory-source';
import {partitionInventoryMarkersForG02,sameSourceExceptG02AndCreates} from '../../src/table-migration/inventory-g02-source';
import {consumeTableMigrationChangesBounded} from '../../src/table-migration/reviewed';
import {legalSource} from './legal-fixture';
import {legalG10MixedSources,mixedCreatedTableSeedCommand,mixedCreatedTableSeedSet} from './g10-mixed-create-g02-fixture';
import type {TableInventoryMigrationOptions,TableInventorySourceHistory} from '../../src/table-migration';

const config={module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}};
const deploy=(document:unknown)=>{
 const result=compileTableDeployment({text:JSON.stringify(document),configuration:config});
 if(result.status!=='compiled')throw new Error('Original deployment source refused: '+JSON.stringify(result.diagnostics));
 return result.bundle;
};
const emptyHistory:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]};
const options=(tableIntents:TableInventoryMigrationOptions['tableIntents'],reviewedChanges:TableInventoryMigrationOptions['reviewedChanges'],retiredSeedSets:string[]=[]):TableInventoryMigrationOptions=>({
 version:'umf.table-inventory-migration-options/0.1',tableIntents,backfills:[],defaultChanges:[],conversions:[],concurrentIndexes:[],validations:[],reviewedChanges,seedSets:[],retiredSeedSets,retirements:[],restorations:[],archiveSources:[],
});
const selector=(tableIntents:TableInventoryMigrationOptions['tableIntents'],retiredSeedSets:string[]=[])=>({
 version:'umf.table-inventory-discovery/0.1' as const,
 tableIntents:tableIntents.map(intent=>intent.kind==='create'?intent:{kind:'remove' as const,table:intent.table,record:intent.record,disposition:{mode:'irreversible-purge' as const}}),
 conversions:[],retiredSeedSets,retirements:[],restorations:[],archiveSources:[],
});
function originalHistory(bundle:ReturnType<typeof deploy>):TableInventorySourceHistory{
 const result=compileTableMigration({id:'inventory-history-initial',predecessor:null,previous:null,next:bundle});
 if(result.status!=='compiled')throw new Error('Original initial migration refused: '+JSON.stringify(result.diagnostics));
 const entryDigest='c'.repeat(64),selected=result.plan.seedExecution==='none'?[]:result.plan.seedExecution.sets;
 if(selected.length&&(result.plan.version!=='umf.table-migration/0.1'||(result.plan.phases?.length??0)!==0))throw new Error('Synthetic legacy seed history supports only an unphased 0.1 atomic initial plan.');
 // This is source-history test metadata only. It satisfies the legacy lineage
 // shape without claiming that a native seed execution or receipt occurred.
 const seedOutcomes=selected.map(id=>{const definition=bundle.seedSets.find(seed=>seed.id===id);if(!definition)throw new Error('Legacy initial plan selected an unknown seed set.');return {id,definitionDigest:hashCanonical(definition),originalSourceDigest:bundle.sourceDigest,execution:'confirmed' as const,proof:{kind:'atomic-publication' as const,entryDigest}};});
 return {profile:'umf.table-inventory-source-history/0.1',plans:[result.plan],executions:[{planDigest:result.plan.digest,entryDigest,seedOutcomes}]};
}
function seedExecution(plan:any,bundle:ReturnType<typeof deploy>,entryDigest:string){
 const sets=plan.seedExecution==='none'?[]:plan.seedExecution.sets;
 if(!sets.length)return {planDigest:plan.digest,entryDigest,seedOutcomes:[]};
 const seedStep=plan.steps.find((step:any)=>step.operation==='apply-seeds');
 if(!seedStep)throw new Error('Selected G10 seed history lacks its source-derived seed step.');
 const phase=plan.phases.find((item:any)=>item.steps.includes(seedStep.id));
 if(!phase)throw new Error('Selected G10 seed history lacks its source-derived phase.');
 const phaseSteps=phase.steps.map((id:string)=>plan.steps.find((step:any)=>step.id===id));
 if(phaseSteps.some((step:any)=>!step))throw new Error('Selected G10 seed phase references an unknown step.');
 const phaseDigest=hashCanonical({phase,steps:phaseSteps});
 const seedOutcomes=sets.map((id:string)=>{const definition=bundle.seedSets.find(item=>item.id===id);if(!definition)throw new Error('G10 seed history selected an unknown source definition.');return {id,definitionDigest:hashCanonical(definition),originalSourceDigest:bundle.sourceDigest,execution:'confirmed' as const,proof:{kind:'phase' as const,phaseId:phase.id,phaseDigest,phaseReceiptDigest:'d'.repeat(64),entryDigest}};});
 return {planDigest:plan.digest,entryDigest,seedOutcomes};
}
function initialG10History(bundle:ReturnType<typeof deploy>,id='inventory-g10-history-initial',seedSets:string[]=[]):TableInventorySourceHistory{
 const tableIntents=bundle.expectedCatalog.tables.map(table=>({kind:'create' as const,table:table.id,record:{...table.record}}));
 const candidates=discoverTableInventoryMigrationChanges(null,bundle,selector(tableIntents),emptyHistory);
 const planOptions=options(tableIntents,candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker));planOptions.seedSets=[...seedSets];
 const result=compileTableInventoryMigration({id,predecessor:null,previous:null,next:bundle,options:planOptions,history:emptyHistory});
 if(result.status!=='compiled'){
  compileG10InventoryPlan({id,predecessor:null,previous:null,next:bundle,options:planOptions,history:emptyHistory});
  throw new Error('Original G10 initial plan refused: '+JSON.stringify(result.diagnostics));
 }
 return {profile:'umf.table-inventory-source-history/0.1',plans:[result.plan],executions:[seedExecution(result.plan,bundle,'c'.repeat(64))]};
}
function appendArchiveTable(source:any,id='api_archive'){
 const module=source.modules[0]!,payload=module.extensions['umf.tables'];
 const field={module:'legal_lifecycle',element:`${id}_id`},record={module:'legal_lifecycle',element:id};
 module.elements.push({id:field.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 module.elements.push({id,kind:'record',members:[field],keys:[{id:'primary',name:'primary',primary:true,fields:[field]}],extensions:{}});
 payload.tables.push({id,record,name:id,columns:[{field,name:'id',nativeType:{kind:'int4'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:{select:{kind:'deny'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}},batch:{select:{kind:'deny'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}}}});
 return {table:id,record};
}

test('G10 public initial compile, full verification and serialization retain the exact marker wrapper',()=>{
 const next=deploy(legalSource()),tableIntents=next.expectedCatalog.tables.map(table=>({kind:'create' as const,table:table.id,record:{...table.record}}));
 const candidates=discoverTableInventoryMigrationChanges(null,next,selector(tableIntents),emptyHistory);
 expect(candidates).toHaveLength(tableIntents.length);
 expect(candidates.every(candidate=>candidate.kind==='create-table'&&candidate.oldValue===null&&candidate.oldPath===null&&typeof candidate.newPath==='string')).toBe(true);
 const request={id:'inventory-api-initial',predecessor:null,previous:null,next,options:options(tableIntents,candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history:emptyHistory};
 const result=compileTableInventoryMigration(request);
 if(result.status!=='compiled'){
  // Preserve the public response while exposing the lowerer error in this test.
  compileG10InventoryPlan(request);
  throw new Error(JSON.stringify(result.diagnostics));
 }
 expect(result.plan.review).toEqual(candidates);
 expect(verifyTableInventoryMigration(result.plan,emptyHistory)).toEqual(result.plan);
 expect(result.plan.steps.some(step=>step.operation==='apply-seeds')).toBe(false);
 expect((result.plan.prefixes.at(-1) as any).seedStates.every((seed:any)=>seed.execution==='not-run')).toBe(true);
 const serialized=serializeTableInventoryMigration(result.plan,emptyHistory);
 expect(JSON.parse(serialized)).toEqual(result.plan);
 expect(serialized.endsWith('\n')).toBe(false);
 const reordered={...request,options:{...request.options,reviewedChanges:[...request.options.reviewedChanges].reverse()}};
 expect(compileTableInventoryMigration(reordered).status).toBe('blocked');
 const rehashedMutation=structuredClone(result.plan) as any;rehashedMutation.review[0]!.newValue.table='forged';delete rehashedMutation.digest;rehashedMutation.digest=hashCanonical(rehashedMutation);
 expect(()=>verifyTableInventoryMigration(rehashedMutation,emptyHistory)).toThrow();
 expect(()=>serializeTableInventoryMigration(rehashedMutation,emptyHistory)).toThrow();
});

test('G10 dependency projection claims every raw edge as physical work or a complete-source publication obligation',()=>{
 const bundle=deploy(legalSource()),projection=projectG10Bundle(bundle,'next').projection,partition=partitionRendererDependencies(bundle,projection);
 expect(partition.physicalEdges.length+partition.publicationObligations.length).toBe(projection.dependencies.length);
 expect(partition.publicationObligations.some(item=>item.ownerKind==='operation'&&item.ownerId==='read_matters')).toBe(true);
 expect(partition.publicationObligations.some(item=>item.ownerKind==='seed-set'&&item.ownerId==='synthetic-bootstrap')).toBe(true);
 expect(projection.operations.some(item=>item.identity.kind==='operation'&&(item.meaning as any).operation.body.kind==='read')).toBe(true);
 expect(()=>verifySourcePublicationCoverage(bundle,partition.publicationObligations)).not.toThrow();
 expect(()=>verifySourcePublicationCoverage(bundle,[])).toThrow();
 expect(()=>verifySourcePublicationCoverage(bundle,[...partition.publicationObligations,structuredClone(partition.publicationObligations[0]!)] )).toThrow();
 const wrongTarget=structuredClone(partition.publicationObligations),originalTargetDigest=hashCanonical(wrongTarget[0]!.targetIdentity),otherTable=projection.catalog.tables.find(row=>hashCanonical(row.identity)!==originalTargetDigest);
 expect(otherTable).toBeDefined();expect(hashCanonical(otherTable!.identity)).not.toBe(originalTargetDigest);wrongTarget[0]!.targetIdentity=structuredClone(otherTable!.identity);expect(()=>verifySourcePublicationCoverage(bundle,wrongTarget)).toThrow();
 for(const mutate of [
  (copy:any)=>{copy.dependencies[0]!.reason='unrecognized-reason';},
  (copy:any)=>{copy.dependencies[0]!.sourcePath='/forged/source';},
  (copy:any)=>{copy.dependencies[0]!.to='0'.repeat(64);},
  (copy:any)=>{copy.operations[0]!.identity.kind='unrecognized-owner';},
  (copy:any)=>{copy.dependencies.pop();},
  (copy:any)=>{copy.dependencies.push(structuredClone(copy.dependencies[0]!));},
  (copy:any)=>{const edge=copy.dependencies.find((item:any)=>item.reason==='operation-requires-table');if(!edge)throw new Error('Test fixture lacks an operation-to-table edge.');const alternate=copy.catalog.tables.find((row:any)=>hashCanonical(row.identity)!==edge.to);if(!alternate||hashCanonical(alternate.identity)===edge.to)throw new Error('Test fixture lacks an alternate source table.');edge.to=hashCanonical(alternate.identity);},
  (copy:any)=>{copy.dependencies.push({from:'f'.repeat(64),to:copy.dependencies[0]!.to,reason:'owned-by-table',sourcePath:copy.dependencies[0]!.sourcePath,state:'present'});},
 ]){const changed=structuredClone(projection);mutate(changed);expect(()=>partitionRendererDependencies(bundle,changed)).toThrow();}
});

test('legacy seed history requires exact source-derived reported outcomes and remains explicitly non-native',()=>{
 const bundle=deploy(legalSource()),history=originalHistory(bundle),request={previous:bundle,next:bundle,options:{seedSets:[],retiredSeedSets:[]}};
 expect(deriveInventorySeedLineage(history,request).every(item=>item.execution==='confirmed')).toBe(true);
 const missing=structuredClone(history);missing.executions[0]!.seedOutcomes=[];expect(()=>deriveInventorySeedLineage(missing,request)).toThrow();
 const duplicate=structuredClone(history);duplicate.executions[0]!.seedOutcomes.push(structuredClone(duplicate.executions[0]!.seedOutcomes[0]!));expect(()=>deriveInventorySeedLineage(duplicate,request)).toThrow();
 const wrongDefinition=structuredClone(history);wrongDefinition.executions[0]!.seedOutcomes[0]!.definitionDigest='d'.repeat(64);expect(()=>deriveInventorySeedLineage(wrongDefinition,request)).toThrow();
 const wrongOrigin=structuredClone(history);wrongOrigin.executions[0]!.seedOutcomes[0]!.originalSourceDigest='e'.repeat(64);expect(()=>deriveInventorySeedLineage(wrongOrigin,request)).toThrow();
 const wrongEntry=structuredClone(history);wrongEntry.executions[0]!.seedOutcomes[0]!.proof.entryDigest='f'.repeat(64);expect(()=>deriveInventorySeedLineage(wrongEntry,request)).toThrow();
});

test('G10 historical recompile cache reuses only exact G10 plans and exact prior-history members',()=>{
 const next=deploy(legalSource()),tableIntents=next.expectedCatalog.tables.map(table=>({kind:'create' as const,table:table.id,record:{...table.record}}));
 const firstCandidates=discoverTableInventoryMigrationChanges(null,next,selector(tableIntents),emptyHistory);
 const firstRequest={id:'inventory-cache-first',predecessor:null,previous:null,next,options:options(tableIntents,firstCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history:emptyHistory};
 const first=compileTableInventoryMigration(firstRequest);expect(first.status).toBe('compiled');if(first.status!=='compiled')throw new Error(JSON.stringify(first.diagnostics));
 const history:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[first.plan],executions:[{planDigest:first.plan.digest,entryDigest:'c'.repeat(64),seedOutcomes:[]}]};
 const secondDocument=legalSource() as any,created=appendArchiveTable(secondDocument),secondNext=deploy(secondDocument),secondIntent={kind:'create' as const,table:created.table,record:created.record};
 const secondCandidates=discoverTableInventoryMigrationChanges(next,secondNext,selector([secondIntent]),history);
 const secondRequest={id:'inventory-cache-second',predecessor:{id:first.plan.id,digest:first.plan.digest},previous:next,next:secondNext,options:options([secondIntent],secondCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history};
 const second=compileTableInventoryMigration(secondRequest);expect(second.status).toBe('compiled');if(second.status!=='compiled')throw new Error(JSON.stringify(second.diagnostics));
 const verify=createHistoricalG10Verifier();verify(first.plan,0,emptyHistory);verify(second.plan,1,history);expect(()=>verify(second.plan,1,history)).not.toThrow();
 const changedPlan=structuredClone(history);(changedPlan.plans[0] as any).id='mutated-plan';
 expect(()=>verify(second.plan,1,changedPlan)).toThrow();
 const changedExecution=structuredClone(history);changedExecution.executions[0]!.entryDigest='e'.repeat(64);
 expect(()=>verify(second.plan,1,changedExecution)).toThrow();
});

test('R2 metered source context recompiles a nonempty seeded G10 history and mixed G02 source',()=>{
 const fixture=mixedG02Request(false),seedIds=fixture.previous.seedSets.map(seed=>seed.id),initial=initialG10History(fixture.previous,'r2-metered-initial',seedIds);
 const first=initial.plans[0]!;
 const request={...fixture.request,predecessor:{id:first.id,digest:first.digest},history:initial};
 const compiled=compileTableInventoryMigration(request);expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')throw new Error(JSON.stringify(compiled.diagnostics));
 const history:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[...initial.plans,compiled.plan],executions:[...initial.executions,seedExecution(compiled.plan,fixture.next,'e'.repeat(64))]};
 const current={previous:fixture.next,next:fixture.next,options:{seedSets:[],retiredSeedSets:[]}},meter=new R2WorkMeter();
 expect(deriveInventorySeedLineage(history,current,createHistoricalG10Verifier(meter),meter).every(item=>item.execution==='confirmed')).toBe(true);
 expect(meter.snapshot().work).toBeGreaterThan(0);
 const changedPlan=structuredClone(history),changedPlanValue=changedPlan.plans[1] as any;changedPlanValue.steps[0]!.sql+=' ';delete changedPlanValue.digest;changedPlanValue.digest=hashCanonical(changedPlanValue);changedPlan.executions[1]!.planDigest=changedPlanValue.digest;
 const changedPlanMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPlan,current,createHistoricalG10Verifier(changedPlanMeter),changedPlanMeter)).toThrow();
 const changedPrefix=structuredClone(history);changedPrefix.executions[0]!.entryDigest='f'.repeat(64);
 const changedPrefixMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPrefix,current,createHistoricalG10Verifier(changedPrefixMeter),changedPrefixMeter)).toThrow();
 const changedPhase=structuredClone(history);(changedPhase.executions[0]!.seedOutcomes[0]!.proof as any).phaseDigest='0'.repeat(64);
 const changedPhaseMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPhase,current,createHistoricalG10Verifier(changedPhaseMeter),changedPhaseMeter)).toThrow();
 expect(()=>deriveInventorySeedLineage(originalHistory(fixture.previous),current,undefined,new R2WorkMeter())).toThrow(/UNSUPPORTED_METERED_LEGACY_HISTORY/);
 const selector02={version:'umf.table-inventory-discovery/0.2',tableIntents:[],conversions:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[]};
 const handle=prepareR2InventorySourceContext({previous:fixture.next,next:fixture.next,history,selector:selector02}),state=inspectR2InventorySourceContext(handle);
 expect(state.owned.previous?.bundleDigest).toBe(fixture.next.bundleDigest);expect(state.history).toBeDefined();
 expect(Object.isFrozen(state.history)).toBe(true);expect(Object.isFrozen(state.history.executions)).toBe(true);expect(Object.isFrozen(state.history.executions[0]!.seedOutcomes[0]!.proof)).toBe(true);
 expect(()=>{(state.history.executions[0]!.seedOutcomes[0]!.proof as any).phaseDigest='1'.repeat(64);}).toThrow();
});

function installedCreateReviewFixture(){
 const previous=deploy(legalSource()),nextDocument=legalSource() as any;
 const created=appendArchiveTable(nextDocument);
 const next=deploy(nextDocument),intent={kind:'create' as const,table:created.table,record:created.record};
 const history=initialG10History(previous),candidates=discoverTableInventoryMigrationChanges(previous,next,selector([intent]),history);
 const request={id:'inventory-api-installed-create',predecessor:{id:history.plans[0]!.id,digest:history.plans[0]!.digest},previous,next,options:options([intent],candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history};
 return {previous,next,intent,history,candidates,request};
}
function compiledInstalledCreateReviewFixture(){
 const fixture=installedCreateReviewFixture(),result=compileTableInventoryMigration(fixture.request);
 if(result.status!=='compiled'){
  compileG10InventoryPlan(fixture.request);
  throw new Error(JSON.stringify(result.diagnostics));
 }
 return {...fixture,plan:result.plan};
}

describe('G10 installed-create compiled fixture',()=>{
 let completed:ReturnType<typeof compiledInstalledCreateReviewFixture>;
 beforeAll(()=>{completed=compiledInstalledCreateReviewFixture();},15000);

 test('verifies against complete original history',()=>{
  const {history,plan}=structuredClone(completed);
  expect(verifyTableInventoryMigration(plan,history)).toEqual(plan);
 });

 test('refuses empty or changed history',()=>{
  const {history,plan}=structuredClone(completed);
  expect(()=>verifyTableInventoryMigration(plan,emptyHistory)).toThrow();
  const alteredHistory=structuredClone(history);alteredHistory.executions[0]!.entryDigest='d'.repeat(64);
  expect(()=>verifyTableInventoryMigration(plan,alteredHistory)).toThrow();
 });
});

test('G10 installed create review exposes the complete absent-before projection with no old source path',()=>{
 const {intent,candidates,request}=installedCreateReviewFixture();
 const createCandidate=candidates.find(candidate=>candidate.kind==='create-table');
 expect(createCandidate).toBeDefined();expect(createCandidate?.oldPath).toBeNull();
 expect(createCandidate?.oldValue).toMatchObject({profile:'umf.table-inventory-review/0.1',side:'previous',table:'api_archive',record:intent.record,meaning:null});
 expect(createCandidate?.newPath).toMatch(/^\/modules\/0\/extensions\/umf\.tables\/tables\//);
 const result=compileTableInventoryMigration(request);if(result.status!=='compiled')throw new Error(JSON.stringify(result.diagnostics));expect(result.status).toBe('compiled');
});

test('G10 historical verifier retains exact installed-create prefix and cache checks',()=>{
 const {history,plan}=compiledInstalledCreateReviewFixture();
 const exactVerifier=createHistoricalG10Verifier();exactVerifier(history.plans[0],0,emptyHistory);exactVerifier(plan,1,history);expect(()=>exactVerifier(plan,1,history)).not.toThrow();
 const alteredPrefix=structuredClone(history);alteredPrefix.executions[0]!.entryDigest='e'.repeat(64);
 expect(()=>exactVerifier(plan,1,alteredPrefix)).toThrow();
});

test('G10 legacy component review values and optional source paths remain unchanged',()=>{
 const previous=deploy(legalSource()),document=legalSource() as any;
 document.modules[0]!.extensions['umf.tables'].tables[0]!.columns[0]!.name+='__reviewed';
 const next=deploy(document),history=originalHistory(previous),candidates=discoverTableInventoryMigrationChanges(previous,next,selector([]),history);
 const rename=candidates.find(candidate=>candidate.kind==='rename-column');
 expect(rename).toBeDefined();
 expect(rename?.oldValue).toHaveProperty('physical');expect(rename?.oldValue).toHaveProperty('logical');expect(rename?.oldValue).toHaveProperty('mapping');
 expect(rename?.oldValue).not.toHaveProperty('profile');
 expect(Object.hasOwn(rename!,'oldPath')).toBe(false);expect(Object.hasOwn(rename!,'newPath')).toBe(false);
});

test('G10 seed retirement review retains the original definition and never claims data replay',()=>{
 const previous=deploy(legalSource()),document=legalSource() as any;
 document.modules[0]!.extensions['umf.tables'].seedSets=[];
 const next=deploy(document),history=initialG10History(previous);
 const candidates=discoverTableInventoryMigrationChanges(previous,next,selector([],['synthetic-bootstrap']),history);
 const legacyContexts:any[]=[];consumeTableMigrationChangesBounded(previous,next,{version:'umf.table-migration-discovery/0.3'},2048,25165824,candidate=>legacyContexts.push(candidate));
 const expectedContexts=legacyContexts.filter(candidate=>candidate.kind==='change-operation-context');
 const actualContexts=candidates.filter(candidate=>candidate.kind==='change-operation-context');
 const row=(candidate:any)=>({id:candidate.id,kind:candidate.kind,path:candidate.path,oldDigest:candidate.oldDigest,newDigest:candidate.newDigest,oldValue:candidate.oldValue,newValue:candidate.newValue,...(Object.hasOwn(candidate,'oldPath')?{oldPath:candidate.oldPath}:{}),...(Object.hasOwn(candidate,'newPath')?{newPath:candidate.newPath}:{})});
 expect(expectedContexts).toHaveLength(5);expect(actualContexts).toHaveLength(5);expect(actualContexts.map(row)).toEqual(expectedContexts.map(row));
 const retirements=candidates.filter(candidate=>candidate.kind==='retire-seed-history');expect(retirements).toHaveLength(1);expect(candidates).toHaveLength(expectedContexts.length+1);
 const definition=history.plans[0]!.next.seedSets.find(seed=>seed.id==='synthetic-bootstrap')!;
 const oldValue={profile:'umf.table-inventory-seed-retirement-review/0.1',side:'previous',source:{format:'json',sha256:previous.sourceDigest},configuration:previous.configuration,id:'synthetic-bootstrap',definition,definitionDigest:hashCanonical(definition),originalSourceDigest:previous.sourceDigest,execution:'not-run',retired:false,effects:[]};
 const newValue={...oldValue,side:'next',source:{format:'json',sha256:next.sourceDigest},configuration:next.configuration,retired:true,effects:['original-definition-and-execution-retained-in-history','no-data-replay']};
 const retirementPath='/options/retiredSeedSets/0',oldDigest=hashCanonical(oldValue),newDigest=hashCanonical(newValue),retirementId='review-'+hashCanonical(['retire-seed-history',retirementPath,oldDigest,newDigest]).slice(0,24);
 const expectedRetirement={id:retirementId,kind:'retire-seed-history',path:retirementPath,oldDigest,newDigest,oldValue,newValue,oldPath:'/modules/0/extensions/umf.tables/seedSets/0',newPath:null};
 const candidate=retirements[0]!;
 expect(candidates.map(row)).toEqual([...expectedContexts.map(row),expectedRetirement]);
 expect(candidates.every(candidate=>candidate.kind==='change-operation-context'||candidate.kind==='retire-seed-history')).toBe(true);
 expect(candidate?.kind).toBe('retire-seed-history');
 expect(candidate?.oldValue).toMatchObject({profile:'umf.table-inventory-seed-retirement-review/0.1',side:'previous',id:'synthetic-bootstrap',execution:'not-run',retired:false,effects:[]});
 expect(candidate?.newValue).toMatchObject({profile:'umf.table-inventory-seed-retirement-review/0.1',side:'next',id:'synthetic-bootstrap',execution:'not-run',retired:true,effects:['original-definition-and-execution-retained-in-history','no-data-replay']});
 expect(candidate?.oldPath).toMatch(/^\/modules\/0\/extensions\/umf\.tables\/seedSets\/0$/);expect(candidate?.newPath).toBeNull();
});

test('G10 removal candidates expose the exact irreversible purge disclosure before approval',()=>{
 const previous=deploy(legalSource()),document=legalSource() as any;
 document.modules[0]!.extensions['umf.tables'].tables=[];document.modules[0]!.extensions['umf.tables'].seedSets=[];document.modules[0]!.extensions['umf.tables'].commands=[];
 const next=deploy(document),history=originalHistory(previous);
 const intents=previous.expectedCatalog.tables.map(table=>({kind:'remove' as const,table:table.id,record:{...table.record},disposition:{mode:'irreversible-purge' as const,reviewMarker:'pending'}}));
 const completeSelector=selector(intents,['synthetic-bootstrap']),candidates=discoverTableInventoryMigrationChanges(previous,next,completeSelector,history);
 const effects=candidates.filter(candidate=>candidate.kind==='table-removal-effects');
 expect(effects).toHaveLength(intents.length);
 const disclosures=effects.map(irreversiblePurgeDisclosure);
 expect(disclosures.every(item=>item.code==='IRREVERSIBLE_TABLE_PURGE'&&item.message.includes('all stored rows and columns')&&item.message.includes('not a data backup'))).toBe(true);
 const markerful=structuredClone(completeSelector) as any;for(const intent of markerful.tableIntents)if(intent.kind==='remove')intent.disposition.reviewMarker='pending';
 expect(()=>discoverTableInventoryMigrationChanges(previous,next,markerful,history)).toThrow();
 const tampered={...effects[0]!,oldValue:{...(effects[0]!.oldValue as object),table:'other_table'}} as typeof effects[number];
 expect(()=>irreversiblePurgeDisclosure(tampered)).toThrow();
 for(const intent of intents){const disclosure=disclosures.find(item=>{const candidate=effects.find(value=>value.id===item.markerId);return !!candidate&&!!candidate.oldValue&&typeof candidate.oldValue==='object'&&!Array.isArray(candidate.oldValue)&&(candidate.oldValue as {table?:unknown}).table===intent.table;});expect(disclosure?.path).toMatch(/^\/options\/tableIntents\/\d+\/disposition$/);}
});

function optionalReviewDate(source:any):void{
 const module=source.modules[0]!,field={module:'legal_lifecycle',element:'matters__review_date'},record=module.elements.find((item:any)=>item.kind==='record'&&item.id==='matters'),table=module.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters');
 if(!record||!table)throw new Error('mixed fixture lost retained matters source');
 module.elements.push({id:field.element,name:field.element,kind:'field',scalarType:'date',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 record.members.push(field);table.columns.push({field,name:'review_date',nativeType:{kind:'date'},default:{kind:'literal',value:{date:'2000-02-29'}}});
}

function appendForeignSameIdCommand(source:any):void{
 const field={module:'foreign_lifecycle',element:'foreign_items__id'},record={module:'foreign_lifecycle',element:'foreign_items'};
 const deny={kind:'deny'},rules={select:deny,insert:deny,update:deny,delete:deny};
 source.modules.push({id:'foreign_lifecycle',namespace:'foreign_lifecycle',elements:[{id:field.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},{id:record.element,kind:'record',members:[field],keys:[{id:'primary',name:'primary',primary:true,fields:[field]}],extensions:{}}],extensions:{'umf.tables':{profile:'postgresql18/0.1',tables:[{id:'foreign_items',record,name:'foreign_items',columns:[{field,name:'id',nativeType:{kind:'int4'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:structuredClone(rules),batch:structuredClone(rules)}}],seedSets:[],commands:[{version:'umf.table-operation/0.1',id:'derive_matter_review_date',parameters:[],consistency:'statement',replay:'none',body:{kind:'read',table:'foreign_items',fields:[field],where:{op:'all'},orderBy:[],result:'one',maxRows:1}},{version:'umf.table-operation/0.1',id:'read_clients',parameters:[],consistency:'statement',replay:'none',body:{kind:'read',table:'foreign_items',fields:[field],where:{op:'all'},orderBy:[{field,direction:'asc'}],result:'page',maxRows:100,cursorKey:'primary'}}]}}});
}

function mixedG02Request(existing:boolean,foreignSameId=false){
 const fixture=legalG10MixedSources(),previousSource=structuredClone(fixture.previous);
 if(existing)optionalReviewDate(previousSource);
 if(foreignSameId){appendForeignSameIdCommand(previousSource);appendForeignSameIdCommand(fixture.next);}
 const previous=deploy(previousSource),next=deploy(fixture.next),history=originalHistory(previous);
 const tableIntents=fixture.selectedG10SourceSelection.tableIntents.map((intent:any)=>({kind:'create' as const,table:intent.table,record:{...intent.record}}));
 const selectedSelector=selector(tableIntents);
 const candidates=discoverTableInventoryMigrationChanges(previous,next,selectedSelector,history);
 const reviewedChanges=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const opts={...options(tableIntents,reviewedChanges),backfills:fixture.g02Options.backfills,seedSets:[...fixture.selectedG10SourceSelection.seedSets]};
 return {previous,next,history,selector:selectedSelector,candidates,request:{id:existing?'inventory-mixed-existing-g02':'inventory-mixed-appended-g02',predecessor:{id:history.plans.at(-1)!.id,digest:history.plans.at(-1)!.digest},previous,next,options:opts,history}};
}
function compiledMixedG02Fixture(){
 const fixture=mixedG02Request(false),result=compileTableInventoryMigration(fixture.request);
 if(result.status!=='compiled'){
  compileG10InventoryPlan(fixture.request);
  throw new Error(JSON.stringify(result.diagnostics));
 }
 expect(result.status).toBe('compiled');
 return {...fixture,plan:result.plan};
}

test('G10 mixed legal fixture builders clone exported definitions into each returned source',()=>{
 const first=legalG10MixedSources();
 const createCommand=first.next.modules[0]!.extensions['umf.tables'].commands.find((command:any)=>command.id==='create_review_team');
 const selectedSeed=first.next.modules[0]!.extensions['umf.tables'].seedSets.find((seed:any)=>seed.id==='selected-review-team-seed');
 if(!createCommand||!selectedSeed||!selectedSeed.rows[0])throw Error('G10 mixed fixture definitions are missing');
 createCommand.id='mutated-command';selectedSeed.rows[0].table='mutated-table';
 const second=legalG10MixedSources();
 const secondCommand=second.next.modules[0]!.extensions['umf.tables'].commands.find((command:any)=>command.id==='create_review_team');
 const secondSeed=second.next.modules[0]!.extensions['umf.tables'].seedSets.find((seed:any)=>seed.id==='selected-review-team-seed');
 if(!secondCommand||!secondSeed||!secondSeed.rows[0])throw Error('G10 mixed fixture definitions are missing');
 expect(secondCommand.id).toBe('create_review_team');
 expect(secondSeed.rows[0].table).toBe('matter_review_teams');
 expect(mixedCreatedTableSeedCommand.id).toBe('create_review_team');expect(mixedCreatedTableSeedSet.rows[0]!.table).toBe('matter_review_teams');
});

describe('G10 appended CREATE plus G02 compiled fixture',()=>{
 let completed:ReturnType<typeof compiledMixedG02Fixture>;
 beforeAll(()=>{completed=compiledMixedG02Fixture();},15000);

 test('retains source, marker, grant, field, phase, seed and operation ordering assertions',()=>{
 const {candidates,request,plan}=structuredClone(completed);
 const originalSeeds=(legalSource() as any).modules[0]!.extensions['umf.tables'].seedSets;
 expect(JSON.parse(request.next.source.utf8).modules[0]!.extensions['umf.tables'].seedSets.slice(0,originalSeeds.length)).toEqual(originalSeeds);
 expect(candidates.some(candidate=>candidate.kind==='create-table'&&(candidate.newValue as any).table==='matter_review_groups')).toBe(true);
 expect(candidates.some(candidate=>candidate.kind==='change-operation'&&(candidate.newValue as any)?.id==='derive_matter_review_date')).toBe(true);
 expect(candidates.some(candidate=>candidate.kind==='change-operation'&&(candidate.newValue as any)?.id==='create_review_team')).toBe(true);
 expect(plan.review).toEqual(candidates);
 const grantSteps=plan.steps.filter(step=>step.kind==='grant'&&step.sourcePath.endsWith('/policy/person/update'));
 const mutableNames=(bundle:any)=>{const table=bundle.expectedCatalog.tables.find((item:any)=>item.id==='matters'),source=JSON.parse(bundle.source.utf8),record=source.modules.find((module:any)=>module.id===table.record.module).elements.find((element:any)=>element.kind==='record'&&element.id===table.record.element),keyFields=new Set(record.keys.flatMap((key:any)=>key.fields.map((field:any)=>JSON.stringify([field.module,field.element]))));return table.columns.filter((column:any)=>column.immutable!==true&&!column.generated&&!keyFields.has(JSON.stringify([column.field.module,column.field.element]))).map((column:any)=>column.name);};
 const oldGrantColumns=mutableNames(request.previous!),newGrantColumns=mutableNames(request.next),format=(direction:'GRANT'|'REVOKE',columns:string[])=>`${direction} UPDATE (${columns.map((column:string)=>'"'+column.replaceAll('"','""')+'"').join(', ')}) ON TABLE "${request.next.configuration.schema}"."matters" ${direction==='GRANT'?'TO':'FROM'} "${request.next.configuration.personRole}"`;
 expect(grantSteps.map(step=>step.sql)).toEqual([format('REVOKE',oldGrantColumns),format('GRANT',newGrantColumns)]);
 const fieldColumn=request.next.expectedCatalog.columns.find(column=>column.table==='matters'&&column.field.element==='matters__review_date')!,fieldSteps=plan.steps.filter(step=>step.sourcePath===fieldColumn.sourcePath||step.sourcePath==='/options/backfills/0'&&step.operation==='apply-backfill');
 expect(fieldSteps.map(step=>step.operation)).toEqual(['add-column','apply-backfill','install-default','tighten-not-null']);
 const reviewDateColumn=JSON.parse(request.next.source.utf8).modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='matters').columns.find((column:any)=>column.field.element==='matters__review_date');
 expect(reviewDateColumn.default).toEqual({kind:'literal',value:{date:'2000-02-29'}});
 const backfillOperation=JSON.parse(request.next.source.utf8).modules[0]!.extensions['umf.tables'].commands.find((command:any)=>command.id==='derive_matter_review_date');
 expect(backfillOperation.body.values[0]!.value).toEqual({kind:'rowExpression',expression:{op:'field',field:{module:'legal_lifecycle',element:'matters__open_date'}}});
 const groupPhase=plan.phases.find(phase=>grantSteps.every(step=>phase.steps.includes(step.id))&&fieldSteps.every(step=>phase.steps.includes(step.id)));
 expect(groupPhase).toBeDefined();expect(plan.steps.indexOf(grantSteps[0]!)<plan.steps.indexOf(fieldSteps[0]!)).toBe(true);expect(plan.steps.indexOf(fieldSteps.at(-1)!)<plan.steps.indexOf(grantSteps[1]!)).toBe(true);
 const seedSteps=plan.steps.filter(step=>step.operation==='apply-seeds');expect(seedSteps).toHaveLength(1);expect(seedSteps[0]!.seedSets).toEqual(['selected-review-group-seed','selected-review-team-seed']);
 const groupStep=plan.steps.findIndex(step=>step.operation==='create-table'&&(step.inventorySubject as any).table==='matter_review_groups'),teamStep=plan.steps.findIndex(step=>step.operation==='create-table'&&(step.inventorySubject as any).table==='matter_review_teams'),seedStep=plan.steps.indexOf(seedSteps[0]!);
 expect(groupStep).toBeGreaterThanOrEqual(0);expect(teamStep).toBeGreaterThanOrEqual(0);expect(groupStep).toBeLessThan(seedStep);expect(teamStep).toBeLessThan(seedStep);
 const finalPrefix=plan.prefixes.at(-1)! as any;
 expect(finalPrefix.seedStates.find((seed:any)=>seed.id==='unselected-review-team-seed')?.execution).toBe('not-run');
 });

 test('preserves public verification and serialization equality for the admitted plan',()=>{
  const {history,plan}=structuredClone(completed);
  expect(verifyTableInventoryMigration(plan,history)).toEqual(plan);
  expect(JSON.parse(serializeTableInventoryMigration(plan,history))).toEqual(plan);
 });

 test('public compilation refuses omitted create claims and duplicate operation markers',()=>{
 const {request}=structuredClone(completed);
 const omittedCreate={...request,options:{...request.options,reviewedChanges:request.options.reviewedChanges.filter((marker:any)=>marker.kind!=='create-table')}};
 expect(compileTableInventoryMigration(omittedCreate).status).toBe('blocked');
 const duplicatedOperation={...request,options:{...request.options,reviewedChanges:[...request.options.reviewedChanges,...request.options.reviewedChanges.filter((marker:any)=>marker.kind==='change-operation'&&(marker as any).path.includes('/commands/'))]}};
 expect(compileTableInventoryMigration(duplicatedOperation).status).toBe('blocked');
 });
});

test('G10 mixed CREATE plus existing-target G02 partitions only the exact tightening marker',()=>{
 const {history,candidates,request}=mixedG02Request(true);
 const previousColumn=JSON.parse(request.previous!.source.utf8).modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='matters').columns.find((column:any)=>column.field.element==='matters__review_date');
 const nextColumn=JSON.parse(request.next.source.utf8).modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='matters').columns.find((column:any)=>column.field.element==='matters__review_date');
 expect(previousColumn.default).toEqual({kind:'literal',value:{date:'2000-02-29'}});
 expect(nextColumn.default).toEqual(previousColumn.default);
 expect(candidates.some(candidate=>candidate.kind==='tighten-not-null')).toBe(true);
 const result=compileTableInventoryMigration(request);
 if(result.status!=='compiled'){compileG10InventoryPlan(request);}
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw new Error(JSON.stringify(result.diagnostics));
 expect(result.plan.review).toEqual(candidates);expect(verifyTableInventoryMigration(result.plan,history)).toEqual(result.plan);
 const foreignTightening={...request,options:{...request.options,reviewedChanges:request.options.reviewedChanges.map((marker:any)=>marker.kind==='tighten-not-null'?{...marker,path:'/modules/0/extensions/umf.tables/tables/0/columns/0'}:marker)}};
 expect(compileTableInventoryMigration(foreignTightening).status).toBe('blocked');
});

test('G10 G02 source certificate accepts only the owned change and selected CREATE closure',()=>{
 const {request}=mixedG02Request(true),created=request.options.tableIntents.filter((intent:any)=>intent.kind==='create').map((intent:any)=>intent.table);
 expect(sameSourceExceptG02AndCreates(request.previous!,request.next,request.options,created)).toBe(true);
 const original=JSON.parse(request.next.source.utf8);
 const mutations:Array<[string,(document:any)=>void]>=[
  ['retained-table',(document)=>{const table=document.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='clients');table.name='client_registry';}],
  ['retained-mapping',(document)=>{const table=document.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='clients');table.columns[0].name='client_key';}],
  ['retained-policy',document=>{const table=document.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='clients');table.policy.person.select={kind:'deny'};}],
  ['retained-command',document=>{const command=document.modules[0]!.extensions['umf.tables'].commands.find((item:any)=>item.id==='read_clients');command.body.maxRows=99;}],
  ['raw-opaque-extension-retention',document=>{document.modules[0]!.extensions['example.retained']='changed';}],
  ['retained-seed',document=>{const seed=document.modules[0]!.extensions['umf.tables'].seedSets.find((item:any)=>item.id==='synthetic-bootstrap'),row=seed.rows.find((item:any)=>item.table==='clients'),cell=row.values.find((item:any)=>item.field.element==='clients__client_name');cell.value={string:'Changed client'};}],
 ];
 for(const [label,mutate] of mutations){
  const document=structuredClone(original);mutate(document);
  const changed={...request.next,source:{...request.next.source,utf8:JSON.stringify(document)}};
  expect(sameSourceExceptG02AndCreates(request.previous!,changed as any,request.options,created),label).toBe(false);
 }
 const wrongOperation=structuredClone(original);wrongOperation.modules[0]!.extensions['umf.tables'].commands.find((item:any)=>item.id==='derive_matter_review_date').id='derive_other_field';
 expect(sameSourceExceptG02AndCreates(request.previous!,{...request.next,source:{...request.next.source,utf8:JSON.stringify(wrongOperation)}} as any,request.options,created)).toBe(false);
});

test('G10 per-table review meanings are detached from one shared projection graph',()=>{
 const projected=projectG10Bundle(deploy(legalSource()),'next'),catalogRow=structuredClone(projected.projection.catalog.tables[0]!);
 const first=projected.reviews[0]!.meaning as any;
 first.physicalTable.value.name='mutated-review';
 first.catalog.tables[0]!.meaning.declaration.name='mutated-review-catalog';
 expect(projected.projection.catalog.tables[0]).toEqual(catalogRow);
 const second=projected.reviews.find(review=>review.table!==projected.reviews[0]!.table)!;
 expect((second.meaning as any).physicalTable.value.name).not.toBe('mutated-review');
});

test('G10 prepared public calls own source/history inputs and never invoke request accessors',()=>{
 const {request}=mixedG02Request(true),accessorOptions={...request.options};let getterCalls=0;
 Object.defineProperty(accessorOptions,'reviewedChanges',{enumerable:true,configurable:true,get(){getterCalls++;return request.options.reviewedChanges;}});
 const blocked=compileTableInventoryMigration({...request,options:accessorOptions as any});
 expect(blocked.status).toBe('blocked');expect(getterCalls).toBe(0);
 let rootGetterCalls=0;const accessorRoot={...request};Object.defineProperty(accessorRoot,'id',{enumerable:true,configurable:true,get(){rootGetterCalls++;return request.id;}});
 expect(compileTableInventoryMigration(accessorRoot as any).status).toBe('blocked');expect(rootGetterCalls).toBe(0);
 let historyGetterCalls=0;const accessorHistory={...request.history};Object.defineProperty(accessorHistory,'profile',{enumerable:true,configurable:true,get(){historyGetterCalls++;return request.history.profile;}});
 expect(compileTableInventoryMigration({...request,history:accessorHistory as any}).status).toBe('blocked');expect(historyGetterCalls).toBe(0);
 const customPrototype=Object.assign(Object.create({untrusted:true}),request);
 expect(compileTableInventoryMigration(customPrototype as any).status).toBe('blocked');
 let predecessorGetterCalls=0;const accessorPredecessor=Object.defineProperties({}, {id:{enumerable:true,get(){predecessorGetterCalls++;return request.predecessor!.id;}},digest:{enumerable:true,value:request.predecessor!.digest}});
 expect(compileTableInventoryMigration({...request,predecessor:accessorPredecessor as any}).status).toBe('blocked');expect(predecessorGetterCalls).toBe(0);

 const originalSource=request.next.source.utf8,result=compileTableInventoryMigration(request);
 if(result.status!=='compiled'){
  compileG10InventoryPlan(request);
  throw new Error(JSON.stringify(result.diagnostics));
 }
 expect(result.status).toBe('compiled');
 request.next.source.utf8='{}';request.history.plans.length=0;request.options.reviewedChanges.pop();
 expect(result.plan.next.source.utf8).toBe(originalSource);
 expect(result.plan.historyBinding.count).toBe(1);
 expect(compileTableInventoryMigration(request).status).toBe('blocked');
});

test('G10 G02 module-context ownership retains only local tightening from complete compiled markers',()=>{
 const {candidates,request}=mixedG02Request(true,true),backfill=request.options.backfills[0]!;
 expect(candidates.some(candidate=>candidate.kind==='tighten-not-null')).toBe(true);
 expect(candidates.some(candidate=>candidate.kind==='change-operation')).toBe(true);
 expect(candidates.some(candidate=>candidate.kind==='change-operation-context')).toBe(true);
 const selectedCreates=request.options.tableIntents.map(intent=>intent.table);
 const local=partitionInventoryMarkersForG02(request.options.reviewedChanges as any,request.previous!,request.next,selectedCreates,backfill);
 expect(local).toHaveLength(1);expect(local).toEqual(request.options.reviewedChanges.filter(marker=>marker.kind==='tighten-not-null'));
 const previousTighteningPath=request.previous!.expectedCatalog.columns.find(column=>column.table==='matters'&&column.field.element==='matters__review_date')!.sourcePath;
 const nextTighteningPath=request.next.expectedCatalog.columns.find(column=>column.table==='matters'&&column.field.element==='matters__review_date')!.sourcePath;
 expect(previousTighteningPath).not.toBe(nextTighteningPath);expect(local[0]!.path).toBe(nextTighteningPath);
 const nextDoc=JSON.parse(request.next.source.utf8),foreignIndex=nextDoc.modules.findIndex((module:any)=>module.id==='foreign_lifecycle');
 const context=candidates.find(candidate=>candidate.kind==='change-operation-context'&&candidate.path.startsWith(`/modules/${foreignIndex}/`));expect(context).toBeDefined();
 const path=/^\/modules\/(\d+)\/extensions\/umf\.tables\/commands\/(\d+)$/.exec(context!.path)!;
 const foreignNext=nextDoc.modules[Number(path[1])]!,newCommand=foreignNext.extensions['umf.tables'].commands[Number(path[2])];
 expect(foreignNext.id).toBe('foreign_lifecycle');expect(newCommand.id).toBe('derive_matter_review_date');
 expect(nextDoc.modules[0]!.extensions['umf.tables'].commands.some((command:any)=>command.id===newCommand.id)).toBe(true);
 const oldDoc=JSON.parse(request.previous!.source.utf8),foreignOld=oldDoc.modules.find((module:any)=>module.id==='foreign_lifecycle');
 foreignOld.extensions['umf.tables'].commands=foreignOld.extensions['umf.tables'].commands.filter((command:any)=>command.id!==newCommand.id);
 const badPrevious=deploy(oldDoc);
 expect(()=>partitionInventoryMarkersForG02(request.options.reviewedChanges as any,badPrevious,request.next,selectedCreates,backfill)).toThrow('PARTITION_CONTEXT_MARKER');

 // A second same-ID context is deliberately retained in the selected OLD and NEXT modules.
 // Removing only the foreign OLD command must still be detected as a foreign-context change.
 const readContext=candidates.find(candidate=>{
  if(candidate.kind!=='change-operation-context'||!candidate.path.startsWith(`/modules/${foreignIndex}/`))return false;
  const match=/^\/modules\/(\d+)\/extensions\/umf\.tables\/commands\/(\d+)$/.exec(candidate.path);
  return !!match&&nextDoc.modules[Number(match[1])]!.extensions['umf.tables'].commands[Number(match[2])]!.id==='read_clients';
 });
 expect(readContext).toBeDefined();
 const selectedOld=JSON.parse(request.previous!.source.utf8).modules.find((module:any)=>module.id===nextDoc.modules[0]!.id);
 expect(selectedOld.extensions['umf.tables'].commands.some((command:any)=>command.id==='read_clients')).toBe(true);
 const foreignOldRead=foreignOld.extensions['umf.tables'].commands.find((command:any)=>command.id==='read_clients');
 expect(foreignOldRead).toBeDefined();
 const readOldDoc=JSON.parse(request.previous!.source.utf8),readForeignOld=readOldDoc.modules.find((module:any)=>module.id==='foreign_lifecycle');
 readForeignOld.extensions['umf.tables'].commands=readForeignOld.extensions['umf.tables'].commands.filter((command:any)=>command.id!=='read_clients');
 const readBadPrevious=deploy(readOldDoc);
 expect(()=>partitionInventoryMarkersForG02(request.options.reviewedChanges as any,readBadPrevious,request.next,selectedCreates,backfill)).toThrow('PARTITION_CONTEXT_MARKER');
});

test('G10 discovery rejects selector count and UTF-8 limits at the public boundary',()=>{
 const next=deploy(legalSource());
 const tooMany=Array.from({length:513},(_,index)=>({kind:'create' as const,table:`unselected_${index}`,record:{module:'legal_lifecycle',element:'unselected_record'}}));
 expect(()=>discoverTableInventoryMigrationChanges(null,next,selector(tooMany),emptyHistory)).toThrow();
 const tooManyCreates=Array.from({length:257},(_,index)=>({kind:'create' as const,table:`created_${index}`,record:{module:'legal_lifecycle',element:'created_record'}}));
 expect(()=>discoverTableInventoryMigrationChanges(null,next,selector(tooManyCreates),emptyHistory)).toThrow();
 const tooLong=[{kind:'create' as const,table:'x'.repeat(257),record:{module:'legal_lifecycle',element:'unselected_record'}}];
 expect(()=>discoverTableInventoryMigrationChanges(null,next,selector(tooLong),emptyHistory)).toThrow();
 const oversizedShape=selector([{kind:'create',table:'created',record:{module:'legal_lifecycle',element:'record',extra:{attacker:'x'}}}] as any);
 expect(()=>discoverTableInventoryMigrationChanges(null,next,oversizedShape,emptyHistory)).toThrow();
 expect(()=>discoverTableInventoryMigrationChanges(null,next,selector([],Array.from({length:257},(_,index)=>`seed_${index}`)),emptyHistory)).toThrow();
 expect(()=>discoverTableInventoryMigrationChanges(null,next,selector([],['same-seed','same-seed']),emptyHistory)).toThrow();
 const oversizedArchive={version:'umf.table-inventory-discovery/0.1' as const,tableIntents:[],conversions:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[{digest:'a'.repeat(64),source:{format:'json' as const,utf8:'x'.repeat(1048577)}}]};
 expect(()=>discoverTableInventoryMigrationChanges(null,next,oversizedArchive,emptyHistory)).toThrow();
});

test('G10 internal legacy discovery reserves candidate count and bytes before retaining rows',()=>{
 const previous=deploy(legalSource()),changed=legalSource() as any;
 changed.modules[0]!.extensions['umf.tables'].tables.find((table:any)=>table.id==='matters').columns.find((column:any)=>column.name==='matter_title').name='review_title';
 const next=deploy(changed),selector03={version:'umf.table-migration-discovery/0.3' as const};
 expect(()=>consumeTableMigrationChangesBounded(previous,next,selector03,0,25165824,()=>{})).toThrow();
 expect(()=>consumeTableMigrationChangesBounded(previous,next,selector03,2048,1,()=>{})).toThrow();
});

test('G10 public discovery normalizes malformed selector and history failures to located review errors',()=>{
 const next=deploy(legalSource());
 let selectorError:unknown,historyError:unknown,nextError:unknown,previousError:unknown;
 try{discoverTableInventoryMigrationChanges(null,next,{} as any,emptyHistory);}catch(error){selectorError=error;}
 try{discoverTableInventoryMigrationChanges(null,next,selector([]),{} as any);}catch(error){historyError=error;}
 try{discoverTableInventoryMigrationChanges(null,{} as any,selector([]),emptyHistory);}catch(error){nextError=error;}
 try{discoverTableInventoryMigrationChanges({} as any,next,selector([]),emptyHistory);}catch(error){previousError=error;}
 expect(selectorError).toMatchObject({code:'TABLE_MIGRATION_REVIEW',path:'/selector'});
 expect(historyError).toMatchObject({code:'TABLE_MIGRATION_REVIEW',path:'/history'});
 expect(nextError).toMatchObject({code:'TABLE_MIGRATION_REVIEW',path:'/source'});
 expect(previousError).toMatchObject({code:'TABLE_MIGRATION_REVIEW',path:'/source'});
 expect(selectorError).toBeInstanceOf(UmfError);expect(historyError).toBeInstanceOf(UmfError);
 expect(nextError).toBeInstanceOf(UmfError);expect(previousError).toBeInstanceOf(UmfError);
});
