// SPDX-License-Identifier: MIT OR Apache-2.0
import {beforeAll,describe,expect,test} from 'bun:test';
import {canonical,canonicalChargedMeasuredBounded,hashCanonical,sha256Text,sha256TextChunksCharged} from '../../src/compilation/bundle/hash';
import {UmfError} from '../../src/model/errors';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,compileTableInventoryMigration,discoverTableInventoryMigrationChanges,irreversiblePurgeDisclosure,serializeTableInventoryMigration,verifyTableInventoryMigration} from '../../src/table-migration';
import {compileG10InventoryPlan,compileInventoryPlan,createHistoricalG10Verifier,deriveInitialRendererEffects,deriveG10ProvenanceMutations,type InventoryPlanInput} from '../../src/table-migration/inventory';
import {partitionRendererDependencies,verifySourcePublicationCoverage} from '../../src/table-migration/inventory-effects';
import {initialInventoryPrefix,scheduleTypedInventoryEffects,scheduleTypedInventoryEffectsForCompiler,scheduleTypedInventoryEffectsForCompilerCanonical,type CatalogMutation,type EffectNode,type InventoryMetadataStepIds,type PrefixFrame,type ScheduledInventoryEffects} from '../../src/table-migration/inventory-graph';
import {deriveInventorySeedLineage} from '../../src/table-migration/inventory-history';
import type {InventoryDelta} from '../../src/table-migration/inventory-projection';
import {ownedR2CurrentSourceCanonical,ownR2HistoryComponent,ownedR2HistoryPlanBundle,ownR2SourceComponents,R2_CONTEXT_BYTE_LIMIT,R2WorkLimitError,R2WorkMeter,R2_WORK_EVENT_UNITS,snapshotR2Json} from '../../src/table-migration/inventory-r2-context';
import {inspectR2InventorySourceContext,prepareR2InventorySourceContext} from '../../src/table-migration/inventory';
import {projectG10Bundle} from '../../src/table-migration/inventory-source';
import {partitionInventoryMarkersForG02,sameSourceExceptG02AndCreates} from '../../src/table-migration/inventory-g02-source';
import {consumeTableMigrationChangesBounded} from '../../src/table-migration/reviewed';
import {legalSource} from './legal-fixture';
import noteFixture from '../binding/fixtures/table-lifecycle-note.json';
import {legalG10MixedSources,mixedCreatedTableSeedCommand,mixedCreatedTableSeedSet} from './g10-mixed-create-g02-fixture';
import type {TableInventoryMigrationOptions,TableInventorySourceHistory} from '../../src/table-migration';

const config={module:'legal_lifecycle',schema:'inventory_api',ownerRole:'inventory_owner',personRole:'inventory_person',batchRole:'inventory_batch',groupRoles:{billing_admin:'inventory_billing_admin'}};
const deploy=(document:unknown)=>{
 return deployWithConfiguration(document,config);
};
const deployWithConfiguration=(document:unknown,configuration:typeof config)=>{
 const result=compileTableDeployment({text:JSON.stringify(document),configuration});
 if(result.status!=='compiled')throw new Error('Original deployment source refused: '+JSON.stringify(result.diagnostics));
 return result.bundle;
};
const emptyHistory:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[],executions:[]};
type GraphTestJson=null|boolean|number|string|GraphTestJson[]|{[key:string]:GraphTestJson};
type GraphTableIdentity={kind:'table';table:string;subject:{module:string;element:string}};
const emptyPrefixCatalog=():Record<string,GraphTestJson[]>=>({tables:[],columns:[],keys:[],checks:[],foreignKeys:[],indexes:[],policies:[],grants:[],comments:[]});
class PrefixCanonicalCountingMeter extends R2WorkMeter{
 rowCanonicalMisses=0;failBeforeRowCanonical=false;bytesAtRowFailure:number|null=null;
 override visit(category:string,path:string,count=1):void{if(category==='graph-canonical-row-retention'||category==='graph-prefix-canonical-row-retention'){if(this.failBeforeRowCanonical){this.bytesAtRowFailure=this.snapshot().bytes;throw new Error('CONTROLLED_ROW_CANONICAL_RETENTION_FAILURE');}this.rowCanonicalMisses+=count;}super.visit(category,path,count);}
}
test('charged chunk hashing preserves UTF-8 bytes and refuses before later chunks on budget exhaustion',()=>{
 const chunks=['prefix','snowman ☃','quote" backslash\\ and newline\n'],meter=new R2WorkMeter();
 const digest=sha256TextChunksCharged(append=>chunks.forEach((chunk,index)=>append(chunk,`/chunks/${index}`)),meter,'/chunks');
 expect(digest).toBe(sha256Text(chunks.join('')));expect(meter.snapshot().bytes).toBe(new TextEncoder().encode(chunks.join('')).byteLength);
 const nearLimit=new R2WorkMeter();nearLimit.retainBytes('test-prefill',R2_CONTEXT_BYTE_LIMIT-1,'/prefill');let laterChunkReached=false;
 expect(()=>sha256TextChunksCharged(append=>{append('☃','/chunks/over-limit');laterChunkReached=true;},nearLimit,'/chunks')).toThrow(`R2_CONTEXT_BYTES_LIMIT:/chunks/over-limit`);
 expect(laterChunkReached).toBe(false);expect(nearLimit.snapshot().bytes).toBe(R2_CONTEXT_BYTE_LIMIT-1);
 const retryMeter=new R2WorkMeter();expect(sha256TextChunksCharged(append=>{append('☃','/retry');},retryMeter,'/retry')).toBe(sha256Text('☃'));expect(retryMeter.snapshot().bytes).toBe(3);
});
test('bounded canonical members account exact UTF-8 output and stop before oversized token/key emission',()=>{
 const value={alpha:'snowman ☃',quote:'"\\\n'},expected=canonical(value),exactMeter=new R2WorkMeter(),exact=canonicalChargedMeasuredBounded(value,exactMeter,'/bounded',new TextEncoder().encode(expected).byteLength);
 expect(exact).toEqual({text:expected,byteLength:new TextEncoder().encode(expected).byteLength});
 const tokenMeter=new R2WorkMeter();expect(()=>canonicalChargedMeasuredBounded('x'.repeat(4096),tokenMeter,'/bounded/token',8)).toThrow('PLAN_SIZE');expect(tokenMeter.snapshot().bytes).toBe(0);
 const keyMeter=new R2WorkMeter();expect(()=>canonicalChargedMeasuredBounded({a:'value'},keyMeter,'/bounded/key',2)).toThrow('PLAN_SIZE');expect(keyMeter.snapshot().bytes).toBe(1);
 const nearWorkMeter=new R2WorkMeter();nearWorkMeter.charge('jsonNode',1_000_000,'/prefill');expect(()=>canonicalChargedMeasuredBounded({retry:'ok'},nearWorkMeter,'/bounded/work',64)).toThrow(R2WorkLimitError);
 const retryMeter=new R2WorkMeter(),retry=canonicalChargedMeasuredBounded({retry:'ok'},retryMeter,'/bounded/retry',64);expect(retry.text).toBe(canonical({retry:'ok'}));expect(retry.byteLength).toBe(new TextEncoder().encode(retry.text).byteLength);expect(retryMeter.snapshot().bytes).toBe(retry.byteLength);
});
const definitionDigestCollections=['tables','columns','keys','checks','foreignKeys','indexes','policies','grants','comments'] as const;
function assertNormativeTableDefinitionDigests(frame:PrefixFrame):void{
 for(const raw of frame.tableStates){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Frame table state is malformed.');const state=raw as Record<string,GraphTestJson>,table=state.table;
  if(typeof table!=='string'||!table||!('record'in state)||!('state'in state)||!('definitionDigest'in state))throw new Error('Frame table state lacks its digest domain.');
  const localCatalog=Object.fromEntries(definitionDigestCollections.map(collection=>[collection,(frame.catalog[collection]??[]).filter(row=>{if(!row||typeof row!=='object'||Array.isArray(row))return false;const identity=(row as Record<string,GraphTestJson>).identity;return !!identity&&typeof identity==='object'&&!Array.isArray(identity)&&(identity as Record<string,GraphTestJson>).table===table;})])) as Record<(typeof definitionDigestCollections)[number],GraphTestJson[]>;
  let expected:string;
  if(state.state==='absent'){for(const rows of Object.values(localCatalog))expect(rows).toHaveLength(0);expected=hashCanonical(null);}
  else if(state.state==='present'){const tableRows=localCatalog.tables;if(tableRows.length!==1)throw new Error(`Expected one present table row for ${table}.`);const tableRow=tableRows[0];if(!tableRow||typeof tableRow!=='object'||Array.isArray(tableRow)||(tableRow as Record<string,GraphTestJson>).state!=='present')throw new Error('Present table catalog row is malformed.');const identity=(tableRow as Record<string,GraphTestJson>).identity;if(!identity||typeof identity!=='object'||Array.isArray(identity)||!('subject'in identity)||!('record'in state))throw new Error('Present table identity is malformed.');expect(hashCanonical((identity as Record<string,GraphTestJson>).subject)).toBe(hashCanonical(state.record));expected=hashCanonical({profile:'umf.table-inventory-table-definition/0.1',table,record:state.record,catalog:localCatalog});}
  else throw new Error(`Unknown table state ${String(state.state)}.`);
  expect(state.definitionDigest).toBe(expected);
 }
}
function oldFinalizedScheduleReference(schedule:ScheduledInventoryEffects,oldMetadataIds:InventoryMetadataStepIds){
 const oldOrder=[oldMetadataIds.prepare,oldMetadataIds.approval,...schedule.steps.map(step=>step.id),oldMetadataIds.publication],idByOld=new Map(oldOrder.map((id,index)=>[id,`step-${String(index+1).padStart(5,'0')}`]));
 const metadataStepIds={prepare:idByOld.get(oldMetadataIds.prepare)!,approval:idByOld.get(oldMetadataIds.approval)!,publication:idByOld.get(oldMetadataIds.publication)!};
 const steps=schedule.steps.map(step=>({...step,id:idByOld.get(step.id)!}));
 const phases=schedule.phases.map(phase=>({...phase,steps:phase.steps.map(id=>idByOld.get(id)!)}));
 const prefixes=schedule.prefixes.map(frame=>{const prefix=structuredClone(frame);prefix.completedSteps=prefix.completedSteps.map(id=>idByOld.get(id)!);for(const raw of prefix.tableStates){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Reference table state is malformed.');const state=raw as Record<string,GraphTestJson>;for(const key of ['creationStep','removalStep'] as const){const id=state[key];if(id===null)continue;if(typeof id!=='string'||!idByOld.has(id))throw new Error('Reference step binding is missing.');state[key]=idByOld.get(id)!;}}const {digest,...body}=prefix;prefix.digest=hashCanonical(body);return prefix;});
 return {steps,phases,prefixes,metadataStepIds};
}
function oldInventorySubject(subject:EffectNode['subject']):GraphTestJson{
 if(subject.kind==='table')return {kind:'table',table:subject.table,record:subject.record};
 if(subject.kind==='field')return {kind:'field',table:subject.table,field:subject.field};
 if(subject.kind==='dependency')return {kind:'dependency',table:subject.table,dependencyKind:subject.dependencyKind,id:subject.id,sourcePath:subject.sourcePath,meaningDigest:subject.meaningDigest};
 if(subject.kind==='schema-grant')return {kind:'schema-grant',schema:subject.schema,audiences:['person','batch'],privilege:'USAGE'};
 if(subject.kind==='seed')return {kind:'seed',sets:subject.sets};
 return {kind:'metadata',profile:subject.profile};
}
function oldInventoryPlanSections(schedule:ReturnType<typeof oldFinalizedScheduleReference>){
 const metadataPaths={prepare:'/inventory/metadata/prepare',approval:'/inventory/metadata/approval',publication:'/inventory/metadata/publication'},effectById=new Map(schedule.steps.map(step=>[step.id,step])),emitted=new Set<string>(),steps:Record<string,GraphTestJson>[]=[];
 const metadataEffect=(id:string,operation:'prepare-inventory-metadata'|'record-inventory-approval'|'publish-inventory',sourcePath:string):EffectNode=>({id,kind:'metadata',operation,subject:{kind:'metadata',profile:'umf.table-inventory-metadata/0.1'},sourcePath,sql:'',transaction:'required',recovery:'rollback-transaction',sourceOrder:0,atomicGroup:null,transition:{action:'update',collection:'tables',meaning:{state:operation==='publish-inventory'?'published':'pending'}}});
 for(let phaseIndex=0;phaseIndex<schedule.phases.length;phaseIndex++){
  const phase=schedule.phases[phaseIndex]!,before=schedule.prefixes[phaseIndex]?.digest,after=schedule.prefixes[phaseIndex+1]?.digest;if(!before||!after)throw new Error('Legacy serializer reference lost a phase prefix.');
  for(const id of phase.steps){if(emitted.has(id))throw new Error('Legacy serializer reference duplicated a phase step.');emitted.add(id);let effect=effectById.get(id);
   if(id===schedule.metadataStepIds.prepare)effect=metadataEffect(id,'prepare-inventory-metadata',metadataPaths.prepare);
   else if(id===schedule.metadataStepIds.approval)effect=metadataEffect(id,'record-inventory-approval',metadataPaths.approval);
   else if(id===schedule.metadataStepIds.publication)effect=metadataEffect(id,'publish-inventory',metadataPaths.publication);
   if(!effect)throw new Error('Legacy serializer reference lacks an effect.');
   steps.push({id,kind:effect.kind,sourcePath:effect.sourcePath,transaction:effect.transaction,sql:effect.sql,operation:effect.operation,inventorySubject:oldInventorySubject(effect.subject),preconditions:{kind:'inventory-prefix',prefixDigest:before},expectedOutcome:{kind:'inventory-prefix',prefixDigest:after},verification:'native-catalog-privileges-and-role-scope',recovery:effect.recovery,...(effect.operation==='apply-seeds'&&effect.subject.kind==='seed'?{seedSets:effect.subject.sets}:{}),...(effect.operation==='apply-backfill'&&effect.dataBinding?{dataBinding:effect.dataBinding}:{})});
  }
 }
 const phases=schedule.phases.map(phase=>({id:phase.id,kind:phase.kind,transaction:phase.transaction,steps:[...phase.steps]}));
 return {steps,phases,prefixes:schedule.prefixes as unknown as GraphTestJson[]};
}
function graphTableIdentity(row:GraphTestJson|undefined):GraphTableIdentity{
 if(!row||typeof row!=='object'||Array.isArray(row)||!('identity'in row))throw new Error('Scheduled table row has no identity.');const identity=row.identity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||identity.kind!=='table'||typeof identity.table!=='string'||!identity.subject||typeof identity.subject!=='object'||Array.isArray(identity.subject)||typeof identity.subject.module!=='string'||typeof identity.subject.element!=='string')throw new Error('Scheduled table identity is malformed.');
 return {kind:'table',table:identity.table,subject:{module:identity.subject.module,element:identity.subject.element}};
}
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
function historicalCacheFixture(){
 const next=deploy(legalSource()),tableIntents=next.expectedCatalog.tables.map(table=>({kind:'create' as const,table:table.id,record:{...table.record}}));
 const firstCandidates=discoverTableInventoryMigrationChanges(null,next,selector(tableIntents),emptyHistory);
 const firstRequest={id:'inventory-cache-first',predecessor:null,previous:null,next,options:options(tableIntents,firstCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history:emptyHistory};
 const first=compileTableInventoryMigration(firstRequest);
 if(first.status!=='compiled')throw new Error('Initial historical-cache fixture refused: '+JSON.stringify(first.diagnostics));
 const history:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[first.plan],executions:[{planDigest:first.plan.digest,entryDigest:'c'.repeat(64),seedOutcomes:[]}]};
 const secondDocument=legalSource() as any,created=appendArchiveTable(secondDocument),secondNext=deploy(secondDocument),secondIntent={kind:'create' as const,table:created.table,record:created.record};
 const secondCandidates=discoverTableInventoryMigrationChanges(next,secondNext,selector([secondIntent]),history);
 const secondRequest={id:'inventory-cache-second',predecessor:{id:first.plan.id,digest:first.plan.digest},previous:next,next:secondNext,options:options([secondIntent],secondCandidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker)),history};
 const second=compileTableInventoryMigration(secondRequest);
 if(second.status!=='compiled')throw new Error('Second historical-cache fixture refused: '+JSON.stringify(second.diagnostics));
 return {first:first.plan,second:second.plan,history};
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
function smallNoteMixedG02Source(){
 const configuration={module:'demo',schema:'note_inventory',ownerRole:'note_owner',personRole:'note_person',batchRole:'note_batch',groupRoles:{billing_admin:'note_billing_admin'}};
 const previousSource=structuredClone(noteFixture) as any,payload=previousSource.modules[0]!.extensions['umf.tables'];
 payload.seedSets.push({id:'initial-note-seed',conflict:'error',rows:[{table:'notes',values:[{field:{module:'demo',element:'id'},value:{string:'note-1'}},{field:{module:'demo',element:'owner'},value:{string:'person-1'}}]}]});
 const previous=deployWithConfiguration(previousSource,configuration),history=initialG10History(previous,'r2-note-initial',['initial-note-seed']);
 const nextSource=structuredClone(previousSource),nextPayload=nextSource.modules[0]!.extensions['umf.tables'];
 const summary={module:'demo',element:'summary'};
 nextSource.modules[0]!.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',facets:{length:{min:1,max:100,unit:'unicode-scalar'}},extensions:{}});
 nextSource.modules[0]!.elements.find((item:any)=>item.id==='Note')!.members.push(summary);
 nextPayload.tables[0]!.columns.push({field:summary,name:'summary',nativeType:{kind:'text'},default:{kind:'literal',value:{string:'future summary'}}});
 nextPayload.commands.push({version:'umf.table-operation/0.2',id:'derive_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:summary},values:[{field:summary,value:{kind:'rowExpression',expression:{op:'concat',args:[{op:'field',field:{module:'demo',element:'owner'}},{op:'literal',value:{string:' / '}},{op:'field',field:{module:'demo',element:'id'}}]}}}],returning:[],maxRows:100}});
 const archiveField={module:'demo',element:'archive_id'},archiveRecord={module:'demo',element:'note_archive'};
 nextSource.modules[0]!.elements.push({id:archiveField.element,kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}});
 nextSource.modules[0]!.elements.push({id:archiveRecord.element,kind:'record',members:[archiveField],keys:[{id:'primary',name:'primary',primary:true,fields:[archiveField]}],extensions:{}});
 const deny={kind:'deny'},rules={select:deny,insert:deny,update:deny,delete:deny};
 nextPayload.tables.push({id:'note_archive',record:archiveRecord,name:'note_archive',columns:[{field:archiveField,name:'id',nativeType:{kind:'int4'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:structuredClone(rules),batch:structuredClone(rules)}});
 const next=deployWithConfiguration(nextSource,configuration),intent={kind:'create' as const,table:'note_archive',record:archiveRecord},selectedSelector=selector([intent]);
 const candidates=discoverTableInventoryMigrationChanges(previous,next,selectedSelector,history),reviewedChanges=candidates.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker);
 const migrationOptions={...options([intent],reviewedChanges),seedSets:[],backfills:[{table:'notes',column:summary,operation:'derive_summary',scopedRows:true as const}]};
 const request={id:'r2-note-mixed-g02',predecessor:{id:history.plans[0]!.id,digest:history.plans[0]!.digest},previous,next,options:migrationOptions,history};
 return {configuration,previous,next,history,intent,selectedSelector,candidates,request};
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
 const digestPreimage=structuredClone(result.plan) as any,planDigest=digestPreimage.digest;delete digestPreimage.digest;
 expect(planDigest).toBe(hashCanonical(digestPreimage));expect(serialized).toBe(canonical(result.plan));expect(JSON.parse(serialized)).toEqual(result.plan);
 expect(serialized.endsWith('\n')).toBe(false);
 const reordered={...request,options:{...request.options,reviewedChanges:[...request.options.reviewedChanges].reverse()}};
 expect(compileTableInventoryMigration(reordered).status).toBe('blocked');
 const rehashedMutation=structuredClone(result.plan) as any;rehashedMutation.review[0]!.newValue.table='forged';delete rehashedMutation.digest;rehashedMutation.digest=hashCanonical(rehashedMutation);
 expect(()=>verifyTableInventoryMigration(rehashedMutation,emptyHistory)).toThrow();
 expect(()=>serializeTableInventoryMigration(rehashedMutation,emptyHistory)).toThrow();
 const changedPrefix=structuredClone(result.plan) as any;changedPrefix.prefixes[0]!.completedSteps.push('unbound-prefix-step');delete changedPrefix.digest;changedPrefix.digest=hashCanonical(changedPrefix);
 expect(()=>verifyTableInventoryMigration(changedPrefix,emptyHistory)).toThrow();
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

test('scheduler prefixes preserve final frames for zero and multiple groups with or without metadata IDs',()=>{
 const makeCreate=(table:string,sourceOrder:number):{effect:EffectNode;identity:GraphTableIdentity}=>{
  const record={module:'graph_snapshot',element:`${table}_record`},identity:GraphTableIdentity={kind:'table',table,subject:record},meaning:GraphTestJson={tableMeaning:{},embeddedCatalog:{columns:[],keys:[],checks:[]}};
  return {identity,effect:{id:`create-${table}`,kind:'table',operation:'create-table',subject:{kind:'table',table,record},sourcePath:`/tables/${table}`,sql:`CREATE TABLE ${table} ()`,transaction:'required',recovery:'rollback-transaction',sourceOrder,atomicGroup:null,transition:{action:'add',collection:'tables',meaning}}};
 };
 const initial=():Omit<PrefixFrame,'digest'>=>({profile:'umf.table-inventory-prefix/0.1',index:0,completedSteps:[],tableStates:[],catalog:emptyPrefixCatalog(),metadata:{profile:'umf.table-inventory-metadata/0.1',state:'pristine'},seedStates:[]});
 const compilerMetadataIds={prepare:'g10-inventory-prepare',approval:'g10-inventory-approval',publication:'g10-inventory-publication'};
 const assertFrames=(result:ReturnType<typeof scheduleTypedInventoryEffects>,groupCount:number,metadata:boolean)=>{
  expect(result.prefixes).toHaveLength(groupCount+4);
  expect(result.phases).toHaveLength(groupCount+3);
  const expectedStates:PrefixFrame['metadata']['state'][]=['pristine',...Array<PrefixFrame['metadata']['state']>(groupCount+2).fill('pending'),'published'];
  expect(result.prefixes.map(frame=>frame.metadata.state)).toEqual(expectedStates);
  for(let index=0;index<result.prefixes.length;index++){
   const frame=result.prefixes[index]!,{digest,...body}=frame;
   expect(frame.index).toBe(index);
   expect(frame.completedSteps).toEqual(result.phases.slice(0,index).flatMap(phase=>phase.steps));
   expect(digest).toBe(hashCanonical(body));
   assertNormativeTableDefinitionDigests(frame);
  }
  expect(result.prefixes.at(-1)!.metadata.state).toBe('published');
  if(metadata){expect(result.prefixes[1]!.completedSteps).toEqual(['prepare']);expect(result.prefixes[2]!.completedSteps).toEqual(['prepare','approval']);expect(result.prefixes.at(-1)!.completedSteps.at(-1)).toBe('publication');}
  else expect(result.prefixes.every(frame=>!frame.completedSteps.some(step=>['prepare','approval','publication'].includes(step)))).toBe(true);
 };
 for(const metadataStepIds of [undefined,{prepare:'prepare',approval:'approval',publication:'publication'}]){
  const empty=scheduleTypedInventoryEffects(initial(),[],[],emptyPrefixCatalog(),metadataStepIds,[]);
  assertFrames(empty,0,metadataStepIds!==undefined);
  const first=makeCreate('first',1),second=makeCreate('second',2),target=emptyPrefixCatalog();
  const targetTables=target.tables;if(!targetTables)throw new Error('Test fixture catalog has no tables collection.');
  targetTables.push({identity:first.identity,meaning:{},state:'present'},{identity:second.identity,meaning:{},state:'present'});
  const edges=[{dependent:hashCanonical(second.identity),prerequisite:hashCanonical(first.identity),sourcePath:'/tests/create-order',reason:'source-create-order',state:'present' as const}];
  const grouped=scheduleTypedInventoryEffects(initial(),[first.effect,second.effect],edges,target,metadataStepIds,[]);
  assertFrames(grouped,2,metadataStepIds!==undefined);
  const legacyCompilerInput=scheduleTypedInventoryEffects(initial(),[first.effect,second.effect],edges,target,compilerMetadataIds,[]),compiledFinal=scheduleTypedInventoryEffectsForCompiler(initial(),[first.effect,second.effect],edges,target,compilerMetadataIds,[]);
  expect(compiledFinal).toEqual(oldFinalizedScheduleReference(legacyCompilerInput,compilerMetadataIds));expect(compiledFinal.metadataStepIds).toEqual({prepare:'step-00001',approval:'step-00002',publication:'step-00005'});
  expect(scheduleTypedInventoryEffectsForCompiler(initial(),[second.effect,first.effect],edges,target,compilerMetadataIds,[])).toEqual(compiledFinal);
  for(const [index,frame]of compiledFinal.prefixes.entries()){const {digest,...body}=frame;expect(digest).toBe(hashCanonical(body));expect(frame.completedSteps).toEqual(compiledFinal.phases.slice(0,index).flatMap(phase=>phase.steps));}
  const firstGroup=grouped.prefixes[3]!,secondGroup=grouped.prefixes[4]!;
  expect(firstGroup.completedSteps.at(-1)).toBe(first.effect.id);expect(secondGroup.completedSteps.at(-1)).toBe(second.effect.id);
  const secondTables=secondGroup.catalog.tables;if(!secondTables)throw new Error('Scheduled test frame has no tables collection.');
  expect(secondGroup.catalog).not.toBe(firstGroup.catalog);expect(secondTables).not.toBe(firstGroup.catalog.tables);
  expect(secondGroup.tableStates).not.toBe(firstGroup.tableStates);expect(secondGroup.seedStates).not.toBe(firstGroup.seedStates);expect(secondGroup.completedSteps).not.toBe(firstGroup.completedSteps);
  const firstBefore=structuredClone(firstGroup);secondTables.push({extra:true});secondGroup.tableStates.push({extra:true});secondGroup.seedStates.push({extra:true});secondGroup.completedSteps.push('later-only');
  expect(firstGroup).toEqual(firstBefore);
 }
 const compilerEmptyLegacy=scheduleTypedInventoryEffects(initial(),[],[],emptyPrefixCatalog(),compilerMetadataIds,[]),compilerEmpty=scheduleTypedInventoryEffectsForCompiler(initial(),[],[],emptyPrefixCatalog(),compilerMetadataIds,[]);
 expect(compilerEmpty).toEqual(oldFinalizedScheduleReference(compilerEmptyLegacy,compilerMetadataIds));expect(compilerEmpty.metadataStepIds).toEqual({prepare:'step-00001',approval:'step-00002',publication:'step-00003'});
 const oldTable=makeCreate('old',3),keptTable=makeCreate('kept',1),changedTable=makeCreate('changed',2),stableTable=makeCreate('stable',4),initialCatalog=emptyPrefixCatalog();
 const oldMeaning:GraphTestJson={},keptBeforeMeaning:GraphTestJson={rls:{enabled:false,forced:false}},keptAfterMeaning:GraphTestJson={rls:{enabled:true,forced:false}},changedBeforeMeaning:GraphTestJson={rls:{enabled:false,forced:false}},changedAfterMeaning:GraphTestJson={rls:{enabled:true,forced:false}};
 const stableMeaning:GraphTestJson={extensions:{'vendor.未知':{unicode:'snowman ☃ / café',quoted:'quote" backslash\\ line\n',nested:{z:1,a:2}},large:'x'.repeat(1024)}};
 const oldRow:GraphTestJson={identity:oldTable.identity,meaning:oldMeaning,state:'present'},keptRow:GraphTestJson={identity:keptTable.identity,meaning:keptBeforeMeaning,state:'present'},changedRow:GraphTestJson={identity:changedTable.identity,meaning:changedBeforeMeaning,state:'present'},stableRow:GraphTestJson={identity:stableTable.identity,meaning:stableMeaning,state:'present'};
 const targetKeptRow:GraphTestJson={identity:keptTable.identity,meaning:keptAfterMeaning,state:'present'},targetChangedRow:GraphTestJson={identity:changedTable.identity,meaning:changedAfterMeaning,state:'present'},targetStableRow:GraphTestJson={identity:stableTable.identity,meaning:stableMeaning,state:'present'};
 const oldCheckIdentity:GraphTestJson={kind:'check',table:'old',subject:'old-check'},oldCheckBefore:GraphTestJson={identity:oldCheckIdentity,meaning:{check:'before'},state:'present'},oldCheckAfter:GraphTestJson={identity:oldCheckIdentity,meaning:{check:'after'},state:'present'};
 const oldCommentIdentity:GraphTestJson={kind:'comment',table:'old',subject:'old-comment'},oldComment:GraphTestJson={identity:oldCommentIdentity,meaning:{text:'old'},state:'present'},oldCommentAfter:GraphTestJson={identity:oldCommentIdentity,meaning:{text:'updated'},state:'present'};
 const stableColumnA:GraphTestJson={identity:{kind:'column',table:'stable',subject:{module:'graph_snapshot',element:'stable_a'}},meaning:{name:'a'},state:'present'},stableColumnB:GraphTestJson={identity:{kind:'column',table:'stable',subject:{module:'graph_snapshot',element:'stable_b'}},meaning:{name:'b'},state:'present'};
 const globalGrant:GraphTestJson={identity:{kind:'grant',table:null,subject:['public','usage',null]},meaning:{role:'public',privilege:'usage',table:null},state:'present'},stableGrantA:GraphTestJson={identity:{kind:'grant',table:'stable',subject:['reader','select','a']},meaning:{role:'reader',privilege:'select',table:'stable'},state:'present'},stableGrantB:GraphTestJson={identity:{kind:'grant',table:'stable',subject:['reader','select','b']},meaning:{role:'reader',privilege:'select',table:'stable'},state:'present'};
 initialCatalog.tables!.push(oldRow,keptRow,changedRow,stableRow);initialCatalog.checks!.push(oldCheckBefore);initialCatalog.comments!.push(oldComment);initialCatalog.columns!.push(stableColumnA,stableColumnB);initialCatalog.grants!.push(globalGrant,stableGrantA,stableGrantB);
 const oldRecord=oldTable.identity.subject,keptRecord=keptTable.identity.subject,changedRecord=changedTable.identity.subject,stableRecord=stableTable.identity.subject;
 const populated:Omit<PrefixFrame,'digest'>={...initial(),metadata:{profile:'umf.table-inventory-metadata/0.1',state:'published'},catalog:initialCatalog,tableStates:[{table:'old',record:oldRecord,state:'present',definitionDigest:'wrong-incoming-digest',creationStep:null,removalStep:null},{table:'kept',record:keptRecord,state:'present',definitionDigest:'',creationStep:null,removalStep:null},{table:'changed',record:changedRecord,state:'present',definitionDigest:'',creationStep:null,removalStep:null},{table:'stable',record:stableRecord,state:'present',definitionDigest:'',creationStep:null,removalStep:null}]};
 const enableKept:EffectNode={...keptTable.effect,id:'enable-kept',operation:'enable-rls',sql:'ALTER TABLE kept ENABLE ROW LEVEL SECURITY',transition:{action:'update',collection:'tables',meaning:keptAfterMeaning}};
 const changeOldCheck:EffectNode={...changedTable.effect,id:'enable-changed',operation:'enable-rls',sql:'ALTER TABLE changed ENABLE ROW LEVEL SECURITY',transition:{action:'update',collection:'tables',meaning:changedAfterMeaning},catalogMutations:[{collection:'comments',action:'replace',identity:oldCommentIdentity,before:oldComment,after:oldCommentAfter}]};
 const removeOld:EffectNode={...oldTable.effect,id:'remove-old',operation:'remove-table',sql:'DROP TABLE old',transition:{action:'remove',collection:'tables',meaning:{}},catalogMutations:[{collection:'checks',action:'remove',identity:oldCheckIdentity,before:oldCheckAfter,after:null},{collection:'comments',action:'remove',identity:oldCommentIdentity,before:oldCommentAfter,after:null}]};
 const target=emptyPrefixCatalog();target.tables!.push(targetKeptRow,targetChangedRow,targetStableRow);target.columns!.push(stableColumnB,stableColumnA);target.grants!.push(stableGrantA,globalGrant,stableGrantB);
 const provenance:CatalogMutation[]=[{collection:'checks',action:'replace',identity:oldCheckIdentity,before:oldCheckBefore,after:oldCheckAfter}];
 const ordered=scheduleTypedInventoryEffects(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,undefined,provenance);
 expect(ordered.prefixes[3]!.catalog.tables!.map(row=>graphTableIdentity(row).table)).toEqual(['kept','changed','stable','old']);
 const incomingOldState=ordered.prefixes[0]!.tableStates.find(state=>!!state&&typeof state==='object'&&!Array.isArray(state)&&(state as Record<string,GraphTestJson>).table==='old') as Record<string,GraphTestJson>|undefined;
 const refreshedOldState=ordered.prefixes[3]!.tableStates.find(state=>!!state&&typeof state==='object'&&!Array.isArray(state)&&(state as Record<string,GraphTestJson>).table==='old') as Record<string,GraphTestJson>|undefined;
 expect(incomingOldState?.definitionDigest).toBe('wrong-incoming-digest');expect(refreshedOldState?.definitionDigest).not.toBe('wrong-incoming-digest');
 expect(graphTableIdentity(ordered.prefixes[3]!.catalog.tables![0])).toEqual(keptTable.identity);
 for(const frame of ordered.prefixes){const {digest,...body}=frame;expect(digest).toBe(hashCanonical(body));}
 for(const frame of ordered.prefixes.slice(3))assertNormativeTableDefinitionDigests(frame);
 expect((ordered.prefixes[3]!.catalog.checks![0] as {meaning:GraphTestJson}).meaning).toEqual({check:'after'});
 expect(ordered.prefixes[3]!.catalog.columns!.map(row=>(row as {identity:{subject:{element:string}}}).identity.subject.element)).toEqual(['stable_b','stable_a']);
 expect(populated.catalog.columns!.map(row=>(row as {identity:{subject:{element:string}}}).identity.subject.element)).toEqual(['stable_a','stable_b']);
 expect(ordered.prefixes[3]!.catalog.grants!.map(row=>(row as {identity:{table:string|null}}).identity.table)).toEqual(['stable',null,'stable']);
 expect(ordered.prefixes[4]!.catalog.comments!.some(row=>(row as {identity:{table:string|null}}).identity.table==='old')).toBe(true);
 expect(ordered.prefixes[5]!.tableStates.find(state=>!!state&&typeof state==='object'&&!Array.isArray(state)&&(state as Record<string,GraphTestJson>).table==='old')).toMatchObject({state:'absent',definitionDigest:hashCanonical(null)});
 const countedMeter=new PrefixCanonicalCountingMeter(),counted=scheduleTypedInventoryEffects(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,undefined,provenance,countedMeter);
 expect(counted.prefixes.map(frame=>frame.digest)).toEqual(ordered.prefixes.map(frame=>frame.digest));expect(countedMeter.rowCanonicalMisses).toBe(15);
 const finalTextMeter=new PrefixCanonicalCountingMeter(),finalTextSchedule=scheduleTypedInventoryEffectsForCompilerCanonical(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,{prepare:'prepare',approval:'approval',publication:'publication'},provenance,finalTextMeter);
 expect(finalTextSchedule.canonicalPrefixes.map(item=>item.text)).toEqual(finalTextSchedule.schedule.prefixes.map(frame=>canonical(frame)));
 expect(finalTextSchedule.canonicalPrefixes.map(item=>item.byteLength)).toEqual(finalTextSchedule.schedule.prefixes.map(frame=>new TextEncoder().encode(canonical(frame)).byteLength));expect(finalTextMeter.rowCanonicalMisses).toBe(15);
 const failedTextMeter=new class extends PrefixCanonicalCountingMeter{prefixChunks=0;override visit(category:string,path:string,count=1):void{if(category==='graph-prefix-canonical-text-retention'&&++this.prefixChunks===4)throw new Error('CONTROLLED_PREFIX_TEXT_RETENTION_FAILURE');super.visit(category,path,count);}};
 expect(()=>scheduleTypedInventoryEffectsForCompilerCanonical(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,{prepare:'prepare',approval:'approval',publication:'publication'},provenance,failedTextMeter)).toThrow('CONTROLLED_PREFIX_TEXT_RETENTION_FAILURE');expect(failedTextMeter.prefixChunks).toBe(4);
 const freshTextRetry=scheduleTypedInventoryEffectsForCompilerCanonical(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-update-order',state:'present'}],target,{prepare:'prepare',approval:'approval',publication:'publication'},provenance,new PrefixCanonicalCountingMeter());expect(freshTextRetry.canonicalPrefixes.map(item=>item.text)).toEqual(finalTextSchedule.canonicalPrefixes.map(item=>item.text));
 const fullPrefixBytes=counted.prefixes.reduce((total,frame)=>{const {digest,...body}=frame;return total+new TextEncoder().encode(canonical(body)).byteLength;},0);expect(countedMeter.snapshot().bytes).toBeGreaterThanOrEqual(fullPrefixBytes);
 const failedMeter=new PrefixCanonicalCountingMeter();failedMeter.failBeforeRowCanonical=true;expect(()=>scheduleTypedInventoryEffects(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,undefined,provenance,failedMeter)).toThrow('CONTROLLED_ROW_CANONICAL_RETENTION_FAILURE');expect(failedMeter.bytesAtRowFailure).toBe(failedMeter.snapshot().bytes);expect(failedMeter.rowCanonicalMisses).toBe(0);
 const retryMeter=new PrefixCanonicalCountingMeter(),retried=scheduleTypedInventoryEffects(populated,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,undefined,provenance,retryMeter);expect(retried.prefixes.map(frame=>frame.digest)).toEqual(ordered.prefixes.map(frame=>frame.digest));expect(retryMeter.rowCanonicalMisses).toBe(15);
 const duplicateTarget=emptyPrefixCatalog();duplicateTarget.tables!.push(targetKeptRow,structuredClone(targetKeptRow));
 expect(()=>scheduleTypedInventoryEffects(populated,[enableKept],[],duplicateTarget)).toThrow('G10_SCHEDULE_TARGET_CATALOG_DUPLICATE');
 const unknownIdentity:GraphTestJson={kind:'check',table:'ghost',subject:'unowned-check'},unknownRow:GraphTestJson={identity:unknownIdentity,meaning:{},state:'present'};
 const injectUnknown:EffectNode={...enableKept,catalogMutations:[{collection:'checks',action:'add',identity:unknownIdentity,before:null,after:unknownRow}]};
 expect(()=>scheduleTypedInventoryEffects(populated,[injectUnknown],[],target)).toThrow('G10_SCHEDULE_PREFIX_CATALOG_UNKNOWN_SUBJECT');
 const referencedInitial=structuredClone(populated);(referencedInitial.tableStates[1] as Record<string,GraphTestJson>).creationStep='enable-kept';
 const referenced=scheduleTypedInventoryEffectsForCompiler(referencedInitial,[enableKept,changeOldCheck,removeOld],[{dependent:hashCanonical(changedTable.identity),prerequisite:hashCanonical(keptTable.identity),sourcePath:'/tests/change-after-kept',reason:'source-update-order',state:'present'},{dependent:hashCanonical(oldTable.identity),prerequisite:hashCanonical(changedTable.identity),sourcePath:'/tests/remove-after-change',reason:'source-remove-order',state:'present'}],target,{prepare:'prepare',approval:'approval',publication:'publication'},provenance);
 expect((referenced.prefixes[0]!.tableStates[1] as Record<string,GraphTestJson>).creationStep).toBe(referenced.steps[0]!.id);
 const badReference=structuredClone(populated);(badReference.tableStates[1] as Record<string,GraphTestJson>).creationStep='missing-step';expect(()=>scheduleTypedInventoryEffectsForCompiler(badReference,[enableKept,changeOldCheck,removeOld],[],target,{prepare:'prepare',approval:'approval',publication:'publication'},provenance)).toThrow('G10_SCHEDULE_COMPILER_INITIAL_STEP_REFERENCE');
 const revived=makeCreate('revived',2),removeRevived:EffectNode={...revived.effect,id:'remove-revived',operation:'remove-table',sourceOrder:1,transition:{action:'remove',collection:'tables',meaning:{}}},createRevived:EffectNode={...revived.effect,id:'create-revived'},reviveInitial=initial();reviveInitial.metadata={profile:'umf.table-inventory-metadata/0.1',state:'published'};reviveInitial.catalog.tables!.push({identity:revived.identity,meaning:{},state:'present'});reviveInitial.tableStates.push({table:'revived',record:revived.identity.subject,state:'present',definitionDigest:'',creationStep:null,removalStep:null});
 const revivedSchedule=scheduleTypedInventoryEffectsForCompiler(reviveInitial,[createRevived,removeRevived],[],{...emptyPrefixCatalog(),tables:[{identity:revived.identity,meaning:{},state:'present'}]},{prepare:'prepare',approval:'approval',publication:'publication'},[]);
 expect(revivedSchedule.steps.map(step=>step.operation)).toEqual(['remove-table','create-table']);expect((revivedSchedule.prefixes[3]!.tableStates[0] as Record<string,GraphTestJson>).state).toBe('absent');expect((revivedSchedule.prefixes[4]!.tableStates[0] as Record<string,GraphTestJson>).state).toBe('present');
});

test('compiler final IDs preserve complete plan serialization bytes against the legacy remap-and-hash path',()=>{
 const next=deploy(legalSource()),projected=projectG10Bundle(next,'next'),renderer=deriveInitialRendererEffects(next,projected.projection),metadataIds={prepare:'g10-inventory-prepare',approval:'g10-inventory-approval',publication:'g10-inventory-publication'};
 const inventory:InventoryDelta={profile:'umf.table-inventory-delta/0.1',previousTables:[],nextTables:projected.tables,changes:[],fieldChanges:[],seedLineage:[]};
 const input:InventoryPlanInput={id:'legacy-plan-serialization-parity',predecessor:null,previous:null,next,options:{},history:emptyHistory as unknown as InventoryPlanInput['history'],historyBinding:{profile:emptyHistory.profile,count:0,digest:hashCanonical(emptyHistory)},inventory,initialPrefix:initialInventoryPrefix(null),nextCatalog:projected.projection.catalog as unknown as Record<string,GraphTestJson[]>,effects:renderer.effects,dependencies:renderer.edges,publicationObligations:renderer.publicationObligations,provenanceMutations:deriveG10ProvenanceMutations(null,projected.projection,renderer.effects),seedExecution:'none',review:projected.reviews as unknown as InventoryPlanInput['review']};
 const actual=compileInventoryPlan(input),unfinalized=scheduleTypedInventoryEffects(input.initialPrefix,input.effects,input.dependencies,input.nextCatalog,metadataIds,input.provenanceMutations),legacy=oldFinalizedScheduleReference(unfinalized,metadataIds),legacySections=oldInventoryPlanSections(legacy),expected=structuredClone(actual) as Record<string,GraphTestJson>;
 expected.steps=legacySections.steps;expected.phases=legacySections.phases;expected.prefixes=legacySections.prefixes;delete expected.digest;expected.digest=hashCanonical(expected);
 expect(canonical(actual)).toBe(canonical(expected));expect(actual.digest).toBe(expected.digest);
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

describe('G10 historical recompile exact-content cache',()=>{
 let completed:ReturnType<typeof historicalCacheFixture>;
 beforeAll(()=>{completed=historicalCacheFixture();},15000);
 test('initial and second G10 plans compile through their original public requests',()=>{
  const fixture=structuredClone(completed);expect(fixture.first.version).toBe('umf.table-inventory-migration/0.1');expect(fixture.second.version).toBe('umf.table-inventory-migration/0.1');
 },15000);
 test('reuses only exact plans and exact prior-history members',()=>{
  const {first,second,history}=structuredClone(completed),verify=createHistoricalG10Verifier();verify(first,0,emptyHistory);verify(second,1,history);expect(()=>verify(second,1,history)).not.toThrow();
 },15000);
 test('rejects a changed cached plan under the same history position',()=>{
  const {second,history}=structuredClone(completed),verify=createHistoricalG10Verifier();verify(history.plans[0]!,0,emptyHistory);verify(second,1,history);
  const changedPlan=structuredClone(history);(changedPlan.plans[0] as any).id='mutated-plan';expect(()=>verify(second,1,changedPlan)).toThrow();
 },15000);
 test('rejects changed prior execution bytes on a cache hit',()=>{
  const {second,history}=structuredClone(completed),verify=createHistoricalG10Verifier();verify(history.plans[0]!,0,emptyHistory);verify(second,1,history);
  const changedExecution=structuredClone(history);changedExecution.executions[0]!.entryDigest='e'.repeat(64);expect(()=>verify(second,1,changedExecution)).toThrow();
 },15000);
});

const R2_DIAGNOSTIC_PHASES=['owned','history','projection','lineage'] as const;
const R2_DIAGNOSTIC_CATEGORIES=['raw-owning','request-recopy','canonical/hash','deployment/renderer','projection-JSON','projection-other','index/freeze','history-validation','cache','other'] as const;
const R2_DIAGNOSTIC_PATHS=['previous','next','history-plan','history-prefix','history-other','options','source/document','meaning-catalog','meaning-other','index','plan/operations','other'] as const;
function installOneFixtureR2MeterDiagnostic(){
 const proto=R2WorkMeter.prototype as any,leaves=['charge','chargeBytes','chargeWorkBytes','retainSubject','snapshot','visit'] as const;
 const saved=new Map<string,PropertyDescriptor>(),phases=R2_DIAGNOSTIC_PHASES,categories=R2_DIAGNOSTIC_CATEGORIES,paths=R2_DIAGNOSTIC_PATHS;
 type Total={calls:number;work:number;bytes:number;subjects:number};
 const zero=():Total=>({calls:0,work:0,bytes:0,subjects:0});
 const byPhase=(labels:readonly string[])=>Object.fromEntries(phases.map(phase=>[phase,Object.fromEntries(labels.map(label=>[label,zero()]))])) as Record<(typeof phases)[number],Record<string,Total>>;
 const phaseTotals=Object.fromEntries(phases.map(phase=>[phase,zero()])) as Record<(typeof phases)[number],Total>,categoryTotals=byPhase(categories),pathTotals=byPhase(paths);
 const checkpoints:{work:number;subjects:number;bytes:number}[]=[];let meter:R2WorkMeter|undefined,activeCategory:string|undefined,unexpectedMeters=0,incomplete=false;
 const cache={hit:0,miss:0,reuse:0,historyBundleHit:0,currentBundleHit:0};let rejection:{leaf:string;dimension:string;path:string;callsite?:string}|undefined;
 const dimension=(error:unknown,fallback:string)=>error instanceof R2WorkLimitError?error.dimension:fallback;
 const observe=(candidate:unknown)=>{if(!candidate||typeof candidate!=='object')return;const value=candidate as R2WorkMeter;if(!meter){meter=value;return;}if(value!==meter){unexpectedMeters++;incomplete=true;}};
 const categoryOf=(label:string|undefined,event:string|undefined,pathBucket:string):string=>{
  const tags=`${label??''} ${event??''}`;
  if(/cache-(?:hit|miss)|core-reuse/.test(tags))return 'cache';
  if(/history|seed-lineage|seed-history/.test(tags)||pathBucket.startsWith('history-'))return 'history-validation';
  if(/rawOwnKeys|ownPropertyDescriptor|r2-raw|component-container|snapshot/.test(tags))return 'raw-owning';
  if(/inventory-(?:bundle|component|operation)-copy|request-recopy/.test(tags))return 'request-recopy';
  if(/canonical|hash/.test(tags))return 'canonical/hash';
  if(/deployment|renderer/.test(tags))return 'deployment/renderer';
  if(/projection-json|meaning/.test(tags)||pathBucket.startsWith('meaning-'))return 'projection-JSON';
  if(/projection/.test(tags))return 'projection-other';
  if(/index|freeze/.test(tags))return 'index/freeze';
  return 'other';
 };
 const pathOf=(path:unknown):string=>{
  if(typeof path!=='string')return 'other';
  if(path.startsWith('/previous'))return 'previous';if(path.startsWith('/next'))return 'next';
  if(path.startsWith('/history/plans'))return 'history-plan';if(path.startsWith('/history/prefix'))return 'history-prefix';if(path.startsWith('/history'))return 'history-other';
  if(path.startsWith('/options'))return 'options';if(path.startsWith('/source')||path.startsWith('/document'))return 'source/document';
  if(path.startsWith('/meaning/catalog'))return 'meaning-catalog';if(path.startsWith('/meaning'))return 'meaning-other';
  if(path.startsWith('/index'))return 'index';if(path.startsWith('/plan')||path.startsWith('/operations'))return 'plan/operations';return 'other';
 };
 const add=(event:string|undefined,path:unknown,work:number,bytes:number,subjects:number)=>{
  const phase=phases[Math.min(checkpoints.length,phases.length-1)]!,pathBucket=pathOf(path),category=categoryOf(activeCategory,event,pathBucket);
  for(const target of [phaseTotals[phase],categoryTotals[phase]![category]!,pathTotals[phase]![pathBucket]!]){target.calls++;target.work+=work;target.bytes+=bytes;target.subjects+=subjects;}
 };
 const reject=(leaf:string,dimension:string,path:unknown)=>{if(rejection)return;let callsite:string|undefined;const errorConstructor=Error as typeof Error&{stackTraceLimit?:number},descriptor=Object.getOwnPropertyDescriptor(Error,'stackTraceLimit');try{errorConstructor.stackTraceLimit=48;const stack=new Error().stack;if(typeof stack==='string')callsite=stack.split('\n').slice(1).slice(-24).join('\n').slice(0,4096);}catch{/* callsite diagnostics must not replace the original failure */}finally{try{if(descriptor)Object.defineProperty(Error,'stackTraceLimit',descriptor);else Reflect.deleteProperty(errorConstructor,'stackTraceLimit');}catch{/* preserve the diagnostic path even if stack configuration is unavailable */}}rejection={leaf,dimension,path:typeof path==='string'?path.slice(0,256):'',...(callsite?{callsite}:{})};};
 const original=(name:string)=>{const descriptor=Object.getOwnPropertyDescriptor(proto,name);if(!descriptor||typeof descriptor.value!=='function')throw new Error(`R2 diagnostic expected prototype method ${name}`);saved.set(name,descriptor);return descriptor.value as (...args:any[])=>any;};
 const originals=Object.fromEntries(leaves.map(name=>[name,original(name)])) as Record<(typeof leaves)[number],(...args:any[])=>any>;
 const wrappers:Record<string,Function>={
  charge:function(this:R2WorkMeter,event:string,count=1,path='/'){observe(this);try{const result=Reflect.apply(originals.charge,this,[event,count,path]);add(event,path,R2_WORK_EVENT_UNITS[event as keyof typeof R2_WORK_EVENT_UNITS]*count,0,0);return result;}catch(error){reject('charge',dimension(error,'work'),path);throw error;}},
  chargeBytes:function(this:R2WorkMeter,count:number,path:string){observe(this);try{const result=Reflect.apply(originals.chargeBytes,this,[count,path]);add(undefined,path,Math.ceil(count/4096),count,0);return result;}catch(error){reject('chargeBytes',dimension(error,'bytes-or-work'),path);throw error;}},
  chargeWorkBytes:function(this:R2WorkMeter,count:number,path:string){observe(this);try{const result=Reflect.apply(originals.chargeWorkBytes,this,[count,path]);add(undefined,path,Math.ceil(count/4096),0,0);return result;}catch(error){reject('chargeWorkBytes',dimension(error,'work'),path);throw error;}},
  retainSubject:function(this:R2WorkMeter,identityOrPath:unknown,path?:string){observe(this);try{const result=Reflect.apply(originals.retainSubject,this,[identityOrPath,path]);add(undefined,path,1,0,1);return result;}catch(error){reject('retainSubject',dimension(error,'subjects-or-work'),path);throw error;}},
  snapshot:function(this:R2WorkMeter){observe(this);const result=Reflect.apply(originals.snapshot,this,[]);if(checkpoints.length<5)checkpoints.push(result);else{unexpectedMeters++;incomplete=true;}return result;},
  visit:function(this:R2WorkMeter,label:string,path:string,count=1){observe(this);if(label.endsWith('cache-hit'))cache.hit++;else if(label.endsWith('cache-miss'))cache.miss++;else if(label.endsWith('core-reuse'))cache.reuse++;if(label==='r2-history-owned-bundle-cache-hit')cache.historyBundleHit++;if(label==='r2-current-root-bundle-cache-hit')cache.currentBundleHit++;const previous=activeCategory;activeCategory=label;try{return Reflect.apply(originals.visit,this,[label,path,count]);}finally{activeCategory=previous;}},
 };
 const installed:string[]=[];
 try{for(const name of leaves){Object.defineProperty(proto,name,{...saved.get(name)!,value:wrappers[name]});installed.push(name);}}
 catch(error){for(const name of installed)Object.defineProperty(proto,name,saved.get(name)!);throw error;}
 let restored=false;
 return {
  restore(){if(restored)return;restored=true;for(const name of leaves)Object.defineProperty(proto,name,saved.get(name)!);},
  report(){
   const consumed={work:0,bytes:0,subjects:0,calls:0};for(const phase of phases){const value=phaseTotals[phase];consumed.work+=value.work;consumed.bytes+=value.bytes;consumed.subjects+=value.subjects;consumed.calls+=value.calls;}
   const final=meter?Reflect.apply(originals.snapshot,meter,[]) as {work:number;subjects:number;bytes:number}:undefined,reconciliation={complete:checkpoints.length===5&&unexpectedMeters===0,expectedSnapshot:final?{work:final.work,bytes:final.bytes,subjects:final.subjects}:null,observed:consumed,matches:!!final&&final.work===consumed.work&&final.bytes===consumed.bytes&&final.subjects===consumed.subjects};
   if(!reconciliation.complete||!reconciliation.matches)incomplete=true;
   return {profile:'r2-one-fixture-meter-diagnostic/0.1',incomplete,checkpoints:checkpoints.map(value=>({work:value.work,bytes:value.bytes,subjects:value.subjects})),consumed,phases:phaseTotals,categories:categoryTotals,paths:pathTotals,cache,unexpectedMeters,rejection:rejection??null,reconciliation};
  },
 };
}

test('R2 metered context reuses exact source cores for a seeded Note history and mixed G02 plus CREATE',()=>{
 const fixture=smallNoteMixedG02Source(),compiled=compileTableInventoryMigration(fixture.request);
 expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled'){compileG10InventoryPlan(fixture.request);throw new Error(JSON.stringify(compiled.diagnostics));}
 expect(fixture.previous.seedSets).toEqual(fixture.next.seedSets);expect(fixture.history.executions[0]!.seedOutcomes).toHaveLength(1);
 expect(fixture.history.executions[0]!.seedOutcomes[0]).toMatchObject({id:'initial-note-seed',execution:'confirmed'});
 expect(compiled.plan.seedExecution).toBe('none');expect(compiled.plan.steps.some(step=>step.sourcePath.includes('backfills/0'))).toBe(true);
 const digestPreimage=structuredClone(compiled.plan) as any,planDigest=digestPreimage.digest;delete digestPreimage.digest;expect(planDigest).toBe(hashCanonical(digestPreimage));
 const nextSource=JSON.parse(fixture.next.source.utf8);expect(nextSource.modules[0].extensions['umf.tables'].tables[0].columns.find((column:any)=>column.name==='summary').default).toEqual({kind:'literal',value:{string:'future summary'}});
 const summaryColumn=fixture.next.expectedCatalog.columns.find((column:any)=>column.table==='notes'&&column.field.element==='summary')!,summarySteps=compiled.plan.steps.filter(step=>step.sourcePath===summaryColumn.sourcePath||step.sourcePath==='/options/backfills/0'&&step.operation==='apply-backfill');
 expect(summarySteps.map(step=>step.operation)).toEqual(['add-column','apply-backfill','install-default','tighten-not-null']);
 expect(compiled.plan.review).toEqual(fixture.candidates);expect(compiled.plan.inventory.changes.some(change=>change.kind==='create-table'&&change.table==='note_archive')).toBe(true);
 const selector02={version:'umf.table-inventory-discovery/0.2' as const,tableIntents:[],conversions:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[]};
 const mixedHistory:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[...fixture.history.plans,compiled.plan],executions:[...fixture.history.executions,seedExecution(compiled.plan,fixture.next,'e'.repeat(64))]};
 const ownershipMeter=new R2WorkMeter(),ownedHistory=ownR2HistoryComponent(mixedHistory,ownershipMeter).value,ownedPlan=ownedHistory.plans[1]!,ownedPlanRecord=ownedPlan as unknown as Record<string,unknown>;
 expect(Object.isFrozen(ownedPlan)).toBe(true);expect(ownedR2HistoryPlanBundle(ownedPlan,'next',ownershipMeter)?.value).toEqual(compiled.plan.next);expect(ownedR2HistoryPlanBundle(ownedHistory.plans[0],'previous',ownershipMeter)?.value).toBeNull();
 const foreignMeter=new R2WorkMeter(),newInvocationMeter=new R2WorkMeter();expect(ownedR2HistoryPlanBundle({...ownedPlanRecord},'next',ownershipMeter)).toBeUndefined();expect(ownedR2HistoryPlanBundle(Object.freeze({...ownedPlanRecord}),'next',ownershipMeter)).toBeUndefined();expect(ownedR2HistoryPlanBundle(ownedHistory.executions[1],'next',ownershipMeter)).toBeUndefined();expect(ownedR2HistoryPlanBundle(ownedPlan,'next',foreignMeter)).toBeUndefined();expect(ownedR2HistoryPlanBundle(ownedPlan,'next',newInvocationMeter)).toBeUndefined();
 let unownedGetterReads=0;const unownedGetter=Object.defineProperty({},'next',{enumerable:true,get(){unownedGetterReads++;return compiled.plan.next;}});expect(ownedR2HistoryPlanBundle(unownedGetter,'next',ownershipMeter)).toBeUndefined();expect(unownedGetterReads).toBe(0);
 const diagnostic=installOneFixtureR2MeterDiagnostic();let handle:ReturnType<typeof prepareR2InventorySourceContext>|undefined;let originalFailure:unknown;let failed=false;
 try{handle=prepareR2InventorySourceContext({previous:fixture.next,next:fixture.next,history:mixedHistory,selector:selector02});}catch(error){failed=true;originalFailure=error;}finally{diagnostic.restore();}
 if(failed){try{const report=diagnostic.report(),text=JSON.stringify(report);if(text.length<=16_384)console.error('[R2_ONE_FIXTURE_METER_DIAGNOSTIC] '+text);else console.error('[R2_ONE_FIXTURE_METER_DIAGNOSTIC] '+JSON.stringify({profile:report.profile,incomplete:report.incomplete,checkpointNames:['owned','history','projection','lineage','lineage-final'],checkpoints:report.checkpoints,consumed:report.consumed,phaseNames:R2_DIAGNOSTIC_PHASES,phases:R2_DIAGNOSTIC_PHASES.map(name=>report.phases[name]),categoryNames:R2_DIAGNOSTIC_CATEGORIES,categories:R2_DIAGNOSTIC_PHASES.map(name=>R2_DIAGNOSTIC_CATEGORIES.map(category=>report.categories[name][category]!)),pathNames:R2_DIAGNOSTIC_PATHS,paths:R2_DIAGNOSTIC_PHASES.map(name=>R2_DIAGNOSTIC_PATHS.map(path=>report.paths[name][path]!)),cache:report.cache,unexpectedMeters:report.unexpectedMeters,rejection:report.rejection,reconciliation:report.reconciliation}));}catch{/* diagnostics must not replace the original failure */}throw originalFailure;}
 expect(diagnostic.report().cache.historyBundleHit).toBeGreaterThan(0);
 expect(diagnostic.report().cache.currentBundleHit).toBeGreaterThan(0);
 if(!handle)throw new Error('R2 context preparation returned no handle.');const state=inspectR2InventorySourceContext(handle);
 expect(state.history.plans).toHaveLength(2);expect(state.history.plans[1]).toEqual(compiled.plan);expect(state.history.executions[1]).toEqual(seedExecution(compiled.plan,fixture.next,'e'.repeat(64)));expect(state.seedLineage).toMatchObject([{id:'initial-note-seed',execution:'confirmed'}]);
 const current={previous:fixture.next,next:fixture.next,options:{seedSets:[],retiredSeedSets:[]}},recoveryMeter=new R2WorkMeter(),recoveryOwned=ownR2SourceComponents({previous:fixture.next,next:fixture.next,history:mixedHistory,selector:selector02},recoveryMeter);
 const recoveredLineage=deriveInventorySeedLineage(recoveryOwned.history as unknown as TableInventorySourceHistory,{previous:recoveryOwned.previous as unknown as TableDeploymentBundle|null,next:recoveryOwned.next as unknown as TableDeploymentBundle,options:current.options},createHistoricalG10Verifier(recoveryMeter),recoveryMeter);
 expect(recoveredLineage).toEqual([...state.seedLineage]);
 expect(state.projectionCoreReuses).toBeGreaterThan(0);
 const snapshots=[state.phaseBudgets.owned,state.phaseBudgets.history,state.phaseBudgets.projection,state.phaseBudgets.lineage];
 expect(snapshots.every((item,index)=>index===0||item.work>=snapshots[index-1]!.work)).toBe(true);
 expect(snapshots.every((item,index)=>index===0||item.subjects>=snapshots[index-1]!.subjects)).toBe(true);
 expect(snapshots.every((item,index)=>index===0||item.bytes>=snapshots[index-1]!.bytes)).toBe(true);
 expect(state.phaseBudgets.lineage).toEqual(state.budget);
 expect(Object.isFrozen(state.history)).toBe(true);expect(Object.isFrozen(state.history.executions)).toBe(true);expect(Object.isFrozen(state.history.executions[0]!.seedOutcomes[0]!.proof)).toBe(true);
 expect(()=>{(state.history.executions[0]!.seedOutcomes[0]!.proof as any).phaseDigest='1'.repeat(64);}).toThrow();
 expect(()=>inspectR2InventorySourceContext(Object.freeze(Object.create(null)))).toThrow('R2_CONTEXT_HANDLE');
 const changedPlan=structuredClone(mixedHistory);(changedPlan.plans[1] as any).steps[0]!.sql+=' ';delete (changedPlan.plans[1] as any).digest;(changedPlan.plans[1] as any).digest=hashCanonical(changedPlan.plans[1]);changedPlan.executions[1]!.planDigest=(changedPlan.plans[1] as any).digest;
 const changedPlanMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPlan,current,createHistoricalG10Verifier(changedPlanMeter),changedPlanMeter)).toThrow();
 const changedPrefix=structuredClone(mixedHistory);changedPrefix.executions[0]!.entryDigest='f'.repeat(64);
 const changedPrefixMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPrefix,current,createHistoricalG10Verifier(changedPrefixMeter),changedPrefixMeter)).toThrow();
 const changedPhase=structuredClone(mixedHistory);(changedPhase.executions[0]!.seedOutcomes[0]!.proof as any).phaseDigest='0'.repeat(64);
 const changedPhaseMeter=new R2WorkMeter();expect(()=>deriveInventorySeedLineage(changedPhase,current,createHistoricalG10Verifier(changedPhaseMeter),changedPhaseMeter)).toThrow();
 expect(()=>deriveInventorySeedLineage(originalHistory(fixture.next),current,undefined,new R2WorkMeter())).toThrow(/UNSUPPORTED_METERED_LEGACY_HISTORY/);
 const originalNextSource=fixture.next.source.utf8;fixture.next.source.utf8='caller mutation after registration';expect(state.owned.next?.source.utf8).toBe(originalNextSource);
});
test('R2 current-root canonical reuse requires the exact same-meter source-owner association',()=>{
 const fixture=smallNoteMixedG02Source(),meter=new R2WorkMeter(),selector02={version:'umf.table-inventory-discovery/0.2' as const,tableIntents:[],conversions:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[]};
 const roots=ownR2SourceComponents({previous:fixture.previous,next:fixture.next,history:emptyHistory,selector:selector02},meter);
 expect(ownedR2CurrentSourceCanonical(roots.previous,'previous',meter)).toBe(roots.canonicalInputs.previous);
 expect(ownedR2CurrentSourceCanonical(roots.next,'next',meter)).toBe(roots.canonicalInputs.next);
 expect(ownedR2CurrentSourceCanonical(roots.previous,'next',meter)).toBeUndefined();
 expect(ownedR2CurrentSourceCanonical(Object.freeze({...roots.next}),'next',meter)).toBeUndefined();
 expect(ownedR2CurrentSourceCanonical(structuredClone(roots.next),'next',meter)).toBeUndefined();
 expect(ownedR2CurrentSourceCanonical(roots.next.source,'next',meter)).toBeUndefined();
 expect(ownedR2CurrentSourceCanonical(roots.next,'next',new R2WorkMeter())).toBeUndefined();
 const snapshotOnly=snapshotR2Json(roots.next as unknown as import('../../src/table-migration/inventory-r2-context').R2Json,meter,'/snapshot-control').value;
 expect(ownedR2CurrentSourceCanonical(snapshotOnly,'next',meter)).toBeUndefined();
 let getterReads=0;const accessor=Object.defineProperty({},'bundleDigest',{enumerable:true,get(){getterReads++;return roots.next.bundleDigest;}});
 expect(ownedR2CurrentSourceCanonical(accessor,'next',meter)).toBeUndefined();expect(getterReads).toBe(0);
 const failedMeter=new R2WorkMeter(),priorRoots=ownR2SourceComponents({previous:fixture.previous,next:fixture.next,history:emptyHistory,selector:selector02},failedMeter);
 expect(()=>ownR2SourceComponents({previous:null,next:fixture.next,history:emptyHistory,selector:{}},failedMeter)).toThrow();
 expect(ownedR2CurrentSourceCanonical(priorRoots.previous,'previous',failedMeter)).toBe(priorRoots.canonicalInputs.previous);
 expect(ownedR2CurrentSourceCanonical(priorRoots.next,'next',failedMeter)).toBe(priorRoots.canonicalInputs.next);
 expect(ownedR2CurrentSourceCanonical(fixture.next,'next',failedMeter)).toBeUndefined();
 const nullMeter=new R2WorkMeter(),nullPrevious=ownR2SourceComponents({previous:null,next:fixture.next,history:emptyHistory,selector:selector02},nullMeter);
 expect(nullPrevious.previous).toBeNull();expect(nullPrevious.canonicalInputs.previous).toBeNull();
 expect(deriveInventorySeedLineage(nullPrevious.history as unknown as TableInventorySourceHistory,{previous:null,next:nullPrevious.next as unknown as TableDeploymentBundle,options:{seedSets:[],retiredSeedSets:[]}},undefined,nullMeter)).toMatchObject([{id:'initial-note-seed',disposition:'retain-definition'}]);
 const badNext={...fixture.next,bundleDigest:'0'.repeat(64)},failedVerificationMeter=new R2WorkMeter(),failedOwned=ownR2SourceComponents({previous:null,next:badNext,history:emptyHistory,selector:selector02},failedVerificationMeter);
 expect(()=>deriveInventorySeedLineage(failedOwned.history as unknown as TableInventorySourceHistory,{previous:null,next:failedOwned.next as unknown as TableDeploymentBundle,options:{seedSets:[],retiredSeedSets:[]}},undefined,failedVerificationMeter)).toThrow();
});
test('R2 final-plan retention failure returns no history context and a fresh invocation succeeds',()=>{
 const fixture=smallNoteMixedG02Source(),compiled=compileTableInventoryMigration(fixture.request);expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled'){compileG10InventoryPlan(fixture.request);throw new Error(JSON.stringify(compiled.diagnostics));}
 const selector02={version:'umf.table-inventory-discovery/0.2' as const,tableIntents:[],conversions:[],retiredSeedSets:[],retirements:[],restorations:[],archiveSources:[],tableArchiveSources:[]};
 const mixedHistory:TableInventorySourceHistory={profile:'umf.table-inventory-source-history/0.1',plans:[...fixture.history.plans,compiled.plan],executions:[...fixture.history.executions,seedExecution(compiled.plan,fixture.next,'e'.repeat(64))]};
 const meterPrototype=R2WorkMeter.prototype,visitDescriptor=Object.getOwnPropertyDescriptor(meterPrototype,'visit');if(!visitDescriptor||typeof visitDescriptor.value!=='function')throw new Error('R2 meter visit method descriptor is missing.');const originalVisit=visitDescriptor.value as (this:R2WorkMeter,category:string,path:string,count?:number)=>void,finalRetentionFailure={sentinel:'FINAL_PLAN_TEXT_RETENTION_CONTROL'};let finalRetentionReached=false,failedHandle:ReturnType<typeof prepareR2InventorySourceContext>|undefined,finalRetentionError:unknown;
 Object.defineProperty(meterPrototype,'visit',{...visitDescriptor,value:function(this:R2WorkMeter,category:string,path:string,count=1){if(category==='inventory-plan-final-text-result-retention'){finalRetentionReached=true;throw finalRetentionFailure;}return Reflect.apply(originalVisit,this,[category,path,count]);}});
 try{try{failedHandle=prepareR2InventorySourceContext({previous:fixture.next,next:fixture.next,history:mixedHistory,selector:selector02});}catch(error){finalRetentionError=error;}}finally{Object.defineProperty(meterPrototype,'visit',visitDescriptor);}
 expect(finalRetentionReached).toBe(true);expect(finalRetentionError).toBe(finalRetentionFailure);expect(failedHandle).toBeUndefined();
 const retry=prepareR2InventorySourceContext({previous:fixture.next,next:fixture.next,history:mixedHistory,selector:selector02}),state=inspectR2InventorySourceContext(retry);
 expect(state.history.plans).toHaveLength(2);expect(state.history.plans[1]).toEqual(compiled.plan);expect(state.history.executions[1]).toEqual(mixedHistory.executions[1]);expect(state.seedLineage).toMatchObject([{id:'initial-note-seed',execution:'confirmed'}]);
},15_000);

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
 test('historical verifier reuses the installed-create prefix only for exact history members',()=>{
  const {history,plan}=structuredClone(completed),exactVerifier=createHistoricalG10Verifier();
  exactVerifier(history.plans[0]!,0,emptyHistory);exactVerifier(plan,1,history);expect(()=>exactVerifier(plan,1,history)).not.toThrow();
  const alteredPrefix=structuredClone(history);alteredPrefix.executions[0]!.entryDigest='e'.repeat(64);expect(()=>exactVerifier(plan,1,alteredPrefix)).toThrow();
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
 expect(plan.prefixes).toHaveLength(plan.phases.length+1);
 for(let index=0;index<plan.prefixes.length;index++){
  const prefix=plan.prefixes[index]!,{digest,...body}=prefix;
  expect(prefix.index).toBe(index);
  expect(prefix.completedSteps).toEqual(plan.phases.slice(0,index).flatMap(phase=>phase.steps));
  expect(digest).toBe(hashCanonical(body));
  assertNormativeTableDefinitionDigests(prefix);
 }
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
