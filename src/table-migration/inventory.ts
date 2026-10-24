import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {UmfError} from '../model/errors';
import {initialInventoryPrefix,inventoryCatalogIdentity,scheduleTypedInventoryEffects,type CatalogMutation,type EffectNode,type InventorySubject,type ScheduledInventoryEffects,type TypedDependency} from './inventory-graph';
import type {InventoryChange,InventoryDelta,InventoryTable} from './inventory-source';
import type {PrefixFrame} from './inventory-graph';
import {compileG10InventoryDelta,deriveInventoryReviewCandidates,projectG10Bundle} from './inventory-source';
import {ShapeError,validateG10RequestShape,type G10ValidatedRequest,type HistoricalG10PlanVerifier} from './inventory-options';
import {deriveInventorySeedLineage} from './inventory-history';
import {deriveInitialRendererEffects,deriveG02FieldEffects,deriveG10ProvenanceMutations} from './inventory-effects';
import {partitionInventoryMarkersForG02} from './inventory-g02-source';
import {discoverInventoryReviewCandidates,discoverInventoryReviewCandidatesWithVerifier,inventoryMarker,type TableInventoryReviewedChangeCandidate} from './inventory-review';
import type {Diagnostic,Json as ModelJson} from '../model/types';
import type {TableInventoryDiscoverySelector,TableInventoryMigrationOptions,TableInventoryMigrationRequest,TableInventorySourceHistory} from './inventory-options';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
type MetadataPaths={prepare:'/inventory/metadata/prepare';approval:'/inventory/metadata/approval';publication:'/inventory/metadata/publication'};
const metadataPaths:MetadataPaths={prepare:'/inventory/metadata/prepare',approval:'/inventory/metadata/approval',publication:'/inventory/metadata/publication'};
const metadataSubject:InventorySubject={kind:'metadata',profile:'umf.table-inventory-metadata/0.1'};
function fail(code:string):never{throw new Error('G10_PLAN_'+code);}
function metadataStep(id:string,operation:'prepare-inventory-metadata'|'record-inventory-approval'|'publish-inventory',sourcePath:string):EffectNode{return {id,kind:'metadata',operation,subject:metadataSubject,sourcePath,sql:'',transaction:'required',recovery:'rollback-transaction',sourceOrder:0,atomicGroup:null,transition:{action:'update',collection:'tables',meaning:{state:operation==='publish-inventory'?'published':'pending'}}};}
function inventorySubject(subject:InventorySubject):Json {
 if(subject.kind==='schema-grant')return {kind:'schema-grant',schema:subject.schema,audiences:['person','batch'],privilege:'USAGE'};
 if(subject.kind==='table')return {kind:'table',table:subject.table,record:subject.record};
 if(subject.kind==='field')return {kind:'field',table:subject.table,field:subject.field};
 if(subject.kind==='dependency')return {kind:'dependency',table:subject.table,dependencyKind:subject.dependencyKind,id:subject.id,sourcePath:subject.sourcePath,meaningDigest:subject.meaningDigest};
 if(subject.kind==='seed')return {kind:'seed',sets:subject.sets};
 return {kind:'metadata',profile:subject.profile};
}
function serializedStep(effect:EffectNode,id:string,pre:string,post:string):Record<string,Json>{return {id,kind:effect.kind,sourcePath:effect.sourcePath,transaction:effect.transaction,sql:effect.sql,operation:effect.operation,inventorySubject:inventorySubject(effect.subject),preconditions:{kind:'inventory-prefix',prefixDigest:pre},expectedOutcome:{kind:'inventory-prefix',prefixDigest:post},verification:'native-catalog-privileges-and-role-scope',recovery:effect.recovery,...(effect.operation==='apply-seeds'&&effect.subject.kind==='seed'?{seedSets:effect.subject.sets}:{}),...(effect.operation==='apply-backfill'&&effect.dataBinding?{dataBinding:effect.dataBinding}:{})};}
function serialize(schedule:ScheduledInventoryEffects,rawEffects:EffectNode[],metadataIds:{prepare:string;approval:string;publication:string}):{steps:Record<string,Json>[];phases:Record<string,Json>[];prefixes:Json[]} {
 const effectById=new Map(rawEffects.map(effect=>[effect.id,effect])),idByOld=new Map<string,string>();let sequence=1;for(const id of [metadataIds.prepare,metadataIds.approval,...schedule.steps.map(step=>step.id),metadataIds.publication])idByOld.set(id,`step-${String(sequence++).padStart(5,'0')}`);
 const prefixes=schedule.prefixes.map(frame=>({...frame,completedSteps:frame.completedSteps.map(id=>idByOld.get(id)??fail('UNBOUND_COMPLETED_STEP'))}));
 for(const prefix of prefixes){
  for(const [index,raw]of prefix.tableStates.entries()){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('TABLE_STATE_SHAPE');
   const tableState=raw as Record<string,Json>;
   for(const key of ['creationStep','removalStep'] as const){
    const oldId=tableState[key];if(oldId===null)continue;
    if(typeof oldId!=='string')fail('TABLE_STATE_STEP_REFERENCE:'+index+':'+key);
    const newId=idByOld.get(oldId);if(!newId)fail('UNBOUND_TABLE_STATE_STEP:'+index+':'+key);tableState[key]=newId;
   }
  }
  const body={...prefix} as Record<string,Json>;delete body.digest;(prefix as Record<string,Json>).digest=hashCanonical(body);
 }
 const steps:Record<string,Json>[]=[];for(let phaseIndex=0;phaseIndex<schedule.phases.length;phaseIndex++){
  const phase=schedule.phases[phaseIndex]!,before=prefixes[phaseIndex]?.digest,after=prefixes[phaseIndex+1]?.digest;if(!before||!after)fail('PHASE_PREFIX_PAIR');
  for(const oldId of phase.steps){const id=idByOld.get(oldId);if(!id)fail('UNBOUND_PHASE_STEP');const metadata=oldId===metadataIds.prepare?metadataStep(id,'prepare-inventory-metadata',metadataPaths.prepare):oldId===metadataIds.approval?metadataStep(id,'record-inventory-approval',metadataPaths.approval):oldId===metadataIds.publication?metadataStep(id,'publish-inventory',metadataPaths.publication):effectById.get(oldId);if(!metadata)fail('UNBOUND_EFFECT');steps.push(serializedStep(metadata,id,before,after));}
 }
 const phases=schedule.phases.map(phase=>({id:phase.id,kind:phase.kind,transaction:phase.transaction,steps:phase.steps.map(id=>idByOld.get(id)??fail('UNBOUND_PHASE_ID'))}));
 return {steps,phases,prefixes};
}
export interface InventoryPlanInput {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:Json;history:Json;historyBinding:{profile:'umf.table-inventory-source-history/0.1';count:number;digest:string};inventory:InventoryDelta;initialPrefix:Omit<import('./inventory-graph').PrefixFrame,'digest'>;nextCatalog:Record<string,Json[]>;effects:EffectNode[];dependencies:TypedDependency[];provenanceMutations:CatalogMutation[];seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};review:Json[];}
/** Construct the closed unpublished G10 plan from already verified source projections and typed renderer effects. */
export function compileInventoryPlan(input:InventoryPlanInput):Record<string,Json>{
 const next=verifyTableDeployment(input.next),previous=input.previous===null?null:verifyTableDeployment(input.previous);if(next.bundleDigest!==input.next.bundleDigest||previous?.bundleDigest!==input.previous?.bundleDigest)fail('BUNDLE_VERIFICATION');
 const sources=input.effects.map(effect=>({...effect})),metadataIds={prepare:'g10-inventory-prepare',approval:'g10-inventory-approval',publication:'g10-inventory-publication'},schedule=scheduleTypedInventoryEffects(input.initialPrefix,sources,input.dependencies,input.nextCatalog,metadataIds,input.provenanceMutations);
 if(schedule.prefixes.length!==schedule.phases.length+1||schedule.phases.length<3||schedule.phases[0]?.kind!=='prepare'||schedule.phases[1]?.kind!=='approval'||schedule.phases.at(-1)?.kind!=='publication')fail('PHASE_ENVELOPE');
 const {steps,phases,prefixes}=serialize(schedule,sources,metadataIds),executionProfile={version:'umf.table-inventory-execution/0.1',progressRelation:'umf_lifecycle_inventory_progress',ownerOnly:true,ingressProfile:'umf.table-inventory-generation-ingress/0.1',inventoryProfile:'umf.table-inventory-prefix/0.1',initial:previous===null,conversionProfile:null,originalsProfile:null,retirementProfile:null,retiredStoreProfile:null},approvalProfile={version:'umf.table-migration-approval/0.1',relation:'umf_lifecycle_approvals',ownerOnly:true};
 const serializedInventory={...input.inventory} as Record<string,unknown>;delete serializedInventory.fieldChanges;
 const history=input.history as any;if(!history||history.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(history.plans)||!Array.isArray(history.executions)||input.historyBinding.count!==history.plans.length||input.historyBinding.digest!==hashCanonical(history)||input.historyBinding.profile!==history.profile)fail('HISTORY_BINDING');
 const body:Record<string,Json>={version:'umf.table-inventory-migration/0.1',canonicalization:'RFC8785',id:input.id,predecessor:input.predecessor as unknown as Json,previous:input.previous as unknown as Json,next:input.next as unknown as Json,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:steps as unknown as Json,seedExecution:input.seedExecution as unknown as Json,phases:phases as unknown as Json,executionProfile,approvalProfile,options:input.options,review:input.review,requiresApproval:true,nativeQualified:false,inventory:serializedInventory as unknown as Json,prefixes:prefixes as unknown as Json,historyBinding:input.historyBinding as unknown as Json};
 body.digest=hashCanonical(body);if(new TextEncoder().encode(canonical(body)).length>25165824)fail('PLAN_SIZE');return body;
}

export function createHistoricalG10Verifier():HistoricalG10PlanVerifier {
 // One verifier instance is shared by every validation/recompile below a root
 // request. The key binds exact canonical plan and prior-history contents, so
 // this is only a computation cache; it never substitutes an ID/digest lookup
 // for source recompilation or history-chain validation.
 const verified=new Map<number,string>(),planSnapshots=new Map<number,string>(),executionSnapshots=new Map<number,string>(),active=new Set<number>();
 let retainedBytes=0;
 const utf8Bytes=(value:string):number=>new TextEncoder().encode(value).byteLength;
 const verify:HistoricalG10PlanVerifier=(value,index,priorHistory)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('HISTORICAL_G10_SHAPE');
  const plan=value as Record<string,unknown>,planBytes=canonical(plan),cached=verified.get(index);
  if(!Number.isSafeInteger(index)||index<0||index>128||!priorHistory||typeof priorHistory!=='object'||Array.isArray(priorHistory))fail('HISTORICAL_G10_CONTEXT_CHANGED');
  const prefix=priorHistory as Record<string,unknown>;
  if(prefix.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(prefix.plans)||!Array.isArray(prefix.executions)||prefix.plans.length!==index||prefix.executions.length!==index)fail('HISTORICAL_G10_CONTEXT_CHANGED');
  // The caller reaches this verifier in chronological history validation: each
  // preceding execution has already been checked against its preceding plan.
  // Intern each exact member once instead of retaining a full copied prefix at
  // every index. Cache hits still compare every supplied member byte-for-byte.
  for(let member=0;member<index;member++){
   const priorPlanBytes=canonical(prefix.plans[member]),priorExecutionBytes=canonical(prefix.executions[member]);
   const knownPlan=planSnapshots.get(member),knownExecution=executionSnapshots.get(member);
   if((knownPlan!==undefined&&knownPlan!==priorPlanBytes)||(knownExecution!==undefined&&knownExecution!==priorExecutionBytes))fail('HISTORICAL_G10_CONTEXT_CHANGED');
   if(knownPlan===undefined){const size=utf8Bytes(priorPlanBytes);if(retainedBytes+size>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');planSnapshots.set(member,priorPlanBytes);retainedBytes+=size;}
   if(knownExecution===undefined){const size=utf8Bytes(priorExecutionBytes);if(retainedBytes+size>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');executionSnapshots.set(member,priorExecutionBytes);retainedBytes+=size;}
  }
  const knownCurrent=planSnapshots.get(index);
  if(knownCurrent!==undefined&&knownCurrent!==planBytes)fail('HISTORICAL_G10_CONTEXT_CHANGED');
  if(cached){if(cached===planBytes)return;fail('HISTORICAL_G10_CONTEXT_CHANGED');}
  if(active.has(index))fail('HISTORICAL_G10_RECURSIVE_CYCLE');
  active.add(index);
  try{
   const request={id:plan.id,predecessor:plan.predecessor,previous:plan.previous,next:plan.next,options:plan.options,history:priorHistory};
   const rebuiltRaw=compileG10InventoryPlanInternal(request,verify);
   const rebuilt=withReview(rebuiltRaw,exactReview(request as TableInventoryMigrationRequest,verify));
   if(canonical(rebuilt)!==canonical(plan))fail('HISTORICAL_G10_RECOMPILE:'+index);
   // Keep at most the admitted original history once (plans and executions),
   // plus one plan snapshot per position; never materialize nested full-prefix
   // cache keys or repeatedly recompile a cached prefix.
   const planSize=utf8Bytes(planBytes);if(verified.size>=128||retainedBytes+planSize>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');
   verified.set(index,planBytes);planSnapshots.set(index,planBytes);retainedBytes+=planSize;
  }finally{active.delete(index);}
 };
 return verify;
}
/** Source-driven compiler/recompiler for the currently representable table-install and mixed-create subset. */
export function compileG10InventoryPlan(input:unknown):Record<string,Json>{
 return compileG10InventoryPlanInternal(input,createHistoricalG10Verifier());
}
function compileG10InventoryPlanInternal(input:unknown,verifyHistoricalG10:HistoricalG10PlanVerifier):Record<string,Json>{
 const request:G10ValidatedRequest=validateG10RequestShape(input,verifyHistoricalG10),inventory=compileG10InventoryDelta(input,verifyHistoricalG10);
 if(inventory.changes.some(change=>change.kind!=='create-table'))fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');
 const selected=request.options.tableIntents;if(selected.some(intent=>intent.kind!=='create'))fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');
 const unsupported=(['defaultChanges','conversions','concurrentIndexes','validations','retiredSeedSets','retirements','restorations','archiveSources'] as const).find(key=>request.options[key].length!==0);if(unsupported)fail('COMPOSITION_NOT_LOWERED:'+unsupported);
 if(request.options.backfills.length&&request.options.backfills.length!==1)fail('G02_COMPOSITION_SELECTION_NOT_LOWERED');
 const next=projectG10Bundle(request.next,'next'),previous=request.previous===null?null:projectG10Bundle(request.previous,'previous'),derived=deriveInitialRendererEffects(next.bundle,next.projection,previous?.projection??null);
 if(inventory.changes.length!==derived.effects.filter(effect=>effect.operation==='create-table').length)fail('CREATE_EFFECT_COVERAGE');
 const lineage=deriveInventorySeedLineage(request.history,{previous:request.previous,next:request.next,options:{seedSets:request.options.seedSets,retiredSeedSets:request.options.retiredSeedSets}},verifyHistoricalG10);
 const dependencies:TypedDependency[]=[...derived.edges];let effects=[...derived.effects];
 if(request.options.backfills.length){
  if(!previous)fail('G02_INITIAL_PLAN_UNSUPPORTED');
  const ownedMarkers=partitionInventoryMarkersForG02(request.options.reviewedChanges as any,previous.bundle,next.bundle,next.tables.map(table=>table.table).filter(table=>!previous!.tables.some(old=>old.table===table)),request.options.backfills[0]!);
  const lowered=deriveG02FieldEffects(previous.bundle,next.bundle,previous.projection,next.projection,{version:'umf.table-migration-options/0.4',backfills:request.options.backfills,concurrentIndexes:[],reviewedChanges:ownedMarkers,validations:[]} as any,effects.length);
  effects.push(...lowered.effects);dependencies.push(...lowered.edges);
 }
 if(request.options.seedSets.length){const seedStates=new Map(next.projection.seedStates.map(seed=>[seed.id,seed]));for(const selected of request.options.seedSets){if(!seedStates.has(selected))fail('SEED_SOURCE_BINDING');}
  const subject:InventorySubject={kind:'seed',sets:[...request.options.seedSets]},seedEffect:EffectNode={id:'g10-apply-selected-seeds',kind:'seed',operation:'apply-seeds',subject,sourcePath:'/options/seedSets',sql:'',transaction:'required',recovery:'rollback-transaction',sourceOrder:effects.length+1,atomicGroup:null,transition:{action:'update',collection:'tables',meaning:{}}};
  effects.push(seedEffect);const dependent=hashCanonical(inventoryCatalogIdentity(subject));for(const selected of request.options.seedSets){const raw=hashCanonical({kind:'seed-set',table:null,subject:selected});for(const edge of next.projection.dependencies.filter(candidate=>candidate.from===raw&&candidate.reason==='seed-set-requires-table'))dependencies.push({dependent,prerequisite:edge.to,sourcePath:edge.sourcePath,reason:'selected-seed-requires-source-table',state:'present'});}
 }
 // The renderer discovers the combined schema grant before compiler-selected
 // seeds are appended. Bind that final grant only after every selected business
 // and seed effect in the complete composition DAG.
 const schemaGrants=effects.filter(effect=>effect.subject.kind==='schema-grant');
 for(const grant of schemaGrants){
  const dependent=hashCanonical(inventoryCatalogIdentity(grant.subject));
  for(const prior of effects){
   if(prior===grant||prior.subject.kind==='metadata')continue;
   dependencies.push({dependent,prerequisite:hashCanonical(inventoryCatalogIdentity(prior.subject)),sourcePath:grant.sourcePath,reason:'schema-grant-after-required-effects',state:'present'});
  }
 }
 const initialPrefix=initialInventoryPrefix(previous?{catalog:previous.projection.catalog as unknown as Record<string,Json[]>,tables:previous.tables}:null,lineage as unknown as Json[]);
 const history=request.history as unknown as Json,historyBinding={profile:'umf.table-inventory-source-history/0.1' as const,count:request.history.plans.length,digest:hashCanonical(request.history)};
 const review=deriveInventoryReviewCandidates(input,verifyHistoricalG10);
 const seedExecution=request.options.seedSets.length?{version:'umf.table-seed-execution/0.1' as const,sets:[...request.options.seedSets]}:'none';
 const provenanceMutations=deriveG10ProvenanceMutations(previous?.projection??null,next.projection,effects);
 return compileInventoryPlan({id:request.id,predecessor:request.predecessor,previous:request.previous,next:request.next,options:(input as Record<string,unknown>).options as Json,history,historyBinding,inventory,initialPrefix,nextCatalog:next.projection.catalog as unknown as Record<string,Json[]>,effects,dependencies,provenanceMutations,seedExecution,review:review as unknown as Json[]});
}

/** Verify only by reconstructing the exact plan from independently verified source and the supplied original history. */
export function verifyG10InventoryPlan(value:unknown,history:unknown):Record<string,Json>{
 const keys=['version','canonicalization','id','predecessor','previous','next','fromBundleDigest','toBundleDigest','steps','seedExecution','phases','executionProfile','approvalProfile','options','review','requiresApproval','nativeQualified','inventory','prefixes','historyBinding','digest'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail('PLAN_SHAPE');const plan=value as Record<string,unknown>;
 if(Object.keys(plan).length!==keys.length||keys.some(key=>!Object.hasOwn(plan,key))||plan.version!=='umf.table-inventory-migration/0.1'||plan.canonicalization!=='RFC8785'||plan.requiresApproval!==true||plan.nativeQualified!==false||typeof plan.digest!=='string'||!/^[0-9a-f]{64}$/.test(plan.digest))fail('PLAN_SHAPE');
 const digestBody={...plan};delete digestBody.digest;if(hashCanonical(digestBody)!==plan.digest)fail('PLAN_DIGEST');
 const request={id:plan.id,predecessor:plan.predecessor,previous:plan.previous,next:plan.next,options:plan.options,history};const rebuilt=compileG10InventoryPlan(request);
 if(canonical(rebuilt)!==canonical(plan))fail('PLAN_RECOMPILE_MISMATCH');return rebuilt;
}

export interface TableInventoryMigrationStep {
 id:string;kind:'table'|'foreignKey'|'index'|'policy'|'grant'|'comment'|'backfill'|'seed'|'conversion'|'retirement'|'metadata';
 sourcePath:string;transaction:'required'|'forbidden';sql:string;operation:'create-table'|'remove-table'|'enable-rls'|'force-rls'|'add-column'|'drop-column'|'target-check'|'install-default'|'change-default'|'tighten-not-null'|'relax-not-null'|'rename-column'|'dependency-drop'|'dependency-add'|'apply-backfill'|'apply-seeds'|'capture-originals'|'convert-field'|'validate-conversion'|'capture-retired-values'|'retire-field'|'restore-field'|'validate-restoration'|'create-concurrent-index'|'add-not-valid'|'validate'|'set-comment'|'prepare-inventory-metadata'|'record-inventory-approval'|'publish-inventory';inventorySubject:ModelJson;
 preconditions:{kind:'inventory-prefix';prefixDigest:string};expectedOutcome:{kind:'inventory-prefix';prefixDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
 dataBinding?:ModelJson;seedSets?:string[];conversionBinding?:ModelJson;retirementBinding?:ModelJson;
}
export interface TableInventoryMigrationPhase {id:string;kind:'prepare'|'approval'|'transaction'|'backfill-add'|'backfill-tighten'|'field-replacement'|'field-conversion'|'field-retirement'|'field-restoration'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed'|'publication';transaction:'required'|'forbidden';steps:string[]}
export interface TableInventoryExecutionProfile {version:'umf.table-inventory-execution/0.1';progressRelation:'umf_lifecycle_inventory_progress';ownerOnly:true;ingressProfile:'umf.table-inventory-generation-ingress/0.1';inventoryProfile:'umf.table-inventory-prefix/0.1';initial:boolean;conversionProfile:string|null;originalsProfile:string|null;retirementProfile:string|null;retiredStoreProfile:string|null}
export interface TableInventoryPlanInventory {profile:'umf.table-inventory-delta/0.1';previousTables:InventoryTable[];nextTables:InventoryTable[];changes:InventoryChange[];seedLineage:InventoryDelta['seedLineage']}
export interface TableInventoryMigrationPlan {
 version:'umf.table-inventory-migration/0.1';canonicalization:'RFC8785';id:string;
 predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;
 fromBundleDigest:string|null;toBundleDigest:string;steps:TableInventoryMigrationStep[];
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};phases:TableInventoryMigrationPhase[];
 executionProfile:TableInventoryExecutionProfile;approvalProfile:{version:'umf.table-migration-approval/0.1';relation:'umf_lifecycle_approvals';ownerOnly:true};options:TableInventoryMigrationOptions;review:TableInventoryReviewedChangeCandidate[];
 requiresApproval:true;nativeQualified:false;inventory:TableInventoryPlanInventory;prefixes:PrefixFrame[];
 historyBinding:{profile:'umf.table-inventory-source-history/0.1';count:number;digest:string};digest:string;
}
export type TableInventoryMigrationResult=
 |{status:'compiled';plan:TableInventoryMigrationPlan;diagnostics:[]}
 |{status:'blocked';diagnostics:Diagnostic[]};

function discoverySelector(options:TableInventoryMigrationRequest['options']):TableInventoryDiscoverySelector{
 const tableIntents=options.tableIntents.map((intent):TableInventoryDiscoverySelector['tableIntents'][number]=>intent.kind==='create'
  ?{kind:'create',table:intent.table,record:{module:intent.record.module,element:intent.record.element}}
  :{kind:'remove',table:intent.table,record:{module:intent.record.module,element:intent.record.element},disposition:{mode:'irreversible-purge'}});
 const conversions=options.conversions.map((conversion)=>({
  ...conversion,field:{module:conversion.field.module,element:conversion.field.element},
  recovery:conversion.recovery.mode==='irreversible'?{mode:'irreversible' as const}:{...conversion.recovery},
 }));
 return {version:'umf.table-inventory-discovery/0.1',tableIntents,conversions,retiredSeedSets:[...options.retiredSeedSets],retirements:options.retirements.map(item=>({...item,field:{...item.field},retention:{...item.retention}})),restorations:options.restorations.map(item=>({...item,field:{...item.field},archive:{...item.archive},newInstances:{...item.newInstances}})),archiveSources:options.archiveSources.map(item=>({digest:item.digest,source:{format:'json',utf8:item.source.utf8}}))};
}
function exactReview(request:TableInventoryMigrationRequest,verifier:HistoricalG10PlanVerifier):TableInventoryReviewedChangeCandidate[]{
 const candidates=discoverInventoryReviewCandidatesWithVerifier(request.previous,request.next,discoverySelector(request.options),request.history,verifier);
 const expected=candidates.map(inventoryMarker);
 if(canonical(expected)!==canonical(request.options.reviewedChanges))throw new UmfError('TABLE_MIGRATION_REVIEW','Reviewed markers must exactly match the complete source-derived candidate sequence.','/options/reviewedChanges');
 for(const intent of request.options.tableIntents){
  if(intent.kind!=='remove')continue;
  const effect=candidates.find(candidate=>candidate.kind==='table-removal-effects'&&candidate.oldValue!==null&&candidate.oldValue!==undefined&&typeof candidate.oldValue==='object'&&!Array.isArray(candidate.oldValue)&&(candidate.oldValue as {table?:unknown}).table===intent.table);
  if(!effect||intent.disposition.reviewMarker!==effect.id)throw new UmfError('TABLE_MIGRATION_REVIEW','The purge marker must name the independently derived irreversible-effects candidate.','/options/tableIntents');
 }
 return candidates;
}
function blockedDiagnostic(error:unknown):Diagnostic{
 const path=error instanceof UmfError?error.path:error instanceof ShapeError?error.path:'';
 const code=error instanceof UmfError?error.code:error instanceof ShapeError?error.message:'TABLE_INVENTORY_UNSUPPORTED';
 return {code,path,message:'The table inventory request could not be compiled under the supported source profile.',severity:'error'};
}
function withReview(plan:Record<string,Json>,review:TableInventoryReviewedChangeCandidate[]):TableInventoryMigrationPlan{
 const body={...plan,review:review as unknown as Json[]};delete body.digest;body.digest=hashCanonical(body);
 if(new TextEncoder().encode(canonical(body)).length>25165824)throw new UmfError('TABLE_INVENTORY_PLAN_SIZE','The complete reviewed inventory plan exceeds the supported size bound.','/review');
 return body as unknown as TableInventoryMigrationPlan;
}

/** Compile from complete independently verified bundles and their explicit original history. */
export function compileTableInventoryMigration(request:TableInventoryMigrationRequest):TableInventoryMigrationResult{
 try{
  const verifier=createHistoricalG10Verifier();
  const normalized=validateG10RequestShape(request,verifier);
  const stableRequest:TableInventoryMigrationRequest={...request,previous:normalized.previous,next:normalized.next,options:request.options,history:request.history};
  const review=exactReview(stableRequest,verifier);
  const plan=compileG10InventoryPlanInternal(stableRequest,verifier);
  return {status:'compiled',plan:withReview(plan,review),diagnostics:[]};
 }catch(error){return {status:'blocked',diagnostics:[blockedDiagnostic(error)]};}
}

/** Discover all source-derived review candidates without accepting marker strings. */
export function discoverTableInventoryMigrationChanges(
 previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory,
):TableInventoryReviewedChangeCandidate[]{
 try{return discoverInventoryReviewCandidates(previous,next,selector,originalHistory);}
 catch(error){
  if(error instanceof UmfError)throw error;
  if(error instanceof ShapeError)throw new UmfError('TABLE_MIGRATION_REVIEW','The supplied inventory history is not valid for this source pair.',error.path||'/history');
  throw new UmfError('TABLE_MIGRATION_REVIEW','The inventory review request could not be derived from the supplied source pair.','/source');
 }
}

/** Recompile the complete plan using the supplied complete original history. */
export function verifyTableInventoryMigration(plan:unknown,originalHistory:TableInventorySourceHistory):TableInventoryMigrationPlan{
 if(!plan||typeof plan!=='object'||Array.isArray(plan))throw new UmfError('TABLE_INVENTORY_PLAN','The inventory plan could not be verified from the supplied original history.');
 const candidate=plan as Record<string,unknown>;
 const request={id:candidate.id,predecessor:candidate.predecessor,previous:candidate.previous,next:candidate.next,options:candidate.options,history:originalHistory};
 try{
  const result=compileTableInventoryMigration(request as TableInventoryMigrationRequest);
  if(result.status!=='compiled'||canonical(result.plan)!==canonical(plan))throw new UmfError('TABLE_INVENTORY_PLAN','The complete inventory plan differs from source recompilation with the supplied original history.');
  return result.plan;
 }catch(error){if(error instanceof UmfError&&error.code==='TABLE_INVENTORY_PLAN')throw error;throw new UmfError('TABLE_INVENTORY_PLAN','The complete inventory plan could not be verified from the supplied original history.');}
}

/** Return the canonical complete verified plan bytes without a terminal newline. */
export function serializeTableInventoryMigration(plan:unknown,originalHistory:TableInventorySourceHistory):string{
 return canonical(verifyTableInventoryMigration(plan,originalHistory));
}
