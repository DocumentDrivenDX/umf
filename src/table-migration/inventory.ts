import {canonical,canonicalCharged,hashCanonical,hashCanonicalCharged} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
import {verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {UmfError,pointer} from '../model/errors';
import {copyJson,copyJsonCharged} from '../model/json';
import type {AccountingContext} from '../model/internal/accounting-context';
import {freezeSourceIndex,freezeSourceIndexSide,ownR2SourceComponents,R2WorkMeter,type R2OwnedSourceComponents,type R2BundleSourceIndex} from './inventory-r2-context';
import {initialInventoryPrefix,inventoryCatalogIdentity,scheduleTypedInventoryEffects,type CatalogMutation,type EffectNode,type InventorySubject,type ScheduledInventoryEffects,type TypedDependency} from './inventory-graph';
import type {PrefixFrame} from './inventory-graph';
import {copyInventoryReviewForSide,projectG10Bundle,projectG10BundleWithAccounting,type InventoryProjection,type InventoryChange,type InventoryFieldChange,type InventoryTable,type InventoryDelta,type CatalogProjection,type Identity,type PrefixCatalog,type Subject} from './inventory-projection';
import {ShapeError,validateG10RequestShape,validateTableInventorySourceHistory,type G10ValidatedRequest,type HistoricalG10PlanVerifier,type TableIntent,type TableInventoryDiscoveryIntent,type TableInventoryReviewedChangeKind,type TableInventoryMigrationMarker} from './inventory-options';
import {deriveInventorySeedLineage,type InventoryHistory,type SeedLineageEntry} from './inventory-history';
import {partitionInventoryMarkersForG02,sameSourceExceptG02AndCreates} from './inventory-g02-source';
import {sameSourceExceptG05SelectedFields,sourceFieldMeaning,sourceMappingPath} from './inventory-g05-selection';
import {compileG02FieldEffects} from './internal';
import type {TableMigrationOptions} from './options';
import {consumeTableMigrationChangesBounded} from './reviewed';
import {renderG02GrantEffect} from './g02-field-effects';
import {deriveTableGrantEffectRow,type TableGrantEffectRow} from '../table-deployment/grants';
import type {TableDeclaration,TableRef} from '../extensions/tables/types';
import {columnDefinitionSql} from '../table-deployment/sql';
import type {InternalTableDeploymentOperationRecord} from '../table-deployment/types';
import type {TableInventoryReviewedChangeCandidate,TableInventoryTableReview,TableInventoryTableReviewEffects,TableInventorySeedReview} from './inventory-review';
import type {Diagnostic,Json as ModelJson} from '../model/types';
import type {TableInventoryDiscoverySelector,TableInventoryMigrationOptions,TableInventoryMigrationRequest,TableInventorySourceHistory} from './inventory-options';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
type DeepReadonly<T>=T extends readonly (infer V)[]?readonly DeepReadonly<V>[]:T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
declare const r2SourceContextBrand:unique symbol;
/** Opaque internal source-context identity; it is not an archive or migration capability. */
export type R2InventorySourceContext={readonly [r2SourceContextBrand]:true};
export type R2InventorySourceContextState={readonly owned:Readonly<Omit<R2OwnedSourceComponents,'meter'>>;readonly previous:DeepReadonly<R2BundleSourceIndex>|null;readonly next:DeepReadonly<R2BundleSourceIndex>;readonly history:DeepReadonly<TableInventorySourceHistory>;readonly seedLineage:readonly DeepReadonly<SeedLineageEntry>[];readonly projectionCoreReuses:number;readonly phaseBudgets:Readonly<{owned:Readonly<{work:number;subjects:number;bytes:number}>;history:Readonly<{work:number;subjects:number;bytes:number}>;projection:Readonly<{work:number;subjects:number;bytes:number}>;lineage:Readonly<{work:number;subjects:number;bytes:number}>}>;readonly budget:Readonly<{work:number;subjects:number;bytes:number}>};
type R2InternalSourceContext={readonly view:R2InventorySourceContextState;readonly meter:R2WorkMeter;readonly historyVerifier:HistoricalG10PlanVerifier};
const r2SourceContexts=new WeakMap<object,R2InternalSourceContext>();
type AccountedBundleProjection=ReturnType<typeof projectG10BundleWithAccounting>;
type ScopedBundleProjection={result:ReturnType<typeof projectG10Bundle>;index?:DeepReadonly<R2BundleSourceIndex>};
type ProjectionScope={entries:Map<string,Map<'previous'|'next',ScopedBundleProjection>>;coreReuses:number};
const meteredProjectionCaches=new WeakMap<AccountingContext,ProjectionScope>();
const ordinaryProjectionCaches=new WeakMap<HistoricalG10PlanVerifier,ProjectionScope>();
function withOrdinaryProjectionScope<T>(verifier:HistoricalG10PlanVerifier,body:()=>T):T{
 ordinaryProjectionCaches.set(verifier,{entries:new Map(),coreReuses:0});
 try{return body();}finally{ordinaryProjectionCaches.delete(verifier);}
}
/** Exact-content, request-local projection reuse; full canonical bytes are the cache key. */
function sideProjection(base:ReturnType<typeof projectG10Bundle>,side:'previous'|'next',accounting?:AccountingContext):ReturnType<typeof projectG10Bundle>{
 let sameSide=true;for(let index=0;index<base.reviews.length;index++){accounting?.visit('r2-projection-side-review-side-check',`/${side}/reviews/${index}`);if(base.reviews[index]!.side!==side)sameSide=false;}if(sameSide)return base;
 accounting?.visit('r2-projection-side-review-array','/'+side+'/reviews');accounting?.charge('jsonArraySlot',base.reviews.length,`/${side}/reviews`);
 const reviews=base.reviews.map(review=>copyInventoryReviewForSide(review,side,accounting));
 return {...base,reviews};
}
function projectG10BundleScoped(bundle:TableDeploymentBundle,side:'previous'|'next',accounting:AccountingContext|undefined,verifier:HistoricalG10PlanVerifier):ScopedBundleProjection{
 const scope=accounting?(meteredProjectionCaches.get(accounting)??{entries:new Map<string,Map<'previous'|'next',ScopedBundleProjection>>(),coreReuses:0}):ordinaryProjectionCaches.get(verifier)??{entries:new Map<string,Map<'previous'|'next',ScopedBundleProjection>>(),coreReuses:0};
 if(accounting)meteredProjectionCaches.set(accounting,scope);
 accounting?.visit('r2-bundle-projection-cache-lookup',`/${side}`);
 const key=accounting?canonicalCharged(bundle,accounting,`/${side}/bundle-cache-key`):canonical(bundle);
 let sides=scope.entries.get(key);if(!sides){if(accounting)accounting.retainBytes('r2-bundle-cache-key',new TextEncoder().encode(key).byteLength,`/${side}/bundle-cache-key`);sides=new Map();scope.entries.set(key,sides);}
 const present=sides.get(side);if(present){accounting?.visit('r2-bundle-projection-cache-hit',`/${side}`);return present;}
 const core=[...sides.values()][0];
 if(core){
  scope.coreReuses++;
  accounting?.visit('r2-bundle-projection-core-reuse',`/${side}`);
  const result=sideProjection(core.result,side,accounting);
  const index=accounting&&core.index?freezeSourceIndexSide(result as AccountedBundleProjection,core.index,accounting as R2WorkMeter,`/${side}/index`):undefined;
  const reused:ScopedBundleProjection=index===undefined?{result}:{result,index};sides.set(side,reused);return reused;
 }
 accounting?.visit('r2-bundle-projection-cache-miss',`/${side}`);
 const result=accounting?projectG10BundleWithAccounting(bundle,side,accounting):projectG10Bundle(bundle,side);
 const index=accounting?freezeSourceIndex(result as AccountedBundleProjection,accounting as R2WorkMeter,`/${side}/index`):undefined;
 const created:ScopedBundleProjection=index===undefined?{result}:{result,index};sides.set(side,created);return created;
}
/**
 * Prepare an original .2 source context only after complete source projection,
 * retained-history recompilation and seed-lineage validation all consume the
 * same fresh meter. The returned object is an opaque identity, not authority
 * to resolve archives, alter schema or issue native capabilities.
 */
export function prepareR2InventorySourceContext(input:unknown):R2InventorySourceContext{
 const meter=new R2WorkMeter(),owned=ownR2SourceComponents(input,meter),verifier=createHistoricalG10Verifier(meter);
 const ownedBudget=meter.snapshot();
 const history=freezeOwnedHistory(validateTableInventorySourceHistory(owned.history as unknown as TableInventorySourceHistory,owned.previous as TableDeploymentBundle|null,verifier,meter),meter);
 const historyBudget=meter.snapshot();
 const previousResult=owned.previous===null?null:projectG10BundleScoped(owned.previous as TableDeploymentBundle,'previous',meter,verifier),nextResult=projectG10BundleScoped(owned.next as TableDeploymentBundle,'next',meter,verifier);
 const previous=previousResult?.index??null,next=nextResult.index;if(!next)throw new TypeError('R2_INDEX_MISSING:/next');
 const projectionBudget=meter.snapshot();
 const seedLineage=deriveInventorySeedLineage(history as unknown as InventoryHistory,{previous:owned.previous as TableDeploymentBundle|null,next:owned.next as TableDeploymentBundle,options:{seedSets:[],retiredSeedSets:[...owned.selector.retiredSeedSets]}},verifier,meter);
 const handle=Object.freeze(Object.create(null)) as R2InventorySourceContext;
 const ownedView=Object.freeze({previous:owned.previous,next:owned.next,history:owned.history,selector:owned.selector,canonicalInputs:owned.canonicalInputs});const state:R2InventorySourceContextState=Object.freeze({owned:ownedView,previous,next,history,seedLineage:Object.freeze(seedLineage.map(entry=>Object.freeze({...entry}))),projectionCoreReuses:meteredProjectionCaches.get(meter)?.coreReuses??0,phaseBudgets:Object.freeze({owned:ownedBudget,history:historyBudget,projection:projectionBudget,lineage:meter.snapshot()}),budget:meter.snapshot()});
 r2SourceContexts.set(handle,Object.freeze({view:state,meter,historyVerifier:verifier}));return handle;
}
function freezeOwnedHistory(history:TableInventorySourceHistory,meter:R2WorkMeter):TableInventorySourceHistory{
 const seen=new Set<object>();
 const freeze=(value:unknown,path:string):void=>{
  if(value===null||typeof value!=='object')return;
  if(seen.has(value))throw new TypeError(`R2_HISTORY_CYCLE:${path}`);
  const array=Array.isArray(value),keys=array?null:Object.keys(value);
  meter.visit(array?'r2-history-freeze-array':'r2-history-freeze-object',path,array?(value as unknown[]).length:(keys as string[]).length+1);
  seen.add(value);
  if(array){
   for(let index=0;index<value.length;index++)freeze(value[index],`${path}/${index}`);
  }else{
   for(const key of keys as string[]){meter.scanUtf8(key,`${path}/@key`);freeze((value as Record<string,unknown>)[key],`${path}/${key}`);}
  }
  Object.freeze(value);
 };
 freeze(history,'/history');return history;
}
/** Resolve only a handle issued after this module's original verification path. */
export function inspectR2InventorySourceContext(handle:unknown):R2InventorySourceContextState{
 if(handle===null||typeof handle!=='object')throw new TypeError('R2_CONTEXT_HANDLE');const state=r2SourceContexts.get(handle);if(!state)throw new TypeError('R2_CONTEXT_HANDLE');return state.view;
}
const sameRef=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
const ik=(value:Identity)=>hashCanonical(value);
type MetadataPaths={prepare:'/inventory/metadata/prepare';approval:'/inventory/metadata/approval';publication:'/inventory/metadata/publication'};
const metadataPaths:MetadataPaths={prepare:'/inventory/metadata/prepare',approval:'/inventory/metadata/approval',publication:'/inventory/metadata/publication'};
const metadataSubject:InventorySubject={kind:'metadata',profile:'umf.table-inventory-metadata/0.1'};
function fail(code:string):never{throw new Error('G10_PLAN_'+code);}
function validateExactTableIntentCoverage(previous:ReturnType<typeof projectG10Bundle>|null,next:ReturnType<typeof projectG10Bundle>,options:G10ValidatedRequest['options']):void{
 const oldTables=new Map((previous?.tables??[]).map(table=>[table.table,table])),newTables=new Map(next.tables.map(table=>[table.table,table])),intents=new Map<string,TableIntent>();
 for(const intent of options.tableIntents){const key=JSON.stringify([intent.kind,intent.table]);if(intents.has(key))throw new Error('G10_INTENT_DUPLICATE');intents.set(key,intent);const old=oldTables.get(intent.table),fresh=newTables.get(intent.table);
  if(intent.kind==='create'){if(old||!fresh||!sameRef(intent.record,fresh.record))throw new Error('G10_CREATE_INTENT_MISMATCH:'+intent.table);}
  else if(!old||fresh||!sameRef(intent.record,old.record))throw new Error('G10_REMOVE_INTENT_MISMATCH:'+intent.table);
 }
 for(const table of oldTables.values())if(!newTables.has(table.table)&&!intents.has(JSON.stringify(['remove',table.table]))||newTables.has(table.table)&&intents.has(JSON.stringify(['remove',table.table])))throw new Error('G10_REMOVE_INTENT_COVERAGE:'+table.table);
 for(const table of newTables.values())if(!oldTables.has(table.table)&&!intents.has(JSON.stringify(['create',table.table]))||oldTables.has(table.table)&&intents.has(JSON.stringify(['create',table.table])))throw new Error('G10_CREATE_INTENT_COVERAGE:'+table.table);
}
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
function serialize(schedule:ScheduledInventoryEffects,rawEffects:EffectNode[],metadataIds:{prepare:string;approval:string;publication:string},accounting?:AccountingContext):{steps:Record<string,Json>[];phases:Record<string,Json>[];prefixes:Json[]} {
 accounting?.visit('inventory-plan-serialize-effects','/effects',rawEffects.length);accounting?.visit('inventory-plan-serialize-prefixes','/prefixes',schedule.prefixes.length);
 const effectById=new Map(rawEffects.map(effect=>[effect.id,effect])),idByOld=new Map<string,string>();let sequence=1;for(const id of [metadataIds.prepare,metadataIds.approval,...schedule.steps.map(step=>step.id),metadataIds.publication])idByOld.set(id,`step-${String(sequence++).padStart(5,'0')}`);
 const prefixes=schedule.prefixes.map((frame,index)=>{accounting?.visit('inventory-plan-serialize-prefix-steps',`/prefixes/${index}`,frame.completedSteps.length);return {...frame,completedSteps:frame.completedSteps.map(id=>idByOld.get(id)??fail('UNBOUND_COMPLETED_STEP'))};});
 for(const [prefixIndex,prefix] of prefixes.entries()){
  accounting?.visit('inventory-plan-serialize-table-states',`/prefixes/${prefixIndex}/tableStates`,prefix.tableStates.length);
  for(const [index,raw]of prefix.tableStates.entries()){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('TABLE_STATE_SHAPE');
   const tableState=raw as Record<string,Json>;
   for(const key of ['creationStep','removalStep'] as const){
    const oldId=tableState[key];if(oldId===null)continue;
    if(typeof oldId!=='string')fail('TABLE_STATE_STEP_REFERENCE:'+index+':'+key);
    const newId=idByOld.get(oldId);if(!newId)fail('UNBOUND_TABLE_STATE_STEP:'+index+':'+key);tableState[key]=newId;
   }
  }
   const body={...prefix} as Record<string,Json>;delete body.digest;(prefix as Record<string,Json>).digest=accounting?hashCanonicalCharged(body,accounting,`/prefixes/${prefixIndex}`):hashCanonical(body);
 }
 const steps:Record<string,Json>[]=[];accounting?.visit('inventory-plan-serialize-phases','/phases',schedule.phases.length);for(let phaseIndex=0;phaseIndex<schedule.phases.length;phaseIndex++){
  const phase=schedule.phases[phaseIndex]!,before=prefixes[phaseIndex]?.digest,after=prefixes[phaseIndex+1]?.digest;if(!before||!after)fail('PHASE_PREFIX_PAIR');
  accounting?.visit('inventory-plan-serialize-phase-steps',`/phases/${phaseIndex}`,phase.steps.length);for(const oldId of phase.steps){const id=idByOld.get(oldId);if(!id)fail('UNBOUND_PHASE_STEP');const metadata=oldId===metadataIds.prepare?metadataStep(id,'prepare-inventory-metadata',metadataPaths.prepare):oldId===metadataIds.approval?metadataStep(id,'record-inventory-approval',metadataPaths.approval):oldId===metadataIds.publication?metadataStep(id,'publish-inventory',metadataPaths.publication):effectById.get(oldId);if(!metadata)fail('UNBOUND_EFFECT');steps.push(serializedStep(metadata,id,before,after));}
 }
 const phases=schedule.phases.map((phase,index)=>{accounting?.visit('inventory-plan-serialize-phase-ids',`/phases/${index}`,phase.steps.length);return {id:phase.id,kind:phase.kind,transaction:phase.transaction,steps:phase.steps.map(id=>idByOld.get(id)??fail('UNBOUND_PHASE_ID'))};});
 return {steps,phases,prefixes};
}

type EffectIdentity={kind:string;table:string|null;subject:Json};
type EffectSubject={identity:EffectIdentity;meaning:Json;state:'present'|'absent';validation?:string;validity?:string};
const effectClone=<T>(value:T):T=>structuredClone(value);
const obj=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const isTableReview=(value:unknown):value is TableInventoryTableReview=>obj(value)&&value.profile==='umf.table-inventory-review/0.1'&&(value.side==='previous'||value.side==='next')&&typeof value.table==='string'&&obj(value.source)&&value.source.format==='json'&&typeof value.source.sha256==='string'&&obj(value.record)&&typeof value.record.module==='string'&&typeof value.record.element==='string'&&Array.isArray(value.effects);
const hashSubject=(identity:EffectIdentity)=>hashCanonical(identity);
const catalogRows=(catalog:PrefixCatalog,collection:string):EffectSubject[]=>catalog[collection as keyof PrefixCatalog] as EffectSubject[];
function sourceBoundPersonUpdateGrant(bundle:TableDeploymentBundle,tableId:string,sourcePath:string,meaning:any,identity:EffectIdentity):TableGrantEffectRow{
 if(bundle.source.format!=='json')throw new Error('G10_G02_GRANT_SOURCE_FORMAT');
 let document:any;try{document=JSON.parse(bundle.source.utf8);}catch{throw new Error('G10_G02_GRANT_SOURCE_PARSE');}
 const moduleIndex=document.modules?.findIndex((module:any)=>module.id===bundle.module)??-1,module=document.modules?.[moduleIndex],payload=module?.extensions?.['umf.tables'],tables=payload?.tables;
 if(moduleIndex<0||!Array.isArray(tables))throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const matches=tables.map((table:any,index:number)=>({table,index})).filter(({table}:any)=>table?.id===tableId);
 if(matches.length!==1)throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const {table,index}=matches[0] as {table:TableDeclaration;index:number},expectedPath=`/modules/${moduleIndex}/extensions/umf.tables/tables/${index}/policy/person/update`;
 const meaningKeys=Object.keys(meaning).sort(),expectedMeaningKeys=['columns','effect','grantOption','privilege','role','rule','sourcePath','state','table'];
 if(meaningKeys.length!==expectedMeaningKeys.length||meaningKeys.some((key,index)=>key!==expectedMeaningKeys[index])||sourcePath!==expectedPath||meaning.sourcePath!==expectedPath||meaning.state!=='present'||meaning.effect!=='grant'||meaning.table!==tableId||meaning.privilege!=='update'||meaning.grantOption!==false||table.policy.person.update.kind==='deny')throw new Error('G10_G02_GRANT_SOURCE_BINDING');
 const recordModule=document.modules.find((candidate:any)=>candidate.id===table.record.module),record=recordModule?.elements.find((element:any)=>element.kind==='record'&&element.id===table.record.element);
 if(!record)throw new Error('G10_G02_GRANT_SOURCE_RECORD');
 let expected:TableGrantEffectRow;
 try{expected=deriveTableGrantEffectRow({table,recordModule:table.record.module,record,schema:bundle.configuration.schema,role:bundle.configuration.personRole,audience:'person',command:'update'});}
 catch{throw new Error('G10_G02_GRANT_SOURCE_ROW');}
 if(canonical({table:meaning.table,role:meaning.role,privilege:meaning.privilege,columns:meaning.columns,grantOption:meaning.grantOption,rule:meaning.rule})!==canonical({table:expected.table,role:expected.role,privilege:expected.privilege,columns:expected.columns,grantOption:expected.grantOption,rule:table.policy.person.update})||expected.schema!==bundle.configuration.schema||expected.relation!==bundle.expectedCatalog.tables.find(item=>item.id===tableId)?.name||identity.table!==tableId||canonical(identity.subject)!==canonical([expected.role,expected.privilege,expected.columns]))throw new Error('G10_G02_GRANT_SOURCE_ROW');
 return expected;
}
function findSubject(catalog:PrefixCatalog,collection:string,identity:EffectIdentity):EffectSubject{
 const matches=catalogRows(catalog,collection).filter(row=>hashSubject(row.identity)===hashSubject(identity));
 if(matches.length!==1)throw new Error('G10_RENDERED_SUBJECT_NOT_UNIQUE:'+collection+':'+hashSubject(identity));return matches[0]!;
}
function dependencyIdentity(operation:InternalTableDeploymentOperationRecord):{collection:string;identity:EffectIdentity}{
 const subject=operation.subject;
 switch(operation.operation){
  case'add-foreign-key':if(subject.kind!=='foreignKey')throw new Error('G10_RENDERED_FK_SUBJECT');return {collection:'foreignKeys',identity:{kind:'foreignKey',table:subject.table,subject:subject.id}};
  case'add-index':if(subject.kind!=='index')throw new Error('G10_RENDERED_INDEX_SUBJECT');return {collection:'indexes',identity:{kind:'index',table:subject.table,subject:subject.id}};
  case'revoke-public':if(subject.kind!=='publicGrant')throw new Error('G10_RENDERED_PUBLIC_GRANT_SUBJECT');return {collection:'grants',identity:{kind:'grant',table:subject.table,subject:['PUBLIC','all',null]}};
  case'create-policy':if(subject.kind!=='policy')throw new Error('G10_RENDERED_POLICY_SUBJECT');return {collection:'policies',identity:{kind:'policy',table:subject.table,subject:[subject.audience,subject.command]}};
  case'grant-table':if(subject.kind!=='tableGrant')throw new Error('G10_RENDERED_TABLE_GRANT_SUBJECT');return {collection:'grants',identity:{kind:'grant',table:subject.table,subject:[subject.role,subject.privilege,subject.columns]}};
  case'set-comment':if(subject.kind!=='comment')throw new Error('G10_RENDERED_COMMENT_SUBJECT');return {collection:'comments',identity:{kind:'comment',table:subject.table,subject:subject.column===null?['table']:['column',subject.column]}};
  default:throw new Error('G10_RENDERED_NOT_DEPENDENCY:'+operation.operation);
 }
}
function node(operation:InternalTableDeploymentOperationRecord,sourceOrder:number,atomicGroup:string|null,kind:string,subject:EffectNode['subject'],transition:EffectNode['transition']):EffectNode{
 return {id:operation.stepId,kind,operation:operation.operation==='create-table'?'create-table':operation.operation==='enable-rls'?'enable-rls':operation.operation==='force-rls'?'force-rls':operation.operation==='set-comment'?'set-comment':'dependency-add',subject,sourcePath:operation.sourcePath,sql:operation.sql,transaction:operation.transaction,recovery:'rollback-transaction',sourceOrder,atomicGroup,transition};
}
/** Translate exact typed renderer tags into prefix effects. It never inspects SQL text. */
function deriveInitialRendererEffectsCore(bundle:TableDeploymentBundle,projection:CatalogProjection,previous:CatalogProjection|null=null,prepared=false,accounting?:AccountingContext):{effects:EffectNode[];edges:TypedDependency[];publicationObligations:SourcePublicationObligation[]}{
 accounting?.visit('g10-renderer-previous-tables','/previous/catalog/tables',previous?.catalog.tables.length??0);accounting?.visit('g10-renderer-next-tables','/next/catalog/tables',projection.catalog.tables.length);const effects:EffectNode[]=[],creationGroup='initial-table-install',existingTables=new Set(previous?.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null)??[]),createdTables=new Set(projection.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null).filter(table=>!existingTables.has(table))),grantOperation=previous===null?projection.rendererOperations.find(item=>item.operation==='grant-schema-usage'):undefined;
 for(const [sourceOrder,operation] of projection.rendererOperations.entries()){
  accounting?.visit('g10-renderer-effect-construction',`/operations/${operation.stepId}`);
  if(operation.operation==='grant-schema-usage')continue;
  const operationTable=operation.subject.kind==='schema-grant'?null:'table' in operation.subject?operation.subject.table:null;
  if(operationTable!==null&&!createdTables.has(operationTable))continue;
  if(operationTable===null)throw new Error('G10_RENDERED_SUBJECT_TABLE');
  if(operation.operation==='create-table'){
   if(operation.subject.kind!=='table')throw new Error('G10_RENDERED_CREATE_SUBJECT');
   const tableId=operation.subject.table,tableRecord=operation.subject.record;
   const table=findSubject(projection.catalog,'tables',{kind:'table',table:tableId,subject:tableRecord as unknown as Json});
   const embedded={columns:projection.catalog.columns.filter(row=>{accounting?.visit('g10-renderer-create-column-scan',`/catalog/columns/${tableId}`);return row.identity.table===tableId;}),keys:projection.catalog.keys.filter(row=>{accounting?.visit('g10-renderer-create-key-scan',`/catalog/keys/${tableId}`);return row.identity.table===tableId;}),checks:projection.catalog.checks.filter(row=>{accounting?.visit('g10-renderer-create-check-scan',`/catalog/checks/${tableId}`);return row.identity.table===tableId;})};
   const meaning={tableMeaning:effectClone(table.meaning),embeddedCatalog:effectClone(embedded)} as unknown as Json;
   effects.push(node(operation,sourceOrder,creationGroup,'table',{kind:'table',table:tableId,record:effectClone(tableRecord)},{action:'add',collection:'tables',meaning}));
   continue;
  }
  if(operation.operation==='enable-rls'||operation.operation==='force-rls'){
   if(operation.subject.kind!=='tableState')throw new Error('G10_RENDERED_RLS_SUBJECT');
   const tableId=operation.subject.table,tableRecord=operation.subject.record;const table=findSubject(projection.catalog,'tables',{kind:'table',table:tableId,subject:tableRecord as unknown as Json}),meaning=effectClone(table.meaning) as any;
   meaning.rls={enabled:true,forced:operation.operation==='force-rls'};
   effects.push(node(operation,sourceOrder,creationGroup,'table',{kind:'table',table:tableId,record:effectClone(tableRecord)},{action:'update',collection:'tables',meaning:meaning as Json}));
   continue;
  }
  const {collection,identity}=dependencyIdentity(operation),subject=findSubject(projection.catalog,collection,identity);
  const effectKind=operation.kind;
  const dependencyKind=collection==='foreignKeys'?'foreignKey':collection==='indexes'?'index':collection==='policies'?'policy':collection==='comments'?'comment':'grant';const effectId=['policy','comment','grant'].includes(dependencyKind)?JSON.stringify(identity.subject):String(identity.subject);const effectSubject:EffectNode['subject']={kind:'dependency',table:identity.table!,dependencyKind,id:effectId,sourcePath:operation.sourcePath,meaningDigest:accounting?hashCanonicalCharged(subject.meaning,accounting,`/operations/${operation.stepId}/meaning`):hashCanonical(subject.meaning)};
  effects.push(node(operation,sourceOrder,creationGroup,effectKind,effectSubject,{action:'add',collection:collection as EffectNode['transition']['collection'],meaning:{catalogMeaning:effectClone(subject.meaning),validation:subject.validation??null,validity:subject.validity??null} as unknown as Json}));
 }
 if(grantOperation){
  if(grantOperation.subject.kind!=='schema-grant'||grantOperation.subject.schema!==bundle.configuration.schema||grantOperation.subject.privilege!=='USAGE'||JSON.stringify(grantOperation.subject.audiences)!==JSON.stringify(['person','batch']))throw new Error('G10_RENDERED_SCHEMA_GRANT_SUBJECT');
  const schemaGrants=projection.catalog.grants.filter(row=>{accounting?.visit('g10-renderer-schema-grant-scan','/catalog/grants');return row.identity.table===null&&((row.meaning as any).effect==='grant-schema-usage');});
  if(schemaGrants.length!==2||new Set(schemaGrants.map(row=>(row.meaning as any).role)).size!==2)throw new Error('G10_RENDERED_SCHEMA_GRANT_ROWS');
  effects.push(node(grantOperation,projection.rendererOperations.length,null,'grant',{kind:'schema-grant',schema:grantOperation.subject.schema,audiences:['person','batch'],privilege:'USAGE'},{action:'add',collection:'grants',meaning:{grants:schemaGrants.map(row=>({identity:effectClone(row.identity),meaning:effectClone(row.meaning)}))} as unknown as Json}));
 }
 const partition=partitionRendererDependenciesCore(bundle,projection,prepared,accounting),edges:TypedDependency[]=partition.physicalEdges.filter(edge=>{accounting?.visit('g10-renderer-created-edge-filter',`/dependencies/${edge.sourcePath}`);const touchesCreated=(identityDigest:string)=>{for(const table of createdTables){accounting?.visit('g10-renderer-created-table-scan',`/tables/${table}`);const tableIdentity={kind:'table',table,subject:projection.catalog.tables.find(row=>row.identity.table===table)?.identity.subject};const tableHash=accounting?hashCanonicalCharged(tableIdentity,accounting,`/tables/${table}`):hashCanonical(tableIdentity);if(identityDigest===tableHash)return true;for(const [collection,rows]of Object.entries(projection.catalog))for(const row of rows){accounting?.visit('g10-renderer-created-catalog-scan',`/catalog/${collection}`);if(row.identity.table===table&&(accounting?hashCanonicalCharged(row.identity,accounting,`/catalog/${collection}/identity`):hashCanonical(row.identity))===identityDigest)return true;}}return false;};return touchesCreated(edge.from)||touchesCreated(edge.to);}).map(edge=>({dependent:edge.from,prerequisite:edge.to,sourcePath:edge.sourcePath,reason:edge.reason,state:edge.state}));
 if(grantOperation){
  const grant=effects.at(-1)!;for(const prior of effects.slice(0,-1))edges.push({dependent:hashSubject(inventoryCatalogIdentity(grant.subject)),prerequisite:hashSubject(inventoryCatalogIdentity(prior.subject)),sourcePath:grant.sourcePath,reason:'schema-grant-after-required-effects',state:'present'});
 }
 return {effects,edges,publicationObligations:partition.publicationObligations};
}
export function deriveInitialRendererEffects(bundle:TableDeploymentBundle,projection:CatalogProjection,previous:CatalogProjection|null=null):{effects:EffectNode[];edges:TypedDependency[];publicationObligations:SourcePublicationObligation[]}{
 return deriveInitialRendererEffectsCore(bundle,projection,previous,false);
}

export interface SourcePublicationObligation {
 ownerKind:'operation'|'seed-set';ownerId:string;ownerSourcePath:string;
 targetCollection:keyof PrefixCatalog;targetIdentity:EffectIdentity;sourcePath:string;reason:string;
}
export interface ProjectionDependencyPartition {physicalEdges:CatalogProjection['dependencies'];publicationObligations:SourcePublicationObligation[]}
const catalogCollectionByKind={table:'tables',column:'columns',key:'keys',check:'checks',foreignKey:'foreignKeys',index:'indexes',policy:'policies',grant:'grants',comment:'comments'} as const satisfies Record<string,keyof PrefixCatalog>;
const sourceOwnerReason=(kind:string,reason:string,targetKind:string):boolean=>kind==='operation'&&((reason==='operation-requires-table'&&targetKind==='table')||(reason==='operation-requires-field'&&targetKind==='column')||(['operation-requires-cursor-key','operation-requires-conflict-key'].includes(reason)&&targetKind==='key'))||kind==='seed-set'&&reason==='seed-set-requires-table'&&targetKind==='table';
const physicalReason=(from:string,to:string,reason:string):boolean=>reason==='foreign-key-requires-target-key'&&from==='foreignKey'&&to==='key'||reason==='policy-requires-related-table'&&from==='policy'&&to==='table'||reason==='policy-requires-relationship-foreign-key'&&from==='policy'&&to==='foreignKey'||reason==='typed-field-reference'&&['check','foreignKey','index','policy','grant','comment'].includes(from)&&to==='column'||reason==='owned-by-table'&&['column','key','check','foreignKey','index','policy','grant','comment'].includes(from)&&to==='table'||reason==='grant-requires-column'&&from==='grant'&&to==='column'||reason==='key-requires-column'&&from==='key'&&to==='column'||reason==='comment-requires-column'&&from==='comment'&&to==='column';
/** Partition the exact complete source graph into renderer dependencies and source-only publication obligations. */
function sameProjection(left:CatalogProjection,right:CatalogProjection):boolean{
 const paths=(value:CatalogProjection)=>[...value.sourcePaths.entries()].sort(([a],[b])=>a.localeCompare(b));
 return canonical({catalog:left.catalog,dependencies:left.dependencies,operations:left.operations,rendererOperations:left.rendererOperations,seedStates:left.seedStates,sourcePaths:paths(left)})===canonical({catalog:right.catalog,dependencies:right.dependencies,operations:right.operations,rendererOperations:right.rendererOperations,seedStates:right.seedStates,sourcePaths:paths(right)});
}
function partitionRendererDependenciesCore(bundle:TableDeploymentBundle,projection:CatalogProjection,prepared=false,accounting?:AccountingContext):ProjectionDependencyPartition{
 if(!prepared&&!sameProjection(projection,projectG10Bundle(bundle,'next').projection))throw new Error('G10_DEPENDENCY_PROJECTION_NOT_SOURCE_DERIVED');
 const catalog=new Map<string,{collection:keyof PrefixCatalog;row:EffectSubject}>(),owners=new Map<string,{row:EffectSubject;path:string}>(),tablePaths=new Map<string,string>();
 for(const collection of Object.keys(catalogCollectionByKind) as (keyof typeof catalogCollectionByKind)[]){
  const target=catalogCollectionByKind[collection];for(const row of projection.catalog[target]){accounting?.visit('g10-dependency-catalog-index',`/catalog/${target}`);const digest=accounting?hashCanonicalCharged(row.identity,accounting,`/catalog/${target}/identity`):hashCanonical(row.identity);if(catalog.has(digest))throw new Error('G10_DEPENDENCY_DUPLICATE_CATALOG_IDENTITY');catalog.set(digest,{collection:target,row});if(target==='tables'&&row.identity.table){const path=projection.sourcePaths.get(digest);if(!path)throw new Error('G10_DEPENDENCY_TABLE_PATH');tablePaths.set(row.identity.table,path);}}
 }
 for(const row of projection.operations){accounting?.visit('g10-dependency-owner-index','/operations');const kind=row.identity.kind;if(kind!=='operation'&&kind!=='seed-set')throw new Error('G10_DEPENDENCY_UNKNOWN_SOURCE_OWNER');if(row.identity.table!==null||typeof row.identity.subject!=='string'||!row.identity.subject)throw new Error('G10_DEPENDENCY_SOURCE_OWNER_ID');const digest=accounting?hashCanonicalCharged(row.identity,accounting,'/operations/identity'):hashCanonical(row.identity),path=projection.sourcePaths.get(digest);if(!path||!path.startsWith('/'))throw new Error('G10_DEPENDENCY_SOURCE_OWNER_PATH');if(owners.has(digest))throw new Error('G10_DEPENDENCY_DUPLICATE_SOURCE_OWNER');owners.set(digest,{row,path});}
 const physicalEdges:CatalogProjection['dependencies']=[],publicationObligations:SourcePublicationObligation[]=[];let claimed=0;
 accounting?.visit('g10-dependency-edges','/dependencies',projection.dependencies.length);for(const edge of projection.dependencies){
  if(accounting)hashCanonicalCharged(edge,accounting,`/dependencies/${claimed}`);
  if(!edge||typeof edge.from!=='string'||typeof edge.to!=='string'||typeof edge.reason!=='string'||typeof edge.sourcePath!=='string'||!edge.sourcePath.startsWith('/')||edge.state!=='present')throw new Error('G10_DEPENDENCY_EDGE_SHAPE');
  const owner=owners.get(edge.from),target=catalog.get(edge.to);if(!target)throw new Error('G10_DEPENDENCY_TARGET_UNBOUND');
  if(owner){const kind=owner.row.identity.kind;if(edge.sourcePath!==owner.path||!sourceOwnerReason(kind,edge.reason,target.row.identity.kind))throw new Error('G10_DEPENDENCY_SOURCE_OWNER_MISMATCH');
   if(kind==='seed-set'){const meaning=owner.row.meaning as any;let seedState:CatalogProjection['seedStates'][number]|undefined;for(const seed of projection.seedStates){accounting?.visit('g10-dependency-seed-owner-search','/seedStates');if(seed.id===owner.row.identity.subject){seedState=seed;break;}}if(!meaning||meaning.id!==owner.row.identity.subject||!seedState||seedState.definitionDigest!==(accounting?hashCanonicalCharged(meaning,accounting,'/operations/seed/meaning'):hashCanonical(meaning))||seedState.sourcePath!==owner.path||seedState.state!=='not-run')throw new Error('G10_DEPENDENCY_SEED_OWNER_MISMATCH');}
   else {const meaning=owner.row.meaning as any;if(!meaning||!meaning.operation||meaning.operation.id!==owner.row.identity.subject||!obj(meaning.operation.body))throw new Error('G10_DEPENDENCY_OPERATION_OWNER_MISMATCH');}
   const ownerKind=kind as 'operation'|'seed-set';publicationObligations.push({ownerKind,ownerId:owner.row.identity.subject as string,ownerSourcePath:owner.path,targetCollection:target.collection,targetIdentity:target.row.identity,sourcePath:edge.sourcePath,reason:edge.reason});claimed++;continue;
  }
  const from=catalog.get(edge.from),ownerPath=projection.sourcePaths.get(edge.from),expectedKeyRecordPath=from?.row.identity.kind==='key'&&from.row.identity.table?tablePaths.get(from.row.identity.table)+'/record':undefined;const sourcePathMatches=ownerPath===edge.sourcePath||edge.reason==='key-requires-column'&&expectedKeyRecordPath===edge.sourcePath;if(!from||!physicalReason(from.row.identity.kind,target.row.identity.kind,edge.reason)||!sourcePathMatches)throw new Error('G10_DEPENDENCY_PHYSICAL_OWNER_MISMATCH');
  physicalEdges.push(edge);claimed++;
 }
 if(claimed!==projection.dependencies.length)throw new Error('G10_DEPENDENCY_UNCLAIMED_EDGE');
 return {physicalEdges,publicationObligations};
}
export function partitionRendererDependencies(bundle:TableDeploymentBundle,projection:CatalogProjection):ProjectionDependencyPartition{
 return partitionRendererDependenciesCore(bundle,projection);
}
/** Recompute the complete obligation multiset from verified source before a plan accepts caller-carried obligations. */
export function verifySourcePublicationCoverage(bundle:TableDeploymentBundle,obligations:readonly SourcePublicationObligation[]):void{
 const projection=projectG10Bundle(bundle,'next').projection,expected=partitionRendererDependencies(bundle,projection).publicationObligations;
 if(canonical(obligations)!==canonical(expected))throw new Error('G10_SOURCE_PUBLICATION_SOURCE_COVERAGE');
}

/** Rebind only compiler-owned diagnostic coordinates on otherwise identical retained rows. */
export function deriveG10ProvenanceMutations(previous:CatalogProjection|null,next:CatalogProjection,effects:readonly EffectNode[],accounting?:AccountingContext):CatalogMutation[]{
 if(!previous)return [];
 const touched=new Set<string>();
 for(const effect of effects){accounting?.visit('r2-provenance-touched-effect','/effects');touched.add(accounting?hashCanonicalCharged(inventoryCatalogIdentity(effect.subject),accounting,'/effects/subject'):hashCanonical(inventoryCatalogIdentity(effect.subject)));for(const mutation of effect.catalogMutations??[]){accounting?.visit('r2-provenance-touched-mutation','/effects/catalogMutations');touched.add(accounting?hashCanonicalCharged(mutation.identity,accounting,'/effects/catalogMutations/identity'):hashCanonical(mutation.identity));}}
 const out:CatalogMutation[]=[];
 const pathSlot=(collection:string,row:EffectSubject):{container:Record<string,any>;key:string}|null=>{
  const meaning=row.meaning as any;
  if(['columns','keys','checks','foreignKeys','indexes','comments'].includes(collection)&&meaning&&typeof meaning==='object'&&meaning.expectation&&typeof meaning.expectation==='object'&&Object.hasOwn(meaning.expectation,'sourcePath'))return {container:meaning.expectation,key:'sourcePath'};
  if((collection==='policies'||collection==='grants')&&meaning&&typeof meaning==='object'&&Object.hasOwn(meaning,'sourcePath'))return {container:meaning,key:'sourcePath'};
  return null;
 };
 const rowJson=(row:EffectSubject):Json=>({identity:effectClone(row.identity) as unknown as Json,meaning:effectClone(row.meaning),state:row.state,...(row.validation===undefined?{}:{validation:row.validation}),...(row.validity===undefined?{}:{validity:row.validity})});
 for(const collection of ['columns','keys','checks','foreignKeys','indexes','policies','grants','comments'] as const){
  const oldRows=previous.catalog[collection],newRows=next.catalog[collection];
  for(const oldRow of oldRows){accounting?.visit('r2-provenance-old-row','/previous/catalog/'+collection);const oldIdentity=accounting?canonicalCharged(oldRow.identity,accounting,'/previous/catalog/'+collection+'/identity'):canonical(oldRow.identity);if(oldRow.identity.table===null||touched.has(accounting?hashCanonicalCharged(oldRow.identity,accounting,'/previous/catalog/'+collection+'/identity'):hashCanonical(oldRow.identity)))continue;const candidates:EffectSubject[]=[];for(const row of newRows){accounting?.visit('r2-provenance-next-row','/next/catalog/'+collection);if((accounting?canonicalCharged(row.identity,accounting,'/next/catalog/'+collection+'/identity'):canonical(row.identity))===oldIdentity)candidates.push(row);}if(candidates.length!==1)continue;const fresh=candidates[0]!,oldSlot=pathSlot(collection,oldRow),newSlot=pathSlot(collection,fresh);if(!oldSlot||!newSlot)continue;const beforePath=oldSlot.container[oldSlot.key],afterPath=newSlot.container[newSlot.key];if(typeof beforePath!=='string'||typeof afterPath!=='string'||beforePath===afterPath)continue;
   const before=rowJson(oldRow),after=rowJson(fresh);if(accounting){hashCanonicalCharged(before,accounting,'/previous/catalog/'+collection+'/row-copy');hashCanonicalCharged(after,accounting,'/next/catalog/'+collection+'/row-copy');}const beforeMeaning=(before as any).meaning,newMeaning=(after as any).meaning;
   if(['columns','keys','checks','foreignKeys','indexes','comments'].includes(collection)){delete beforeMeaning.expectation.sourcePath;delete newMeaning.expectation.sourcePath;}else{delete beforeMeaning.sourcePath;delete newMeaning.sourcePath;}
   if((accounting?canonicalCharged(before,accounting,'/provenance/before'):canonical(before))!==(accounting?canonicalCharged(after,accounting,'/provenance/after'):canonical(after)))throw new Error('G10_PROVENANCE_NONPATH_CHANGE:'+collection);
   const mutation:CatalogMutation={collection,action:'replace',identity:effectClone(oldRow.identity) as unknown as Json,before:rowJson(oldRow),after:rowJson(fresh)};out.push(mutation);
  }
 }
 return out;
}

function inventoryCatalogIdentityFromCatalog(value:EffectIdentity):InventorySubject{
 const subject=value.subject,subjectRecord=subject!==null&&typeof subject==='object'&&!Array.isArray(subject)?subject:undefined;
 if(value.kind==='table'&&value.table!==null&&subjectRecord&&typeof subjectRecord.module==='string'&&typeof subjectRecord.element==='string')return {kind:'table',table:value.table,record:{module:subjectRecord.module,element:subjectRecord.element}};
 if(value.kind==='column'&&value.table!==null&&subjectRecord&&typeof subjectRecord.module==='string'&&typeof subjectRecord.element==='string')return {kind:'field',table:value.table,field:{module:subjectRecord.module,element:subjectRecord.element}};
 if(value.table!==null){const dependencyKind=value.kind==='foreignKey'?'foreignKey':value.kind==='index'?'index':value.kind==='policy'?'policy':value.kind==='grant'?'grant':value.kind==='check'?'check':value.kind==='key'?'key':value.kind==='comment'?'comment':undefined;if(dependencyKind){const id=['policy','grant','comment'].includes(dependencyKind)?JSON.stringify(value.subject):String(value.subject);return {kind:'dependency',table:value.table,dependencyKind,id,sourcePath:'/',meaningDigest:'0'.repeat(64)};}}
 return {kind:'metadata',profile:'umf.table-inventory-metadata/0.1'};
}

/** Lower only G02 .4 fills on retained carriers; no legacy migration plan is
 * synthesized. The internal constructor verifies exact effects against both
 * complete original bundles and the selected new-table bindings. */
export function deriveG02FieldEffects(previous:TableDeploymentBundle,next:TableDeploymentBundle,previousProjection:CatalogProjection,nextProjection:CatalogProjection,options:TableMigrationOptions,sourceOrder:number,accounting?:AccountingContext):{effects:EffectNode[];edges:TypedDependency[]}{
 accounting?.visit('g10-g02-created-table-discovery','/g02/createdTables',nextProjection.catalog.tables.length+previousProjection.catalog.tables.length);const createdTables=nextProjection.catalog.tables.map(row=>row.identity.table).filter((table):table is string=>table!==null&&!previousProjection.catalog.tables.some(old=>old.identity.table===table));const records=compileG02FieldEffects({previous,next,options,createdTables,...(accounting?{accounting}:{})});accounting?.visit('g10-g02-rendered-effect-records','/g02/effects',records.length);
 if(!records.length||records.some(record=>record.field.module!==records[0]!.field.module||record.field.element!==records[0]!.field.element||record.table!==records[0]!.table))throw new Error('G10_G02_TYPED_EFFECT_SHAPE');
 const field=records[0]!.field,table=records[0]!.table,fill=records.find(record=>record.role==='backfill');
 if(!fill?.rowOperationId)throw new Error('G10_G02_EFFECT_BINDING');
 const target=nextProjection.catalog.columns.filter(row=>{accounting?.visit('g10-g02-target-column-scan','/next/catalog/columns');return row.identity.table===table&&(accounting?hashCanonicalCharged(row.identity.subject,accounting,'/g02/target/identity')===hashCanonicalCharged(field,accounting,'/g02/field'):canonical(row.identity.subject)===canonical(field));});
 const old=previousProjection.catalog.columns.filter(row=>{accounting?.visit('g10-g02-prior-column-scan','/previous/catalog/columns');return row.identity.table===table&&(accounting?hashCanonicalCharged(row.identity.subject,accounting,'/g02/prior/identity')===hashCanonicalCharged(field,accounting,'/g02/field'):canonical(row.identity.subject)===canonical(field));});
 if(target.length!==1||!target[0]!.meaning||old.length>1||old.length===1&&!old[0]!.meaning)throw new Error('G10_G02_COLUMN_PREFIX_BINDING');
 const oldColumn=old.length===1;
 const tableBindings=next.expectedCatalog.tables.filter(candidate=>candidate.id===table),columns=tableBindings[0]?.columns.filter(column=>canonical(column.field)===canonical(field))??[];
 if(tableBindings.length!==1||columns.length!==1)throw new Error('G10_G02_DDL_BINDING');
 const bindingKey=hashCanonical([table,field.module,field.element]).slice(0,24),group=`g02-fill:${bindingKey}`,subject:EffectNode['subject']={kind:'field',table,field},effects:EffectNode[]=[];
 const effectSubjects:EffectNode['subject'][]=[];
 const stagedMeaning=(stage:'added'|'defaulted'):Json=>{
  const meaning=effectClone(target[0]!.meaning) as any;
  if(!meaning||typeof meaning!=='object'||!meaning.column||!meaning.expectation||typeof meaning.expectation!=='object')throw new Error('G10_G02_COLUMN_MEANING_SHAPE');
  const column=effectClone(columns[0]!) as any;
  if(stage==='added')delete column.default;
  meaning.column=column;meaning.expectation.nullable=true;meaning.expectation.definitionSql=columnDefinitionSql(column,true);
  return meaning as Json;
 };
 for(const [offset,record] of records.entries()){
  accounting?.visit('g10-g02-effect-emission',`/g02/effects/${offset}`);accounting?.scanUtf8(record.sql,`/g02/effects/${offset}/sql`);accounting?.scanUtf8(record.sourcePath,`/g02/effects/${offset}/sourcePath`);
  const common={id:`g02-${bindingKey}-${record.role}-${offset}`,kind:'table',subject,sourcePath:record.sourcePath,sql:record.sql,transaction:'required' as const,recovery:'rollback-transaction' as const,sourceOrder:sourceOrder+offset+1,atomicGroup:group};
  if(record.role==='backfill')effects.push({...common,kind:'backfill',operation:'apply-backfill',sql:'',dataBinding:{profile:'umf.table-inventory-backfill/0.1',selectionIndex:0,operationId:record.rowOperationId!,previousSourceDigest:previous.sourceDigest,nextSourceDigest:next.sourceDigest},transition:{action:'update',collection:'columns',meaning:{}}});
  else if(record.role==='add-column'){
   const addEffect:EffectNode={...common,operation:'add-column',transition:{action:'add',collection:'columns',meaning:{catalogMeaning:stagedMeaning('added'),validation:null,validity:null}}};
   if(!oldColumn){const tableRecord=tableBindings[0]!.record,tableIdentity={kind:'table',table,subject:tableRecord as unknown as Json},before=findSubject(previousProjection.catalog,'tables',tableIdentity),after=findSubject(nextProjection.catalog,'tables',tableIdentity),mutation:CatalogMutation={collection:'tables',action:'replace',identity:tableIdentity as unknown as Json,before:{identity:before.identity as unknown as Json,meaning:before.meaning,state:before.state},after:{identity:after.identity as unknown as Json,meaning:after.meaning,state:after.state}};addEffect.catalogMutations=[mutation];}
   effects.push(addEffect);
  }
  else if(record.role==='target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>{const meaning=row.meaning,meaningRecord=meaning!==null&&typeof meaning==='object'&&!Array.isArray(meaning)?meaning:undefined;return row.identity.table===table&&row.identity.subject===domainId&&meaningRecord!==undefined&&canonical(meaningRecord.field)===canonical(field);});
   if(check.length!==1)throw new Error('G10_G02_TARGET_CHECK_BINDING');
   if(record.operation==='add-not-valid')throw new Error('G10_G02_UNSUPPORTED_DEFERRED_CHECK_VALIDATION');
   effects.push({...common,subject,operation:'target-check',transition:{action:'add',collection:'checks',meaning:{catalogMeaning:effectClone(check[0]!.meaning),validation:check[0]!.validation??null,validity:check[0]!.validity??null}}});
   effectSubjects.push(subject);continue;
  }else if(record.role==='validate-target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>{const meaning=row.meaning,meaningRecord=meaning!==null&&typeof meaning==='object'&&!Array.isArray(meaning)?meaning:undefined;return row.identity.table===table&&row.identity.subject===domainId&&meaningRecord!==undefined&&canonical(meaningRecord.field)===canonical(field);});
   if(check.length!==1)throw new Error('G10_G02_TARGET_CHECK_BINDING');
   throw new Error('G10_G02_UNSUPPORTED_DEFERRED_CHECK_VALIDATION');
  }else if(record.role==='install-default')effects.push({...common,operation:'install-default',transition:{action:'update',collection:'columns',meaning:stagedMeaning('defaulted')}});
  else if(record.role==='tighten-not-null')effects.push({...common,operation:'tighten-not-null',transition:{action:'update',collection:'columns',meaning:effectClone(target[0]!.meaning)}});
  else throw new Error('G10_G02_UNSUPPORTED_RENDERED_ROLE');
  effectSubjects.push(subject);
 }
 const edges:TypedDependency[]=[];
 for(const [index,effect] of effects.entries())if(index>0)edges.push({dependent:hashCanonical(inventoryCatalogIdentity(effectSubjects[index]!)),prerequisite:hashCanonical(inventoryCatalogIdentity(effectSubjects[index-1]!)),sourcePath:effect.sourcePath,reason:`g02-effect-order:${records[index-1]!.role}:${records[index]!.role}`,state:'present'});
 const oldGrant=previousProjection.catalog.grants.filter(row=>row.identity.table===table&&(row.meaning as any).role===previous.configuration.personRole&&(row.meaning as any).privilege==='update'&&(row.meaning as any).effect==='grant'),newGrant=nextProjection.catalog.grants.filter(row=>row.identity.table===table&&(row.meaning as any).role===next.configuration.personRole&&(row.meaning as any).privilege==='update'&&(row.meaning as any).effect==='grant');
 if(oldGrant.length===0&&newGrant.length===0){}
 else if(oldGrant.length!==1||newGrant.length!==1)throw new Error('G10_G02_PERSON_UPDATE_GRANT_CARDINALITY');
 else if(canonical(oldGrant[0]!.identity)!==canonical(newGrant[0]!.identity)){
  const declaration=next.expectedCatalog.tables.find(item=>item.id===table);if(!declaration)throw new Error('G10_G02_GRANT_TABLE');
  const priorDeclaration=previous.expectedCatalog.tables.find(item=>item.id===table);if(!priorDeclaration)throw new Error('G10_G02_GRANT_TABLE');
  const oldColumns=(oldGrant[0]!.meaning as any).columns as unknown[],nextColumns=(newGrant[0]!.meaning as any).columns as unknown[];
  const names=(items:unknown[])=>{if(items.some(value=>typeof value!=='string')||new Set(items).size!==items.length)throw new Error('G10_G02_GRANT_COLUMNS');return items as string[];};
  const changedNames=new Set([...names(oldColumns).filter(name=>!names(nextColumns).includes(name)),...names(nextColumns).filter(name=>!names(oldColumns).includes(name))]);
  const selectedNames=new Set([priorDeclaration.columns.find(column=>canonical(column.field)===canonical(field))?.name,declaration.columns.find(column=>canonical(column.field)===canonical(field))?.name].filter((name):name is string=>typeof name==='string'));
  if([...changedNames].some(name=>!selectedNames.has(name)))throw new Error('G10_G02_UNRELATED_GRANT_COLUMN');
  const grantEffect=(row:EffectSubject,bundle:TableDeploymentBundle,role:'grant-add'|'grant-revoke',order:number):EffectNode=>{
   const meaning=row.meaning as any;if(meaning.table!==table||meaning.privilege!=='update'||meaning.grantOption!==false||typeof meaning.role!=='string'||!Array.isArray(meaning.columns)||meaning.columns.length===0||meaning.columns.some((name:unknown)=>typeof name!=='string'))throw new Error('G10_G02_GRANT_MEANING');
   const sourcePath=meaning.sourcePath;if(typeof sourcePath!=='string'||!sourcePath.endsWith('/policy/person/update'))throw new Error('G10_G02_GRANT_PATH');
   const boundRow=sourceBoundPersonUpdateGrant(bundle,table,sourcePath,meaning,row.identity),rendered=renderG02GrantEffect({role,sourcePath,row:boundRow}),identitySubject=row.identity.subject as Json[],subject:EffectNode['subject']={kind:'dependency',table,dependencyKind:'grant',id:JSON.stringify(identitySubject),sourcePath,meaningDigest:hashCanonical(row.meaning)},action=role==='grant-add'?'add' as const:'remove' as const;
   return {id:`g02-${bindingKey}-${role}`,kind:'grant',operation:role==='grant-add'?'dependency-add':'dependency-drop',subject,sourcePath,sql:rendered.sql,transaction:'required',recovery:'rollback-transaction',sourceOrder:order,atomicGroup:group,transition:{action,collection:'grants',meaning:action==='add'?{catalogMeaning:effectClone(row.meaning),validation:null,validity:null}:{}}};
  };
  const revoke=grantEffect(oldGrant[0]!,previous,'grant-revoke',sourceOrder),add=grantEffect(newGrant[0]!,next,'grant-add',sourceOrder+records.length+1);effects.unshift(revoke);effects.push(add);
  effectSubjects.unshift(revoke.subject);effectSubjects.push(add.subject);
  const revokeIdentity=hashCanonical(inventoryCatalogIdentity(revoke.subject)),addIdentity=hashCanonical(inventoryCatalogIdentity(add.subject));
  const grantColumnIdentities=(row:EffectSubject,declaration:{columns:{name:string;field:TableRef}[]}):string[]=>{
   const meaning=row.meaning as any,names=meaning.columns as string[],identities:string[]=[];
   for(const name of names){const column=declaration.columns.find(item=>item.name===name);if(!column)throw new Error('G10_G02_GRANT_COLUMN_UNBOUND:'+name);identities.push(hashCanonical(inventoryCatalogIdentity({kind:'field',table,field:column.field})));}
   return identities;
  };
  const fieldIdentity=hashCanonical(inventoryCatalogIdentity(subject));
  // Keep the direct edge to the full selected Field group even when adding a
  // newly granted Field is the only catalog-column prerequisite in the new
  // grant (or the selected Field is absent from one side's grant columns).
  edges.push({dependent:fieldIdentity,prerequisite:revokeIdentity,sourcePath:revoke.sourcePath,reason:'g02-grant-revoke-before-field',state:'present'});
  edges.push({dependent:addIdentity,prerequisite:fieldIdentity,sourcePath:add.sourcePath,reason:'g02-grant-add-after-field-group',state:'present'});
  for(const columnIdentity of grantColumnIdentities(oldGrant[0]!,priorDeclaration))edges.push({dependent:columnIdentity,prerequisite:revokeIdentity,sourcePath:revoke.sourcePath,reason:'g02-grant-revoke-before-field',state:'present'});
  for(const columnIdentity of grantColumnIdentities(newGrant[0]!,declaration))edges.push({dependent:addIdentity,prerequisite:columnIdentity,sourcePath:add.sourcePath,reason:'g02-grant-add-after-field-group',state:'present'});
 }
 return {effects,edges};
}

export interface InventoryPlanInput {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:Json;history:Json;historyBinding:{profile:'umf.table-inventory-source-history/0.1';count:number;digest:string};inventory:InventoryDelta;initialPrefix:Omit<import('./inventory-graph').PrefixFrame,'digest'>;nextCatalog:Record<string,Json[]>;effects:EffectNode[];dependencies:TypedDependency[];publicationObligations:SourcePublicationObligation[];provenanceMutations:CatalogMutation[];seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};review:Json[];}
function verifySourcePublicationObligations(obligations:readonly SourcePublicationObligation[],schedule:ScheduledInventoryEffects,accounting?:AccountingContext):void{
 const published=schedule.prefixes.at(-1);if(!published||published.metadata.state!=='published')fail('SOURCE_PUBLICATION_PREFIX');
 accounting?.visit('inventory-publication-obligation-check','/publicationObligations',obligations.length);for(const obligation of obligations){
  if(!obligation||!['operation','seed-set'].includes(obligation.ownerKind)||!obligation.ownerId||!obligation.ownerSourcePath.startsWith('/')||obligation.sourcePath!==obligation.ownerSourcePath||!['operation-requires-table','operation-requires-field','operation-requires-cursor-key','operation-requires-conflict-key','seed-set-requires-table'].includes(obligation.reason))fail('SOURCE_PUBLICATION_OBLIGATION_SHAPE');
  if(obligation.ownerKind==='operation'&&!obligation.reason.startsWith('operation-requires-')||obligation.ownerKind==='seed-set'&&obligation.reason!=='seed-set-requires-table')fail('SOURCE_PUBLICATION_OWNER_REASON');
  const targetKind=obligation.targetIdentity?.kind,targetCollection=targetKind==='table'?'tables':targetKind==='column'?'columns':targetKind==='key'?'keys':undefined;if(!targetCollection||obligation.targetCollection!==targetCollection||obligation.ownerKind==='operation'&&((obligation.reason==='operation-requires-table'&&targetKind!=='table')||(obligation.reason==='operation-requires-field'&&targetKind!=='column')||(['operation-requires-cursor-key','operation-requires-conflict-key'].includes(obligation.reason)&&targetKind!=='key'))||obligation.ownerKind==='seed-set'&&targetKind!=='table')fail('SOURCE_PUBLICATION_TARGET_KIND');
  const rows=published.catalog[obligation.targetCollection];if(!Array.isArray(rows))fail('SOURCE_PUBLICATION_TARGET_MISSING:'+obligation.ownerKind+':'+obligation.ownerId);let found=0;for(const row of rows){accounting?.visit('inventory-publication-target-row',`/publicationObligations/${obligation.ownerId}`);if(row&&typeof row==='object'&&!Array.isArray(row)&&(accounting?hashCanonicalCharged((row as Record<string,Json>).identity,accounting,'/publicationObligations/identity'):hashCanonical((row as Record<string,Json>).identity))===(accounting?hashCanonicalCharged(obligation.targetIdentity,accounting,'/publicationObligations/target'):hashCanonical(obligation.targetIdentity))&&(row as Record<string,Json>).state==='present')found++;}if(found!==1)fail('SOURCE_PUBLICATION_TARGET_MISSING:'+obligation.ownerKind+':'+obligation.ownerId);
 }
}
/** Construct the closed unpublished G10 plan from already verified source projections and typed renderer effects. */
export function compileInventoryPlan(input:InventoryPlanInput):Record<string,Json>{
 const next=verifyTableDeployment(input.next),previous=input.previous===null?null:verifyTableDeployment(input.previous);if(next.bundleDigest!==input.next.bundleDigest||previous?.bundleDigest!==input.previous?.bundleDigest)fail('BUNDLE_VERIFICATION');
 try{verifySourcePublicationCoverage(next,input.publicationObligations);}catch{fail('SOURCE_PUBLICATION_SOURCE_COVERAGE');}
 return compileInventoryPlanCore(input);
}
function compileInventoryPlanCore(input:InventoryPlanInput,accounting?:AccountingContext):Record<string,Json>{
 const previous=input.previous,next=input.next;
 accounting?.visit('inventory-plan-effect-copy','/effects',input.effects.length);const sources=input.effects.map(effect=>({...effect})),metadataIds={prepare:'g10-inventory-prepare',approval:'g10-inventory-approval',publication:'g10-inventory-publication'},schedule=scheduleTypedInventoryEffects(input.initialPrefix,sources,input.dependencies,input.nextCatalog,metadataIds,input.provenanceMutations,accounting);verifySourcePublicationObligations(input.publicationObligations,schedule,accounting);
 if(schedule.prefixes.length!==schedule.phases.length+1||schedule.phases.length<3||schedule.phases[0]?.kind!=='prepare'||schedule.phases[1]?.kind!=='approval'||schedule.phases.at(-1)?.kind!=='publication')fail('PHASE_ENVELOPE');
 const {steps,phases,prefixes}=serialize(schedule,sources,metadataIds,accounting),executionProfile={version:'umf.table-inventory-execution/0.1',progressRelation:'umf_lifecycle_inventory_progress',ownerOnly:true,ingressProfile:'umf.table-inventory-generation-ingress/0.1',inventoryProfile:'umf.table-inventory-prefix/0.1',initial:previous===null,conversionProfile:null,originalsProfile:null,retirementProfile:null,retiredStoreProfile:null},approvalProfile={version:'umf.table-migration-approval/0.1',relation:'umf_lifecycle_approvals',ownerOnly:true};
 const serializedInventory={...input.inventory} as Record<string,unknown>;delete serializedInventory.fieldChanges;
 const history=input.history as any;if(!history||history.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(history.plans)||!Array.isArray(history.executions)||input.historyBinding.count!==history.plans.length||input.historyBinding.digest!==(accounting?hashCanonicalCharged(history,accounting,'/history'):hashCanonical(history))||input.historyBinding.profile!==history.profile)fail('HISTORY_BINDING');
 const body:Record<string,Json>={version:'umf.table-inventory-migration/0.1',canonicalization:'RFC8785',id:input.id,predecessor:input.predecessor as unknown as Json,previous:input.previous as unknown as Json,next:input.next as unknown as Json,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:steps as unknown as Json,seedExecution:input.seedExecution as unknown as Json,phases:phases as unknown as Json,executionProfile,approvalProfile,options:input.options,review:input.review,requiresApproval:true,nativeQualified:false,inventory:serializedInventory as unknown as Json,prefixes:prefixes as unknown as Json,historyBinding:input.historyBinding as unknown as Json};
 body.digest=accounting?hashCanonicalCharged(body,accounting,'/plan'):hashCanonical(body);const bodyCanonical=accounting?canonicalCharged(body,accounting,'/plan'):canonical(body);if(new TextEncoder().encode(bodyCanonical).length>25165824)fail('PLAN_SIZE');return body;
}

export function createHistoricalG10Verifier(accounting?:AccountingContext):HistoricalG10PlanVerifier {
 // One verifier instance is shared by every validation/recompile below a root
 // request. The key binds exact canonical plan and prior-history contents, so
 // this is only a computation cache; it never substitutes an ID/digest lookup
 // for source recompilation or history-chain validation.
 const verified=new Map<number,string>(),planSnapshots=new Map<number,string>(),executionSnapshots=new Map<number,string>(),active=new Set<number>();
 let retainedBytes=0;
 const utf8Bytes=(value:string,path:string):number=>{const size=new TextEncoder().encode(value).byteLength;accounting?.retainBytes('g10-history-verifier-cache',size,path);return size;};
 let verify:HistoricalG10PlanVerifier;
 const verifyCore:HistoricalG10PlanVerifier=(value,index,priorHistory)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('HISTORICAL_G10_SHAPE');
  accounting?.charge('historyMember',1,`/history/plans/${index}`);
  const plan=value as Record<string,unknown>,planBytes=accounting?canonicalCharged(plan,accounting,`/history/plans/${index}`):canonical(plan),cached=verified.get(index);
  if(!Number.isSafeInteger(index)||index<0||index>128||!priorHistory||typeof priorHistory!=='object'||Array.isArray(priorHistory))fail('HISTORICAL_G10_CONTEXT_CHANGED');
  const prefix=priorHistory;
  if(prefix.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(prefix.plans)||!Array.isArray(prefix.executions)||prefix.plans.length!==index||prefix.executions.length!==index)fail('HISTORICAL_G10_CONTEXT_CHANGED');
  // The caller reaches this verifier in chronological history validation: each
  // preceding execution has already been checked against its preceding plan.
  // Intern each exact member once instead of retaining a full copied prefix at
  // every index. Cache hits still compare every supplied member byte-for-byte.
  for(let member=0;member<index;member++){
   accounting?.charge('historyMember',2,`/history/prefix/${member}`);
   const priorPlanBytes=accounting?canonicalCharged(prefix.plans[member],accounting,`/history/prefix/${member}/plan`):canonical(prefix.plans[member]),priorExecutionBytes=accounting?canonicalCharged(prefix.executions[member],accounting,`/history/prefix/${member}/execution`):canonical(prefix.executions[member]);
   accounting?.visit('g10-history-prefix-comparison',`/history/prefix/${member}`,2);
   const knownPlan=planSnapshots.get(member),knownExecution=executionSnapshots.get(member);
   if((knownPlan!==undefined&&knownPlan!==priorPlanBytes)||(knownExecution!==undefined&&knownExecution!==priorExecutionBytes))fail('HISTORICAL_G10_CONTEXT_CHANGED');
   if(knownPlan===undefined){const size=utf8Bytes(priorPlanBytes,`/history/prefix/${member}/plan`);if(retainedBytes+size>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');accounting?.visit('g10-history-plan-map-retention',`/history/prefix/${member}`);planSnapshots.set(member,priorPlanBytes);retainedBytes+=size;}
   if(knownExecution===undefined){const size=utf8Bytes(priorExecutionBytes,`/history/prefix/${member}/execution`);if(retainedBytes+size>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');accounting?.visit('g10-history-execution-map-retention',`/history/prefix/${member}`);executionSnapshots.set(member,priorExecutionBytes);retainedBytes+=size;}
  }
  const knownCurrent=planSnapshots.get(index);
  if(knownCurrent!==undefined&&knownCurrent!==planBytes)fail('HISTORICAL_G10_CONTEXT_CHANGED');
  if(cached){if(cached===planBytes)return;fail('HISTORICAL_G10_CONTEXT_CHANGED');}
  accounting?.visit('g10-history-active-index-lookup',`/history/plans/${index}`);if(active.has(index))fail('HISTORICAL_G10_RECURSIVE_CYCLE');
  accounting?.visit('g10-history-active-index-retention',`/history/plans/${index}`);active.add(index);
  try{
   const request={id:plan.id,predecessor:plan.predecessor,previous:plan.previous,next:plan.next,options:plan.options,history:priorHistory};
   const rebuilt=compileG10InventoryPlanInternal(request,verify,accounting);
   const rebuiltBytes=accounting?canonicalCharged(rebuilt,accounting,`/history/rebuilt/${index}`):canonical(rebuilt),expectedBytes=accounting?canonicalCharged(plan,accounting,`/history/plans/${index}/recompiled`):canonical(plan);accounting?.visit('g10-history-recompile-comparison',`/history/plans/${index}`);if(rebuiltBytes!==expectedBytes)fail('HISTORICAL_G10_RECOMPILE:'+index);
   // Keep at most the admitted original history once (plans and executions),
   // plus one plan snapshot per position; never materialize nested full-prefix
   // cache keys or repeatedly recompile a cached prefix.
   const planSize=utf8Bytes(planBytes,`/history/plans/${index}`);if(verified.size>=128||retainedBytes+planSize>25165824)fail('HISTORICAL_G10_CONTEXT_SIZE');
   accounting?.visit('g10-history-verified-map-retention',`/history/plans/${index}`,3);verified.set(index,planBytes);planSnapshots.set(index,planBytes);retainedBytes+=planSize;
  }finally{active.delete(index);}
 };
 verify=(value,index,priorHistory)=>{
  if(accounting||ordinaryProjectionCaches.has(verify))return verifyCore(value,index,priorHistory);
  ordinaryProjectionCaches.set(verify,{entries:new Map(),coreReuses:0});
  try{return verifyCore(value,index,priorHistory);}finally{ordinaryProjectionCaches.delete(verify);}
 };
 return verify;
}
/** Source-driven compiler/recompiler for the currently representable table-install and mixed-create subset. */
export function compileG10InventoryPlan(input:unknown):Record<string,Json>{
 const verifier=createHistoricalG10Verifier();return withOrdinaryProjectionScope(verifier,()=>compileInventoryPlanFromPrepared(prepareInventoryCompilation(input,verifier)));
}
export function compileG10InventoryDelta(input:unknown,verifyHistoricalG10?:HistoricalG10PlanVerifier):InventoryDelta {
 const request=validateG10RequestShape(input,verifyHistoricalG10),next=projectG10Bundle(request.next,'next'),previous=request.previous===null?null:projectG10Bundle(request.previous,'previous');
 const seedLineage=deriveInventorySeedLineage(request.history,{previous:request.previous,next:request.next,options:{seedSets:request.options.seedSets,retiredSeedSets:request.options.retiredSeedSets}},verifyHistoricalG10);
 return compileG10InventoryDeltaFromPrepared(request,next,previous,seedLineage);
}
function compileG10InventoryDeltaFromPrepared(request:G10ValidatedRequest,next:ReturnType<typeof projectG10Bundle>,previous:ReturnType<typeof projectG10Bundle>|null,seedLineage:ReturnType<typeof deriveInventorySeedLineage>,accounting?:AccountingContext):InventoryDelta {
 const options=request.options;
 accounting?.visit('g10-delta-table-intents','/options/tableIntents',options.tableIntents.length);accounting?.visit('g10-delta-next-review-rows','/next/tables',next.tables.length);accounting?.visit('g10-delta-history-lineage','/history/seedLineage',seedLineage.length);
 const notImplemented:(keyof G10ValidatedRequest['options'])[]=['defaultChanges','conversions','concurrentIndexes','validations','retiredSeedSets'];
 for(const key of notImplemented){accounting?.visit('g10-delta-composition-gate','/options/'+key);if(options[key].length)throw new Error('G10_COMPOSITION_NOT_IMPLEMENTED:/options/'+key);}
 const g02Tables:string[]=[];for(const intent of options.tableIntents){accounting?.visit('g10-delta-create-table-intent','/options/tableIntents');if(intent.kind==='create')g02Tables.push(intent.table);}
 if(options.backfills.length){
  if(!previous||options.backfills.length!==1)throw new Error('G10_G02_SELECTION_CLOSED');
  const ownedMarkers=partitionInventoryMarkersForG02(options.reviewedChanges as any,previous.bundle,next.bundle,g02Tables,options.backfills[0]!);
  accounting?.visit('g10-delta-g02-validation','/options/backfills');compileG02FieldEffects({previous:previous.bundle,next:next.bundle,options:{version:'umf.table-migration-options/0.4',backfills:options.backfills,concurrentIndexes:[],reviewedChanges:ownedMarkers,validations:[]} as unknown as TableMigrationOptions,createdTables:g02Tables,...(accounting?{accounting}:{})});
 }
 if(previous&&(accounting?hashCanonicalCharged(previous.bundle.configuration,accounting,'/previous/configuration'):hashCanonical(previous.bundle.configuration))!==(accounting?hashCanonicalCharged(next.bundle.configuration,accounting,'/next/configuration'):hashCanonical(next.bundle.configuration)))throw new Error('G10_CONFIGURATION_CHANGE_UNSUPPORTED');
 accounting?.visit('g10-delta-intent-coverage','/options/tableIntents',options.tableIntents.length);validateExactTableIntentCoverage(previous,next,options);
 accounting?.visit('g10-delta-g02-source-certificate','/options/backfills');if(accounting&&previous){hashCanonicalCharged(previous.bundle,accounting,'/previous/g02-certificate');hashCanonicalCharged(next.bundle,accounting,'/next/g02-certificate');hashCanonicalCharged(options,accounting,'/options/g02-certificate');}const g02SourceExact=options.backfills.length===1&&!!previous&&sameSourceExceptG02AndCreates(previous.bundle,next.bundle,options,g02Tables);
 if(options.backfills.length&&!g02SourceExact)throw new Error('G10_G02_SOURCE_DELTA_UNRELATED');
 // backfills stays unknown[] at the public options boundary; prior closed
 // admission and the unchanged G02 constructor have already validated it here.
 const selectedBackfill=options.backfills.length===1?options.backfills[0]:undefined;
 const g02Target=selectedBackfill!==undefined&&selectedBackfill!==null&&typeof selectedBackfill==='object'&&!Array.isArray(selectedBackfill)&&'table' in selectedBackfill&&typeof selectedBackfill.table==='string'?selectedBackfill.table:undefined;
 const priorOwned=g02SourceExact?ownedNativeTableMeanings(previous!.projection):null,freshOwned=g02SourceExact?ownedNativeTableMeanings(next.projection):null;
 const selected=new Map<string,TableIntent>();for(const [i,intent]of options.tableIntents.entries()){accounting?.visit('g10-delta-intent-index',`/options/tableIntents/${i}`);const k=JSON.stringify([intent.kind,intent.table]);if(selected.has(k))throw new Error('G10_INTENT_DUPLICATE:'+i);selected.set(k,intent);}
 const oldMap=new Map((previous?.tables??[]).map(t=>[t.table,t])),newMap=new Map(next.tables.map(t=>[t.table,t])),zero=hashCanonical(null),changes:InventoryChange[]=[],fieldChanges:InventoryFieldChange[]=[];
 const findReview=(rows:readonly InventoryProjection[],table:string,side:string):InventoryProjection|undefined=>{for(const row of rows){accounting?.visit('g10-delta-review-lookup',`/${side}/reviews`);if(row.table===table)return row;}return undefined;};
 for(const old of previous?.tables??[]){accounting?.visit('g10-delta-prior-table','/previous/tables');const fresh=newMap.get(old.table);if(fresh){if(!sameRef(old.record,fresh.record)||old.schema!==fresh.schema||old.name!==fresh.name)throw new Error('G10_RETAINED_TABLE_BINDING_CHANGED:'+old.table);if(g02SourceExact&&old.table!==g02Target&&(accounting?canonicalCharged(priorOwned!.get(old.table)??[],accounting,`/previous/${old.table}/nativeMeaning`):canonical(priorOwned!.get(old.table)??[]))!==(accounting?canonicalCharged(freshOwned!.get(old.table)??[],accounting,`/next/${old.table}/nativeMeaning`):canonical(freshOwned!.get(old.table)??[])))throw new Error('G10_G02_RETAINED_NATIVE_MEANING_CHANGED:'+old.table);const oldReview=findReview(previous!.reviews,old.table,'previous'),nextReview=findReview(next.reviews,old.table,'next');if(!oldReview||!nextReview)throw new Error('G10_RETAINED_REVIEW_MISSING');const oldMeaningDigest=accounting?hashCanonicalCharged(stableMeaningValue(oldReview.meaning),accounting,`/previous/${old.table}/stableMeaning`):stableMeaningDigest(oldReview.meaning),nextMeaningDigest=accounting?hashCanonicalCharged(stableMeaningValue(nextReview.meaning),accounting,`/next/${old.table}/stableMeaning`):stableMeaningDigest(nextReview.meaning);if(oldMeaningDigest!==nextMeaningDigest&&!sameSourceExceptG05SelectedFields(previous!.bundle,next.bundle,options,old.table)&&!g02SourceExact)throw new Error('G10_RETAINED_SEMANTIC_CHANGE_UNIMPLEMENTED:'+old.table);continue;}const key=JSON.stringify(['remove',old.table]),intent=selected.get(key);if(!intent||!sameRef(intent.record,old.record))throw new Error('G10_REMOVE_INTENT_MISSING:'+old.table);selected.delete(key);const oldReview=findReview(previous!.reviews,old.table,'previous');if(!oldReview)throw new Error('G10_REVIEW_PREVIOUS_MISSING');changes.push({kind:'remove-table',table:old.table,record:clone(intent.record),beforePath:String((oldReview.meaning as any).physicalTable.path),afterPath:null,beforeMeaningDigest:old.meaningDigest,afterMeaningDigest:zero});}
 for(const fresh of next.tables){if(oldMap.has(fresh.table))continue;const key=JSON.stringify(['create',fresh.table]),intent=selected.get(key);if(!intent||!sameRef(intent.record,fresh.record))throw new Error('G10_CREATE_INTENT_MISSING:'+fresh.table);selected.delete(key);changes.push({kind:'create-table',table:fresh.table,record:clone(fresh.record),beforePath:null,afterPath:String((next.reviews.find(r=>r.table===fresh.table)!.meaning as any).physicalTable.path),beforeMeaningDigest:zero,afterMeaningDigest:fresh.meaningDigest});}
 if(selected.size)throw new Error('G10_INTENT_UNUSED');
 for(const item of [...options.retirements as any[],...options.restorations as any[]]){
  const oldReview=previous?.reviews.find(row=>row.table===item.table),newReview=next.reviews.find(row=>row.table===item.table);
  if(!newReview||!oldReview)throw new Error('G10_FIELD_CHANGE_TABLE_MISSING:'+item.table);
  const oldField=previous?sourceFieldMeaning(previous.bundle,item.table,item.field):null,newField=sourceFieldMeaning(next.bundle,item.table,item.field),retirement=(options.retirements as any[]).includes(item);
  if(retirement){if(oldField===null||newField!==null)throw new Error('G10_RETIREMENT_FIELD_MEANING');fieldChanges.push({kind:'retire-field',table:item.table,field:clone(item.field),beforePath:sourceMappingPath(previous!.bundle,item.table,item.field),afterPath:null,beforeMeaningDigest:hashCanonical(oldField),afterMeaningDigest:zero,selection:clone(item) as Json});}
  else {if(oldField!==null||newField===null)throw new Error('G10_RESTORATION_FIELD_MEANING');fieldChanges.push({kind:'restore-field',table:item.table,field:clone(item.field),beforePath:null,afterPath:sourceMappingPath(next.bundle,item.table,item.field),beforeMeaningDigest:zero,afterMeaningDigest:hashCanonical(newField),selection:clone(item) as Json});}
 }
 if(previous&&changes.length===0&&fieldChanges.length===0)throw new Error('G10_EXISTING_ONLY_TRANSITION_UNSUPPORTED');
 const names=new Map<string,string>();for(const table of [...(previous?.tables??[]),...next.tables]){const nameKey=JSON.stringify([table.schema,table.name]),existing=names.get(nameKey);if(existing&&existing!==table.table){const replacement=changes.some(c=>c.kind==='remove-table'&&c.table===existing)&&changes.some(c=>c.kind==='create-table'&&c.table===table.table);if(!replacement)throw new Error('G10_SAME_NAME_REPLACEMENT_UNEXPLICIT');}else names.set(nameKey,table.table);}
 return {profile:'umf.table-inventory-delta/0.1',previousTables:previous?.tables??[],nextTables:next.tables,changes,fieldChanges,seedLineage};
}

function stableMeaningValue(meaning:Json|null):Json|null {
 if(meaning===null)return null;
 const value=clone(meaning) as any;
 delete value.physicalTable.path;delete value.recordDefinition.path;
 for(const field of value.fieldDefinitions)delete field.path;
 for(const item of value.sourceClosure)delete item.path;
 const stripProjectionPath=(subject:any)=>{
  const m=subject.meaning;
  if(m&&typeof m==='object'&&!Array.isArray(m)){
   if(Object.hasOwn(m,'sourcePath'))delete m.sourcePath;
   if(m.expectation&&typeof m.expectation==='object'&&!Array.isArray(m.expectation))delete m.expectation.sourcePath;
  }
 };
 for(const items of Object.values(value.catalog) as any[][])for(const subject of items){stripProjectionPath(subject);if(subject.identity.kind==='operation'&&subject.meaning&&typeof subject.meaning==='object'&&!Array.isArray(subject.meaning)){for(const domain of subject.meaning.logicalParameterDomains??[]){delete domain.parameterPath;delete domain.definitionPath;}}}
 for(const edge of value.dependencies)delete edge.sourcePath;
 for(const seed of value.seedDefinitions)delete seed.sourcePath;
 return value as Json;
}
function stableMeaningDigest(meaning:Json|null):string{return hashCanonical(stableMeaningValue(meaning));}
function ownedNativeTableMeanings(projection:CatalogProjection):Map<string,Json[]>{
 const output=new Map<string,Json[]>();
 for(const collection of Object.keys(projection.catalog) as (keyof PrefixCatalog)[]){
  for(const row of projection.catalog[collection]){
   const table=row.identity.table;if(table===null)continue;
   const meaning=clone(row.meaning) as any;
   // Source paths are provenance coordinates. They may move when selected
   // CREATE declarations are authored before a retained table; native meaning
   // and every other catalog field remain exact.
   if(meaning&&typeof meaning==='object'){
    // Match only the diagnostic coordinates already excluded by stableMeaningValue.
    // This applies to key/check/FK/index/comment expectations as well as columns.
    if(Object.hasOwn(meaning,'sourcePath'))delete meaning.sourcePath;
    if(meaning.expectation&&typeof meaning.expectation==='object'&&Object.hasOwn(meaning.expectation,'sourcePath'))delete meaning.expectation.sourcePath;
   }
   const rows=output.get(table)??[];rows.push({collection,identity:clone(row.identity) as unknown as Json,meaning,state:row.state,...(row.validation!==undefined?{validation:row.validation}:{}),...(row.validity!==undefined?{validity:row.validity}:{})} as unknown as Json);output.set(table,rows);
  }
 }
 return output;
}
export function deriveInventoryReviewCandidates(input:unknown,verifyHistoricalG10?:import('./inventory-options').HistoricalG10PlanVerifier):InventoryProjection[] {
 const delta=compileG10InventoryDelta(input,verifyHistoricalG10),request:G10ValidatedRequest=validateG10RequestShape(input,verifyHistoricalG10),next=projectG10Bundle(request.next,'next'),previous=request.previous===null?null:projectG10Bundle(request.previous,'previous'),byIntent=new Map<string,TableIntent>(request.options.tableIntents.map(x=>[JSON.stringify([x.kind,x.table]),x]));
 const candidates:InventoryProjection[]=[];
 for(const change of delta.changes){
  const kind=change.kind==='create-table'?'create':'remove',selected=byIntent.get(JSON.stringify([kind,change.table]));if(!selected||selected.kind!==kind)throw new Error('G10_REVIEW_INTENT_MISSING:'+change.table);
  const intent:Json=kind==='create'?{kind,table:selected.table,record:toJson(selected.record)}:{kind,table:selected.table,record:toJson(selected.record),disposition:{mode:'irreversible-purge'}};
  const effects=kind==='create'?['new-physical-binding']:['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'];
  const before=previous?.reviews.find(row=>row.table===change.table),after=next.reviews.find(row=>row.table===change.table);
  if(kind==='remove'){
   if(!before)throw new Error('G10_REVIEW_PREVIOUS_MEANING_MISSING:'+change.table);
   candidates.push({...before,intent:clone(intent),effects:[...effects]});
   const absent:InventoryProjection={profile:'umf.table-inventory-review/0.1',side:'next',source:{format:'json',sha256:next.bundle.sourceDigest},configuration:toJson(next.bundle.configuration,'/next/configuration'),table:change.table,record:clone(change.record),meaning:null,intent:clone(intent),effects:[...effects]};candidates.push(absent);
  }else{
   if(previous){const absent:InventoryProjection={profile:'umf.table-inventory-review/0.1',side:'previous',source:{format:'json',sha256:previous.bundle.sourceDigest},configuration:toJson(previous.bundle.configuration,'/previous/configuration'),table:change.table,record:clone(change.record),meaning:null,intent:clone(intent),effects:[...effects]};candidates.push(absent);}
   if(!after)throw new Error('G10_REVIEW_NEXT_MEANING_MISSING:'+change.table);
   candidates.push({...after,intent:clone(intent),effects:[...effects]});
  }
 }
 return candidates;
}
export function removePrefixSubject(before:CatalogProjection,target:Identity):CatalogProjection {
 const c=clone(before),key=ik(target),collections:[string,Subject[]][]=[['tables',c.catalog.tables],['columns',c.catalog.columns],['keys',c.catalog.keys],['checks',c.catalog.checks],['foreignKeys',c.catalog.foreignKeys],['indexes',c.catalog.indexes],['policies',c.catalog.policies],['grants',c.catalog.grants],['comments',c.catalog.comments],['operations',c.operations]],matches=collections.flatMap(([name,items])=>items.map(item=>({name,items,item}))).filter(x=>ik(x.item.identity)===key);
 if(matches.length!==1||matches[0]!.item.state!=='present')throw new Error('G10_PREFIX_SUBJECT_NOT_UNIQUELY_PRESENT');
 if(c.dependencies.some(edge=>edge.state==='present'&&edge.to===key&&edge.from!==key))throw new Error('G10_PREFIX_DEPENDENCIES_REMAIN');
 matches[0]!.item.state='absent';c.dependencies=c.dependencies.map(edge=>edge.from===key?{...edge,state:'absent'}:edge);return c;
}
export function setPrefixConstraintValidation(before:CatalogProjection,target:Identity,state:'not-validated'|'validated'):CatalogProjection {
 const c=clone(before),matches=[...c.catalog.checks,...c.catalog.foreignKeys].filter(item=>ik(item.identity)===ik(target));
 if(matches.length!==1||matches[0]!.state!=='present')throw new Error('G10_PREFIX_CONSTRAINT_NOT_UNIQUELY_PRESENT');
 matches[0]!.validation=state;return c;
}
export function setPrefixIndexValidity(before:CatalogProjection,target:Identity,state:'pending'|'valid'|'invalid'):CatalogProjection {
 const c=clone(before),matches=c.catalog.indexes.filter(item=>ik(item.identity)===ik(target));
 if(matches.length!==1||matches[0]!.state!=='present')throw new Error('G10_PREFIX_INDEX_NOT_UNIQUELY_PRESENT');
 matches[0]!.validity=state;return c;
}

const clone=<T>(value:T):T=>structuredClone(value);
const ptr=(value:string)=>value.replace(/~/g,'~0').replace(/\//g,'~1');
const toJson=(value:unknown,path='/'):Json=>{
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map((child,index)=>toJson(child,`${path}/${index}`));
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){const result:{[key:string]:Json}={};for(const [key,child]of Object.entries(value))Object.defineProperty(result,key,{value:toJson(child,`${path}/${ptr(key)}`),enumerable:true,writable:true,configurable:true});return result;}
 throw new Error('G10_NON_JSON_VALUE:'+path);
};
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const reviewFail=(code:string,path:string):never=>{throw new UmfError(code,'The inventory review request is invalid or not supported by this source profile.',path);};
const markerKeys=['id','kind','path','oldDigest','newDigest'] as const;
const effectsCreate=['new-physical-binding'] as const;
const effectsRemove=['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'] as const;
const asJson=(value:unknown):import('../model/types').Json=>value as import('../model/types').Json;

function tableDeclarationPath(bundle:TableDeploymentBundle,tableId:string):string{
 const document=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=document.modules.findIndex(module=>module.id===bundle.module),module=document.modules[moduleIndex];
 const payload=module?.extensions?.['umf.tables'];
 if(!module||!payload||typeof payload!=='object'||Array.isArray(payload))reviewFail('TABLE_MIGRATION_REVIEW','/next/source');
 const tables=(payload as {tables?:unknown}).tables;
 if(!Array.isArray(tables))return reviewFail('TABLE_MIGRATION_REVIEW','/next/source');
 const index=(tables as unknown[]).findIndex(value=>!!value&&typeof value==='object'&&(value as {id?:unknown}).id===tableId);
 if(index<0)reviewFail('TABLE_MIGRATION_REVIEW','/next/source');
 return `/modules/${moduleIndex}/extensions/umf.tables/tables/${index}`;
}
function tableIntentValue(intent:TableInventoryDiscoveryIntent):TableInventoryDiscoveryIntent{
 return intent.kind==='create'?{kind:'create',table:intent.table,record:{...intent.record}}:{kind:'remove',table:intent.table,record:{...intent.record},disposition:{mode:'irreversible-purge'}};
}
function sideValue(row:InventoryProjection,intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:row.side,source:{format:'json',sha256:row.source.sha256},configuration:row.configuration,table:row.table,record:{...row.record},meaning:row.meaning,intent:tableIntentValue(intent),effects:[...effects] as TableInventoryTableReviewEffects};
}
function candidate(kind:TableInventoryReviewedChangeKind,path:string,oldValue:import('../model/types').Json|null,newValue:import('../model/types').Json|null,oldPath?:string|null,newPath?:string|null):TableInventoryReviewedChangeCandidate{
 const oldDigest=hashCanonical(oldValue),newDigest=hashCanonical(newValue),id='review-'+hashCanonical([kind,path,oldDigest,newDigest]).slice(0,24);
 return {id,kind,path,oldDigest,newDigest,oldValue,newValue,...(oldPath!==undefined?{oldPath}:{}),...(newPath!==undefined?{newPath}:{})} as unknown as TableInventoryReviewedChangeCandidate;
}
function legacyCandidates(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,accept:(candidate:TableInventoryReviewedChangeCandidate)=>void,maxCandidates:number,maxBytes:number,alreadyVerified=false,accounting?:AccountingContext):void{
 if(previous===null)return;
 try{
  if(accounting){hashCanonicalCharged(previous,accounting,'/previous/legacy-review-source');hashCanonicalCharged(next,accounting,'/next/legacy-review-source');}
  consumeTableMigrationChangesBounded(alreadyVerified?previous:verifyTableDeployment(previous),alreadyVerified?next:verifyTableDeployment(next),{version:'umf.table-migration-discovery/0.3'},maxCandidates,maxBytes,item=>{
   accounting?.visit('g10-review-legacy-candidate','/review',1);
   const candidate={id:item.id,kind:item.kind,path:item.path,oldDigest:item.oldDigest,newDigest:item.newDigest,oldValue:asJson(item.oldValue),newValue:asJson(item.newValue),...(item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
   accept(candidate);
  });
 }
 catch(error){if(error instanceof UmfError&&error.code==='TABLE_MIGRATION_REVIEW')throw error;reviewFail('TABLE_MIGRATION_REVIEW','/previous');}
}
/** Build the independent, marker-free table inventory review from complete original sources. */
type PreparedReviewInputs={history:TableInventorySourceHistory;before:ReturnType<typeof projectG10Bundle>|null;after:ReturnType<typeof projectG10Bundle>;seedLineage:ReturnType<typeof deriveInventorySeedLineage>};
function discoverInventoryReviewCandidatesCore(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory,verifier:ReturnType<typeof createHistoricalG10Verifier>,prepared?:PreparedReviewInputs,accounting?:AccountingContext):TableInventoryReviewedChangeCandidate[]{
 const selectorKeys=['version','tableIntents','conversions','retiredSeedSets','retirements','restorations','archiveSources'];
 if(!exact(selector,selectorKeys)||selector.version!=='umf.table-inventory-discovery/0.1')reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 if(previous&&previous.source.format!=='json'||next.source.format!=='json')reviewFail('TABLE_MIGRATION_REVIEW','/source/format');
 if(!Array.isArray(selector.tableIntents)||!Array.isArray(selector.conversions)||!Array.isArray(selector.retiredSeedSets)||!Array.isArray(selector.retirements)||!Array.isArray(selector.restorations)||!Array.isArray(selector.archiveSources))reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 validateDiscoveryBounds(selector);
 if(selector.conversions.length||selector.retirements.length||selector.restorations.length||selector.archiveSources.length)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 const history=prepared?.history??validateTableInventorySourceHistory(originalHistory,previous,verifier,accounting);
 const before=prepared?prepared.before:previous===null?null:projectG10Bundle(verifyTableDeployment(previous),'previous'),after=prepared?.after??projectG10Bundle(verifyTableDeployment(next),'next');
 const oldTables=new Map((before?.tables??[]).map(table=>[table.table,table])),newTables=new Map(after.tables.map(table=>[table.table,table]));
 const intentByIdentity=new Map<string,{intent:TableInventoryDiscoveryIntent;index:number}>();
 selector.tableIntents.forEach((intent,index)=>{
  if(!intent||typeof intent!=='object'||!['create','remove'].includes(intent.kind)||typeof intent.table!=='string'||!intent.table||!exact(intent.record,['module','element'])||typeof intent.record.module!=='string'||typeof intent.record.element!=='string')reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  if(intent.kind==='create'&&!exact(intent,['kind','table','record'])||intent.kind==='remove'&&!exact(intent,['kind','table','record','disposition']))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  const key=JSON.stringify([intent.kind,intent.table]);if(intentByIdentity.has(key))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  if(intent.kind==='remove'&&(!exact(intent.disposition,['mode'])||intent.disposition.mode!=='irreversible-purge'))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}/disposition`);
  const copy:TableInventoryDiscoveryIntent=intent.kind==='create'
   ?{kind:'create',table:intent.table,record:{module:intent.record.module,element:intent.record.element}}
   :{kind:'remove',table:intent.table,record:{module:intent.record.module,element:intent.record.element},disposition:{mode:'irreversible-purge'}};
  intentByIdentity.set(key,{intent:copy,index});
 });
 const result:TableInventoryReviewedChangeCandidate[]=[];let retainedCandidateBytes=0;
 const candidateIndex=new Map<string,number>();
 const appendCandidate=(item:TableInventoryReviewedChangeCandidate):void=>{
  accounting?.retainSubject(item.id,`/review/${item.path}`);
  const at=candidateIndex.get(item.id);
  if(at!==undefined){
   const prior=result[at]!;
   const previousComparison=[prior.kind,prior.path,prior.oldDigest,prior.newDigest,prior.oldValue,prior.newValue],nextComparison=[item.kind,item.path,item.oldDigest,item.newDigest,item.oldValue,item.newValue];if((accounting?canonicalCharged(previousComparison,accounting,`/review/${item.path}/prior`):canonical(previousComparison))!==(accounting?canonicalCharged(nextComparison,accounting,`/review/${item.path}/candidate`):canonical(nextComparison)))reviewFail('TABLE_MIGRATION_REVIEW',item.path);
   for(const key of ['oldPath','newPath'] as const)if(prior[key]!==undefined&&item[key]!==undefined&&prior[key]!==item[key])reviewFail('TABLE_MIGRATION_REVIEW',item.path);
   const merged={...prior,...(prior.oldPath===undefined&&item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(prior.newPath===undefined&&item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
  let nextBytes=0,priorBytes=0;try{nextBytes=new TextEncoder().encode(accounting?canonicalCharged(merged,accounting,`/review/${item.path}/merged`):canonical(merged)).byteLength;priorBytes=new TextEncoder().encode(accounting?canonicalCharged(prior,accounting,`/review/${item.path}/retained`):canonical(prior)).byteLength;}catch{reviewFail('TABLE_MIGRATION_REVIEW','/selector');}
   if(retainedCandidateBytes-priorBytes+nextBytes>25165824)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
   retainedCandidateBytes+=nextBytes-priorBytes;result[at]=merged;return;
  }
  if(result.length>=2048)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
  let bytes=0;try{bytes=new TextEncoder().encode(accounting?canonicalCharged(item,accounting,`/review/${item.path}`):canonical(item)).byteLength;}catch{reviewFail('TABLE_MIGRATION_REVIEW','/selector');}
  if(bytes>25165824||retainedCandidateBytes+bytes>25165824)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
  candidateIndex.set(item.id,result.length);retainedCandidateBytes+=bytes;result.push(item);
 };
 legacyCandidates(previous,next,appendCandidate,2048-result.length,25165824-retainedCandidateBytes,prepared!==undefined,accounting);
 for(const {intent,index} of intentByIdentity.values()){
  accounting?.visit('g10-review-intent-coverage',`/selector/tableIntents/${index}`);
  const old=oldTables.get(intent.table),fresh=newTables.get(intent.table);
  const prior=old!==undefined,post=fresh!==undefined;
  if(intent.kind==='create'){
   if(prior||!post||JSON.stringify(intent.record)!==JSON.stringify(fresh!.record))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const value=sideValue(after.reviews.find(row=>row.table===intent.table)!,intent,effectsCreate);
   const path=tableDeclarationPath(after.bundle,intent.table);
   appendCandidate(candidate('create-table',path,previous===null?null:asJson(absentTableReview(before!,intent,effectsCreate)),asJson(value),null,path));
  }else{
   if(!prior||post||JSON.stringify(intent.record)!==JSON.stringify(old!.record))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const sourceRow=before!.reviews.find(row=>row.table===intent.table);if(!sourceRow)reviewFail('TABLE_MIGRATION_REVIEW','/previous/source');
   const oldValue=sideValue(sourceRow!,intent,effectsRemove),newValue=absentFromNext(after,intent,effectsRemove),oldPath=tableDeclarationPath(before!.bundle,intent.table),tablePath=`/options/tableIntents/${index}/disposition`;
   appendCandidate(candidate('remove-table',oldPath,asJson(oldValue),asJson(newValue),oldPath,null));
   appendCandidate(candidate('table-removal-effects',tablePath,asJson(oldValue),asJson(newValue),oldPath,null));
  }
 }
 const expectedChanges=[...(before?.tables??[]).filter(item=>!newTables.has(item.table)).map(item=>['remove',item.table] as const),...after.tables.filter(item=>!oldTables.has(item.table)).map(item=>['create',item.table] as const)];
 for(const [kind,table] of expectedChanges)if(!intentByIdentity.has(JSON.stringify([kind,table])))reviewFail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 const seedLineage=prepared?.seedLineage??deriveInventorySeedLineage(history as unknown as InventoryHistory,{previous,next,options:{seedSets:[],retiredSeedSets:[...selector.retiredSeedSets]}},verifier,accounting);
 for(const [index,id] of selector.retiredSeedSets.entries()){
  accounting?.charge('historyMember',1,`/selector/retiredSeedSets/${index}`);
  const lineage=seedLineage.find(entry=>entry.id===id);
  const priorSeed=previous?.seedSets.find(seed=>seed.id===id);
  const nextSeed=next.seedSets.find(seed=>seed.id===id);
  if(!lineage||lineage.disposition!=='retire-definition'||!priorSeed||nextSeed)reviewFail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  let original:{definition:import('../model/types').Json;sourceDigest:string}|undefined;
  for(const plan of originalHistory.plans){
   const sourcePlan=plan as unknown as {next:TableDeploymentBundle};
   const definition=sourcePlan.next?.seedSets?.find(seed=>seed.id===id);
   if(definition){original={definition:asJson(definition),sourceDigest:sourcePlan.next.sourceDigest};break;}
  }
  if(!original||hashCanonical(original.definition)!==lineage!.definitionDigest||original.sourceDigest!==lineage!.originalSourceDigest)reviewFail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  const originalValue=original!,lineageValue=lineage!,previousBundle=previous!;
  const oldReview:TableInventorySeedReview={profile:'umf.table-inventory-seed-retirement-review/0.1',side:'previous',source:{format:'json',sha256:previousBundle.sourceDigest},configuration:asJson(previousBundle.configuration),id,definition:originalValue.definition,definitionDigest:lineageValue.definitionDigest,originalSourceDigest:lineageValue.originalSourceDigest,execution:lineageValue.execution,retired:false,effects:[]};
  const newReview:TableInventorySeedReview={...oldReview,side:'next',source:{format:'json',sha256:next.sourceDigest},configuration:asJson(next.configuration),retired:true,effects:['original-definition-and-execution-retained-in-history','no-data-replay']};
  const path=`/options/retiredSeedSets/${index}`;const oldPath=seedDefinitionPath(previousBundle,id);
  appendCandidate(candidate('retire-seed-history',path,asJson(oldReview),asJson(newReview),oldPath,null));
 }
 if(result.length>2048)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 return result;
}
export function discoverInventoryReviewCandidatesWithVerifier(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory,verifier:ReturnType<typeof createHistoricalG10Verifier>):TableInventoryReviewedChangeCandidate[]{
 return discoverInventoryReviewCandidatesCore(previous,next,selector,originalHistory,verifier);
}

function validateDiscoveryBounds(selector:TableInventoryDiscoverySelector):void{
 const enc=new TextEncoder(),bytes=(value:string)=>enc.encode(value).length;
 const bounded=(value:unknown,path:string,max=256):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&bytes(value)<=max&&!value.includes('\0');
 if(selector.tableIntents.length>512)reviewFail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 if(selector.conversions.length>256)reviewFail('TABLE_MIGRATION_REVIEW','/selector/conversions');
 if(selector.retiredSeedSets.length>256)reviewFail('TABLE_MIGRATION_REVIEW','/selector/retiredSeedSets');
 if(selector.retirements.length>256)reviewFail('TABLE_MIGRATION_REVIEW','/selector/retirements');
 if(selector.restorations.length>256)reviewFail('TABLE_MIGRATION_REVIEW','/selector/restorations');
 if(selector.archiveSources.length>64)reviewFail('TABLE_MIGRATION_REVIEW','/selector/archiveSources');
 // These source families are intentionally not admitted by this compiler
 // slice. Reject them before canonicalizing or walking caller-controlled nested
 // values; a bounded count is not permission to retain unsupported payloads.
 if(selector.conversions.length||selector.retirements.length||selector.restorations.length||selector.archiveSources.length)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 let creates=0,removes=0;
 for(const [index,intent] of selector.tableIntents.entries()){
  const path=`/selector/tableIntents/${index}`;
  if(!intent||typeof intent!=='object'||(intent.kind!=='create'&&intent.kind!=='remove'))reviewFail('TABLE_MIGRATION_REVIEW',path);
  if(intent.kind==='create'){if(!exact(intent,['kind','table','record']))reviewFail('TABLE_MIGRATION_REVIEW',path);creates++;}
  else{if(!exact(intent,['kind','table','record','disposition']))reviewFail('TABLE_MIGRATION_REVIEW',path);removes++;if(!exact(intent.disposition,['mode'])||intent.disposition.mode!=='irreversible-purge')reviewFail('TABLE_MIGRATION_REVIEW',path+'/disposition');}
  if(!bounded(intent.table,path+'/table')||!exact(intent.record,['module','element'])||!bounded(intent.record.module,path+'/record/module')||!bounded(intent.record.element,path+'/record/element'))reviewFail('TABLE_MIGRATION_REVIEW',path);
 }
 if(creates>256||removes>256)reviewFail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 const retiredIds=new Set<string>();
 for(const [index,id] of selector.retiredSeedSets.entries()){
  if(!bounded(id,`/selector/retiredSeedSets/${index}`)||retiredIds.has(id))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  retiredIds.add(id);
 }
 let archiveBytes=0;
 for(const [index,archive] of selector.archiveSources.entries()){
  const data=archive?.source?.utf8;
  if(typeof data!=='string')reviewFail('TABLE_MIGRATION_REVIEW',`/selector/archiveSources/${index}`);
  const size=bytes(data);if(size>1048576)reviewFail('TABLE_MIGRATION_REVIEW',`/selector/archiveSources/${index}/source/utf8`);archiveBytes+=size;
 }
 if(archiveBytes>4194304)reviewFail('TABLE_MIGRATION_REVIEW','/selector/archiveSources');
 try{if(bytes(canonical(selector))>6291456)reviewFail('TABLE_MIGRATION_REVIEW','/selector');}catch(error){if(error instanceof UmfError)throw error;reviewFail('TABLE_MIGRATION_REVIEW','/selector');}
}
export function discoverInventoryReviewCandidates(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory):TableInventoryReviewedChangeCandidate[]{
 return discoverInventoryReviewCandidatesWithVerifier(previous,next,selector,originalHistory,createHistoricalG10Verifier());
}
function absentTableReview(source:{bundle:TableDeploymentBundle;reviews:InventoryProjection[]},intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:'previous',source:{format:'json',sha256:source.bundle.sourceDigest},configuration:asJson(source.bundle.configuration),table:intent.table,record:{...intent.record},meaning:null,intent:tableIntentValue(intent),effects:[...effects]};
}
function absentFromNext(source:{bundle:TableDeploymentBundle;reviews:InventoryProjection[]},intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:'next',source:{format:'json',sha256:source.bundle.sourceDigest},configuration:asJson(source.bundle.configuration),table:intent.table,record:{...intent.record},meaning:null,intent:tableIntentValue(intent),effects:[...effects]};
}
function seedDefinitionPath(bundle:TableDeploymentBundle,id:string):string{
 const document=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=document.modules.findIndex(module=>module.id===bundle.module),module=document.modules[moduleIndex],payload=module?.extensions?.['umf.tables'] as {seedSets?:{id:string}[]}|undefined,index=payload?.seedSets?.findIndex(seed=>seed.id===id)??-1;
 if(index<0)reviewFail('TABLE_MIGRATION_REVIEW','/previous/source');
 return `/modules/${moduleIndex}/extensions/umf.tables/seedSets/${index}`;
}
export function inventoryMarker(candidate:TableInventoryReviewedChangeCandidate):TableInventoryMigrationMarker{
 return {id:candidate.id,kind:candidate.kind,path:candidate.path,oldDigest:candidate.oldDigest,newDigest:candidate.newDigest};
}
export function irreversiblePurgeDisclosure(candidate:TableInventoryReviewedChangeCandidate):{code:'IRREVERSIBLE_TABLE_PURGE';path:string;markerId:string;message:string}{
 if(candidate.kind!=='table-removal-effects')reviewFail('TABLE_MIGRATION_REVIEW',candidate.path);
 const old=candidate.oldValue,newReview=candidate.newValue;
 if(!isTableReview(old)||!isTableReview(newReview))reviewFail('TABLE_MIGRATION_REVIEW',candidate.path);
 if(old.profile!=='umf.table-inventory-review/0.1'||old.side!=='previous'||typeof old.table!=='string'||!old.table||newReview.profile!=='umf.table-inventory-review/0.1'||newReview.side!=='next'||newReview.table!==old.table||old.meaning===null||newReview.meaning!==null||canonical(old.effects)!==canonical(effectsRemove)||canonical(newReview.effects)!==canonical(effectsRemove)||!/^\/options\/tableIntents\/\d+\/disposition$/.test(candidate.path)||typeof candidate.oldPath!=='string'||candidate.newPath!==null||candidate.oldDigest!==hashCanonical(old)||candidate.newDigest!==hashCanonical(newReview)||candidate.id!=='review-'+hashCanonical([candidate.kind,candidate.path,candidate.oldDigest,candidate.newDigest]).slice(0,24))reviewFail('TABLE_MIGRATION_REVIEW',candidate.path);
 return {code:'IRREVERSIBLE_TABLE_PURGE',path:candidate.path,markerId:candidate.id,message:'Irreversible purge of all stored rows and columns for table '+old.table+'. Metadata history is not a data backup; this profile performs immediate physical deletion.'};
}

type PreparedInventoryCompilation={request:G10ValidatedRequest;inventory:InventoryDelta;next:ReturnType<typeof projectG10Bundle>;previous:ReturnType<typeof projectG10Bundle>|null;lineage:ReturnType<typeof deriveInventorySeedLineage>;review:TableInventoryReviewedChangeCandidate[];stableRequest:TableInventoryMigrationRequest};
function quotedJsonBytes(value:string):number{
 let bytes=2;
 for(let i=0;i<value.length;i++){
  const unit=value.charCodeAt(i);
  if(unit===0x22||unit===0x5c||unit===0x08||unit===0x09||unit===0x0a||unit===0x0c||unit===0x0d){bytes+=2;continue;}
  if(unit<0x20){bytes+=6;continue;}
  if(unit>=0xd800&&unit<=0xdbff){const low=value.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))throw new UmfError('NON_JSON','Inventory request contains invalid Unicode.');bytes+=4;continue;}
  if(unit>=0xdc00&&unit<=0xdfff)throw new UmfError('NON_JSON','Inventory request contains invalid Unicode.');
  bytes+=unit<0x80?1:unit<0x800?2:3;
 }
 return bytes;
}
function ownCanonicalComponent(input:unknown,path:string,maxBytes:number,accounting?:AccountingContext):Json{
 type PathRef={parent:PathRef|null;segment:string};
 type Frame={source:object;target:Json[]|Record<string,Json>;keys:string[]|null;index:number;array:boolean;path:PathRef};
 type Task={kind:'value';value:unknown;path:PathRef;assign:(value:Json)=>void}|{kind:'resume';frame:Frame};
 const rootPath:PathRef={parent:null,segment:path};
 const childPath=(parent:PathRef,segment:string):PathRef=>({parent,segment});
 const displayPath=(ref:PathRef):string=>{const parts:string[]=[];let current:PathRef|null=ref;while(current?.parent){parts.push(pointer(current.segment));current=current.parent;}return (current?.segment??path)+parts.reverse().map(part=>`/${part}`).join('');};
 let bytes=0;const active=new Set<object>(),root:Json[]=[null];
 const add=(amount:number,at:PathRef):void=>{bytes+=amount;if(bytes>maxBytes)throw new UmfError('LIMIT','Inventory request component exceeds its existing byte bound.',displayPath(at));};
 const countString=(value:string,at:PathRef):void=>add(quotedJsonBytes(value),at);
 const tasks:Task[]=[{kind:'value',value:input,path:rootPath,assign:value=>{root[0]=value;}}];
 while(tasks.length){
  const task=tasks.pop()!;
  accounting?.visit('inventory-component-copy-task',path);
  if(task.kind==='resume'){
   const frame=task.frame,count=frame.array?(frame.source as unknown[]).length:frame.keys!.length;
   if(frame.index>=count){active.delete(frame.source);continue;}
   const key=frame.array?frame.index++:frame.keys![frame.index++]!,property=String(key),descriptor=Object.getOwnPropertyDescriptor(frame.source,property);accounting?.visit(frame.array?'inventory-component-array-slot':'inventory-component-object-key',displayPath(frame.path));if(!frame.array)accounting?.scanUtf8(property,displayPath(frame.path));
   if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw new UmfError('NON_JSON','Inventory request contains hidden fields or accessors.',displayPath(childPath(frame.path,property)));
   tasks.push(task);
   tasks.push({kind:'value',value:descriptor.value,path:childPath(frame.path,property),assign:item=>{if(frame.array)(frame.target as Json[])[key as number]=item;else Object.defineProperty(frame.target,property,{value:item,enumerable:true,writable:true,configurable:true});}});
   continue;
  }
  const {value, path:at, assign}=task;
  if(value===null){add(4,at);assign(null);continue;}
  if(typeof value==='boolean'){add(value?4:5,at);assign(value);continue;}
  if(typeof value==='string'){countString(value,at);accounting?.scanUtf8(value,displayPath(at));assign(value);continue;}
  if(typeof value==='number'){
   if(!Number.isFinite(value))throw new UmfError('NUMBER','Inventory request contains a non-finite number.',displayPath(at));
   add(JSON.stringify(value).length,at);assign(value);continue;
  }
  if(typeof value!=='object')throw new UmfError('NON_JSON','Inventory request contains a non-JSON value.',displayPath(at));
  if(active.has(value))throw new UmfError('CYCLE','Inventory request contains a cycle.',displayPath(at));
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);accounting?.visit('inventory-component-container',displayPath(at));
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new UmfError('NON_JSON','Inventory request contains a custom object.',displayPath(at));
  if(Object.getOwnPropertySymbols(value).length)throw new UmfError('NON_JSON','Inventory request contains symbol properties.',displayPath(at));
  if(array&&value.length>maxBytes-bytes-2)throw new UmfError('LIMIT','Inventory request array exceeds its existing byte bound.',displayPath(at));
  const names=Object.getOwnPropertyNames(value);
  if(array){
   if(names.length!==value.length+1||names.some(name=>name!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(name)||Number(name)>=value.length)))throw new UmfError('NON_JSON','Inventory request contains a sparse array or non-index property.',displayPath(at));
   add(2+(value.length?value.length-1:0),at);
  }else{
   if(names.length>Math.floor((maxBytes-bytes)/4))throw new UmfError('LIMIT','Inventory request object exceeds its existing byte bound.',displayPath(at));
   names.sort();add(2+(names.length?names.length-1:0),at);
   for(const key of names){add(quotedJsonBytes(key)+1,childPath(at,key));accounting?.visit('inventory-component-key-preflight',displayPath(at));accounting?.scanUtf8(key,displayPath(at));}
  }
  active.add(value);
  const target:Json[]|Record<string,Json>=array?new Array(value.length):Object.create(null);
  assign(target as Json);
  const frame:Frame={source:value,target,keys:array?null:names,index:0,array,path:at};
  tasks.push({kind:'resume',frame});
 }
 return root[0]!;
}
function ownRequestHistory(input:unknown,accounting?:AccountingContext):Json{
 if(!obj(input)||Object.getOwnPropertySymbols(input).length)throw new ShapeError('/history','history-profile-or-count');
 const keys=Object.getOwnPropertyNames(input),expected=['profile','plans','executions'];
 if(keys.length!==expected.length||expected.some(key=>!keys.includes(key)))throw new ShapeError('/history','history-profile-or-count');
 const profileDescriptor=Object.getOwnPropertyDescriptor(input,'profile'),planDescriptor=Object.getOwnPropertyDescriptor(input,'plans'),executionDescriptor=Object.getOwnPropertyDescriptor(input,'executions');
 if(!profileDescriptor||!profileDescriptor.enumerable||!('value'in profileDescriptor)||profileDescriptor.value!=='umf.table-inventory-source-history/0.1'||!planDescriptor||!planDescriptor.enumerable||!('value'in planDescriptor)||!executionDescriptor||!executionDescriptor.enumerable||!('value'in executionDescriptor)||!Array.isArray(planDescriptor.value)||!Array.isArray(executionDescriptor.value)||planDescriptor.value.length>128||executionDescriptor.value.length!==planDescriptor.value.length)throw new ShapeError('/history','history-profile-or-count');
 let owned:Json;try{owned=ownCanonicalComponent(input,'/history',25_165_824,accounting);}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')throw new ShapeError('/history','history-too-large');throw error;}
 if(!obj(owned))throw new UmfError('LIMIT','Inventory history exceeds its original entry bound.','/history');
 const ownedHistory=owned as Record<string,Json>;
 if(!Array.isArray(ownedHistory.plans)||!Array.isArray(ownedHistory.executions)||ownedHistory.plans.length>128||ownedHistory.executions.length>128)throw new UmfError('LIMIT','Inventory history exceeds its original entry bound.','/history');
 return owned;
}
function preflightOptions(input:unknown):void{
 if(!obj(input)||Object.getOwnPropertySymbols(input).length)throw new ShapeError('/options','options-profile-or-keys');
 const keys=Object.getOwnPropertyNames(input),expected=['version','tableIntents','backfills','defaultChanges','conversions','concurrentIndexes','validations','reviewedChanges','seedSets','retiredSeedSets','retirements','restorations','archiveSources'];
 if(keys.length!==expected.length||expected.some(key=>!keys.includes(key)))throw new ShapeError('/options','options-profile-or-keys');
 const profile=Object.getOwnPropertyDescriptor(input,'version');if(!profile||!profile.enumerable||!('value'in profile)||profile.value!=='umf.table-inventory-migration-options/0.1')throw new ShapeError('/options','options-profile-or-keys');
 const caps:Record<string,number>={tableIntents:512,backfills:256,defaultChanges:256,conversions:256,concurrentIndexes:256,validations:256,reviewedChanges:2048,seedSets:128,retiredSeedSets:256,retirements:256,restorations:256,archiveSources:64};
 for(const [key,maximum] of Object.entries(caps)){
  const descriptor=Object.getOwnPropertyDescriptor(input,key);
  if(!descriptor||!descriptor.enumerable||!('value'in descriptor)||!Array.isArray(descriptor.value))continue;
  if(descriptor.value.length>maximum)throw new ShapeError(`/options/${key}`,'array-bound');
 }
}
function ownPredecessor(input:unknown,previous:unknown):unknown{
 if(previous===null)return input;
 if(!input||typeof input!=='object'||Array.isArray(input)||(Object.getPrototypeOf(input)!==Object.prototype&&Object.getPrototypeOf(input)!==null)||Object.getOwnPropertySymbols(input).length)throw new ShapeError('/predecessor','predecessor-invalid');
 const names=Object.getOwnPropertyNames(input),expected=['id','digest'];
 if(names.length!==expected.length||expected.some(key=>!names.includes(key)))throw new ShapeError('/predecessor','predecessor-invalid');
 const id=Object.getOwnPropertyDescriptor(input,'id'),digest=Object.getOwnPropertyDescriptor(input,'digest');
 if(!id||!id.enumerable||!('value'in id)||!digest||!digest.enumerable||!('value'in digest))throw new ShapeError('/predecessor','predecessor-invalid');
 return {id:id.value,digest:digest.value};
}
function ownRequestJson(input:unknown,accounting?:AccountingContext):TableInventoryMigrationRequest{
 if(!obj(input))throw new ShapeError('/','request-shape-invalid');
 const prototype=Object.getPrototypeOf(input);if(prototype!==Object.prototype&&prototype!==null)throw new ShapeError('/','request-shape-invalid');
 const envelopeKeys=['id','predecessor','previous','next','options','history'],enumerableKeys=Object.keys(input);
 if(enumerableKeys.length!==envelopeKeys.length||envelopeKeys.some(key=>!enumerableKeys.includes(key)))throw new ShapeError('/','request-shape-invalid');
 if(Object.getOwnPropertySymbols(input).length)throw new UmfError('NON_JSON','Inventory request contains symbol properties.');
 const descriptors=Object.getOwnPropertyDescriptors(input);
 if(Object.keys(descriptors).length!==envelopeKeys.length||envelopeKeys.some(key=>!Object.hasOwn(descriptors,key)||!descriptors[key]!.enumerable||!('value'in descriptors[key]!)))throw new UmfError('NON_JSON','Inventory request envelope is not closed.');
 const raw=Object.fromEntries(envelopeKeys.map(key=>[key,descriptors[key]!.value])) as Record<string,unknown>;
 if(typeof raw.id!=='string'||raw.id.length===0||raw.id.includes('\0')||new TextEncoder().encode(raw.id).byteLength>128)throw new ShapeError('/','request-shape-invalid');
 preflightOptions(raw.options);
 let options:Json;try{options=ownCanonicalComponent(raw.options,'/options',6_291_456,accounting);}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')throw new ShapeError('/options','options-too-large');throw error;}
 const copyHooks=accounting?{beforeProperty:(key:string,path:string,isArray:boolean)=>{accounting.visit('inventory-bundle-copy-preflight',path);if(!isArray)accounting.scanUtf8(key,path);},retainText:(text:string,path:string)=>{accounting.scanUtf8(text,path);}}:undefined;
 const chargedCopy=<T>(value:T,path:string):T=>accounting?copyJsonCharged(value,count=>accounting.visit('inventory-bundle-copy',path,count),copyHooks) as T:copyJson(value) as T;
 const owned={id:raw.id,predecessor:ownPredecessor(raw.predecessor,raw.previous),previous:raw.previous===null?null:chargedCopy(raw.previous,'/previous'),next:chargedCopy(raw.next,'/next'),options,history:ownRequestHistory(raw.history,accounting)};
 return owned as unknown as TableInventoryMigrationRequest;
}
function prepareInventoryCompilation(input:unknown,verifyHistoricalG10:HistoricalG10PlanVerifier,accounting?:AccountingContext):PreparedInventoryCompilation{
 const owned=ownRequestJson(input,accounting),request:G10ValidatedRequest=validateG10RequestShape(owned,verifyHistoricalG10,accounting);
 const stableRequest:TableInventoryMigrationRequest={id:request.id,predecessor:request.predecessor,previous:request.previous,next:request.next,options:owned.options,history:request.history};
 accounting?.visit('g10-preparation-project-next','/next');const next=projectG10BundleScoped(request.next,'next',accounting,verifyHistoricalG10).result,accountingPrevious=request.previous===null?null:projectG10BundleScoped(request.previous,'previous',accounting,verifyHistoricalG10).result;
 const previous=accountingPrevious;
 const lineage=deriveInventorySeedLineage(request.history,{previous:request.previous,next:request.next,options:{seedSets:request.options.seedSets,retiredSeedSets:request.options.retiredSeedSets}},verifyHistoricalG10,accounting),inventory=compileG10InventoryDeltaFromPrepared(request,next,previous,lineage,accounting),review=exactReviewFromPrepared(stableRequest,verifyHistoricalG10,{history:request.history,before:previous,after:next,seedLineage:lineage},accounting);
 return {request,inventory,next,previous,lineage,review,stableRequest};
}
function compileG10InventoryPlanInternal(input:unknown,verifyHistoricalG10:HistoricalG10PlanVerifier,accounting?:AccountingContext):Record<string,Json>{
 return compileInventoryPlanFromPrepared(prepareInventoryCompilation(input,verifyHistoricalG10,accounting),accounting);
}
function compileInventoryPlanFromPrepared(prepared:PreparedInventoryCompilation,accounting?:AccountingContext):Record<string,Json>{
 const {request,inventory,next,previous,lineage,review}=prepared;
 for(const change of inventory.changes){accounting?.visit('r2-create-change-admission','/inventory/changes');if(change.kind!=='create-table')fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');}
 const selected=request.options.tableIntents;for(const intent of selected){accounting?.visit('r2-create-intent-admission','/options/tableIntents');if(intent.kind!=='create')fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');}
 let unsupported:string|undefined;for(const key of ['defaultChanges','conversions','concurrentIndexes','validations','retiredSeedSets','retirements','restorations','archiveSources'] as const){accounting?.visit('r2-composition-gate','/options/'+key);if(request.options[key].length!==0){unsupported=key;break;}}if(unsupported)fail('COMPOSITION_NOT_LOWERED:'+unsupported);
 if(request.options.backfills.length&&request.options.backfills.length!==1)fail('G02_COMPOSITION_SELECTION_NOT_LOWERED');
 accounting?.visit('r2-initial-renderer-effects','/effects',next.projection.rendererOperations.length);const derived=deriveInitialRendererEffectsCore(next.bundle,next.projection,previous?.projection??null,true,accounting);
 let createEffects=0;for(const effect of derived.effects){accounting?.visit('r2-create-effect-coverage','/effects');if(effect.operation==='create-table')createEffects++;}if(inventory.changes.length!==createEffects)fail('CREATE_EFFECT_COVERAGE');
 const dependencies:TypedDependency[]=[...derived.edges];let effects=[...derived.effects];
 if(request.options.backfills.length){
  if(!previous)fail('G02_INITIAL_PLAN_UNSUPPORTED');
  accounting?.visit('g10-g02-marker-partition','/options/reviewedChanges',request.options.reviewedChanges.length);const ownedMarkers=partitionInventoryMarkersForG02(request.options.reviewedChanges as any,previous.bundle,next.bundle,next.tables.map(table=>table.table).filter(table=>!previous!.tables.some(old=>old.table===table)),request.options.backfills[0]!);
  accounting?.visit('g10-g02-effect-lowering','/options/backfills');const lowered=deriveG02FieldEffects(previous.bundle,next.bundle,previous.projection,next.projection,{version:'umf.table-migration-options/0.4',backfills:request.options.backfills,concurrentIndexes:[],reviewedChanges:ownedMarkers,validations:[]} as any,effects.length,accounting);
  effects.push(...lowered.effects);dependencies.push(...lowered.edges);
 }
 if(request.options.seedSets.length){const seedStates=new Map<string,(typeof next.projection.seedStates)[number]>();for(const seed of next.projection.seedStates){accounting?.visit('r2-seed-state-index','/next/seedStates');seedStates.set(seed.id,seed);}for(const selected of request.options.seedSets){accounting?.visit('r2-selected-seed-binding','/options/seedSets');if(!seedStates.has(selected))fail('SEED_SOURCE_BINDING');}
  const subject:InventorySubject={kind:'seed',sets:[...request.options.seedSets]},seedEffect:EffectNode={id:'g10-apply-selected-seeds',kind:'seed',operation:'apply-seeds',subject,sourcePath:'/options/seedSets',sql:'',transaction:'required',recovery:'rollback-transaction',sourceOrder:effects.length+1,atomicGroup:null,transition:{action:'update',collection:'tables',meaning:{}}};
  effects.push(seedEffect);for(const selected of request.options.seedSets){accounting?.visit('r2-selected-seed-publication-search','/publicationObligations',derived.publicationObligations.length);for(const obligation of derived.publicationObligations){accounting?.visit('r2-selected-seed-publication-row',`/publicationObligations/${obligation.ownerId}`);if(obligation.ownerKind==='seed-set'&&obligation.ownerId===selected){dependencies.push({dependent:accounting?hashCanonicalCharged({kind:'seed-set',table:null,subject:selected},accounting,'/options/seedSets/dependent'):hashCanonical({kind:'seed-set',table:null,subject:selected}),prerequisite:accounting?hashCanonicalCharged(obligation.targetIdentity,accounting,'/publicationObligations/target'):hashCanonical(obligation.targetIdentity),sourcePath:obligation.ownerSourcePath,reason:'selected-seed-requires-source-table',state:'present'});}}}
 }
 // The renderer discovers the combined schema grant before compiler-selected
 // seeds are appended. Bind that final grant only after every selected business
 // and seed effect in the complete composition DAG.
 const schemaGrants:EffectNode[]=[];for(const effect of effects){accounting?.visit('r2-schema-grant-effect-scan','/effects');if(effect.subject.kind==='schema-grant')schemaGrants.push(effect);}
 for(const grant of schemaGrants){
  accounting?.visit('r2-schema-grant-dependencies','/effects',effects.length);const dependent=accounting?hashCanonicalCharged(inventoryCatalogIdentity(grant.subject),accounting,'/effects/schema-grant'):hashCanonical(inventoryCatalogIdentity(grant.subject));
  for(const prior of effects){
   if(prior===grant||prior.subject.kind==='metadata')continue;
   accounting?.visit('r2-schema-grant-prior-effect','/effects');dependencies.push({dependent,prerequisite:accounting?hashCanonicalCharged(inventoryCatalogIdentity(prior.subject),accounting,'/effects/prior-subject'):hashCanonical(inventoryCatalogIdentity(prior.subject)),sourcePath:grant.sourcePath,reason:'schema-grant-after-required-effects',state:'present'});
  }
 }
 accounting?.visit('g10-plan-initial-prefix-seeds','/seedLineage',lineage.length);const initialPrefix=initialInventoryPrefix(previous?{catalog:previous.projection.catalog as unknown as Record<string,Json[]>,tables:previous.tables}:null,lineage as unknown as Json[],accounting);
 const history=prepared.stableRequest.history as unknown as Json,historyBinding={profile:'umf.table-inventory-source-history/0.1' as const,count:request.history.plans.length,digest:accounting?hashCanonicalCharged(prepared.stableRequest.history,accounting,'/history'):hashCanonical(prepared.stableRequest.history)};
 const seedExecution=request.options.seedSets.length?{version:'umf.table-seed-execution/0.1' as const,sets:[...request.options.seedSets]}:'none';
 accounting?.visit('g10-provenance-mutation-derivation','/effects',effects.length);const provenanceMutations=deriveG10ProvenanceMutations(previous?.projection??null,next.projection,effects,accounting);
 return compileInventoryPlanCore({id:request.id,predecessor:request.predecessor,previous:request.previous,next:request.next,options:prepared.stableRequest.options as unknown as Json,history,historyBinding,inventory,initialPrefix,nextCatalog:next.projection.catalog as unknown as Record<string,Json[]>,effects,dependencies,publicationObligations:derived.publicationObligations,provenanceMutations,seedExecution,review:review as unknown as Json[]},accounting);
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
 return validateExactReviewCandidates(request,candidates);
}
function exactReviewFromPrepared(request:TableInventoryMigrationRequest,verifier:HistoricalG10PlanVerifier,prepared:PreparedReviewInputs,accounting?:AccountingContext):TableInventoryReviewedChangeCandidate[]{
 if(accounting){hashCanonicalCharged(request.options,accounting,'/options/reviewedChanges');hashCanonicalCharged(prepared.history,accounting,'/history/review');}
 const candidates=discoverInventoryReviewCandidatesCore(request.previous,request.next,discoverySelector(request.options),request.history,verifier,prepared,accounting);
 return validateExactReviewCandidates(request,candidates);
}
function validateExactReviewCandidates(request:TableInventoryMigrationRequest,candidates:TableInventoryReviewedChangeCandidate[]):TableInventoryReviewedChangeCandidate[]{
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
 const body:Record<string,Json>={...plan,review:review as unknown as Json[]};delete body.digest;body.digest=hashCanonical(body);
 if(new TextEncoder().encode(canonical(body)).length>25165824)throw new UmfError('TABLE_INVENTORY_PLAN_SIZE','The complete reviewed inventory plan exceeds the supported size bound.','/review');
 return body as unknown as TableInventoryMigrationPlan;
}

/** Compile from complete independently verified bundles and their explicit original history. */
export function compileTableInventoryMigration(request:TableInventoryMigrationRequest):TableInventoryMigrationResult{
 const verifier=createHistoricalG10Verifier();try{return withOrdinaryProjectionScope(verifier,()=>{
  const prepared=prepareInventoryCompilation(request,verifier);
  const plan=compileInventoryPlanFromPrepared(prepared);
  return {status:'compiled',plan:withReview(plan,prepared.review),diagnostics:[]};
 });}catch(error){return {status:'blocked',diagnostics:[blockedDiagnostic(error)]};}
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
