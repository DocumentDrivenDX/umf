import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
import {verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {UmfError,pointer} from '../model/errors';
import {copyJson} from '../model/json';
import {initialInventoryPrefix,inventoryCatalogIdentity,scheduleTypedInventoryEffects,type CatalogMutation,type EffectNode,type InventorySubject,type ScheduledInventoryEffects,type TypedDependency} from './inventory-graph';
import type {PrefixFrame} from './inventory-graph';
import {projectG10Bundle,type InventoryProjection,type InventoryChange,type InventoryFieldChange,type InventoryTable,type InventoryDelta,type CatalogProjection,type Identity,type PrefixCatalog} from './inventory-projection';
import {ShapeError,validateG10RequestShape,validateTableInventorySourceHistory,type G10ValidatedRequest,type HistoricalG10PlanVerifier,type TableIntent,type TableInventoryDiscoveryIntent,type TableInventoryReviewedChangeKind,type TableInventoryMigrationMarker} from './inventory-options';
import {deriveInventorySeedLineage,type InventoryHistory} from './inventory-history';
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
const sameRef=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
const ik=(value:Identity)=>hashCanonical(value);
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

type EffectIdentity={kind:string;table:string|null;subject:Json};
type EffectSubject={identity:EffectIdentity;meaning:Json;state:'present'|'absent';validation?:string;validity?:string};
const effectClone=<T>(value:T):T=>structuredClone(value);
const obj=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
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
function deriveInitialRendererEffectsCore(bundle:TableDeploymentBundle,projection:CatalogProjection,previous:CatalogProjection|null=null,prepared=false):{effects:EffectNode[];edges:TypedDependency[];publicationObligations:SourcePublicationObligation[]}{
 const effects:EffectNode[]=[],creationGroup='initial-table-install',existingTables=new Set(previous?.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null)??[]),createdTables=new Set(projection.catalog.tables.map(row=>row.identity.table).filter((x):x is string=>x!==null).filter(table=>!existingTables.has(table))),grantOperation=previous===null?projection.rendererOperations.find(item=>item.operation==='grant-schema-usage'):undefined;
 for(const [sourceOrder,operation] of projection.rendererOperations.entries()){
  if(operation.operation==='grant-schema-usage')continue;
  const operationTable=operation.subject.kind==='schema-grant'?null:'table' in operation.subject?operation.subject.table:null;
  if(operationTable!==null&&!createdTables.has(operationTable))continue;
  if(operationTable===null)throw new Error('G10_RENDERED_SUBJECT_TABLE');
  if(operation.operation==='create-table'){
   if(operation.subject.kind!=='table')throw new Error('G10_RENDERED_CREATE_SUBJECT');
   const tableId=operation.subject.table,tableRecord=operation.subject.record;
   const table=findSubject(projection.catalog,'tables',{kind:'table',table:tableId,subject:tableRecord as unknown as Json});
   const embedded={columns:projection.catalog.columns.filter(row=>row.identity.table===tableId),keys:projection.catalog.keys.filter(row=>row.identity.table===tableId),checks:projection.catalog.checks.filter(row=>row.identity.table===tableId)};
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
  const dependencyKind=collection==='foreignKeys'?'foreignKey':collection==='indexes'?'index':collection==='policies'?'policy':collection==='comments'?'comment':'grant';const effectId=['policy','comment','grant'].includes(dependencyKind)?JSON.stringify(identity.subject):String(identity.subject);const effectSubject:EffectNode['subject']={kind:'dependency',table:identity.table!,dependencyKind,id:effectId,sourcePath:operation.sourcePath,meaningDigest:hashCanonical(subject.meaning)};
  effects.push(node(operation,sourceOrder,creationGroup,effectKind,effectSubject,{action:'add',collection:collection as EffectNode['transition']['collection'],meaning:{catalogMeaning:effectClone(subject.meaning),validation:subject.validation??null,validity:subject.validity??null} as unknown as Json}));
 }
 if(grantOperation){
  if(grantOperation.subject.kind!=='schema-grant'||grantOperation.subject.schema!==bundle.configuration.schema||grantOperation.subject.privilege!=='USAGE'||JSON.stringify(grantOperation.subject.audiences)!==JSON.stringify(['person','batch']))throw new Error('G10_RENDERED_SCHEMA_GRANT_SUBJECT');
  const schemaGrants=projection.catalog.grants.filter(row=>row.identity.table===null&&((row.meaning as any).effect==='grant-schema-usage'));
  if(schemaGrants.length!==2||new Set(schemaGrants.map(row=>(row.meaning as any).role)).size!==2)throw new Error('G10_RENDERED_SCHEMA_GRANT_ROWS');
  effects.push(node(grantOperation,projection.rendererOperations.length,null,'grant',{kind:'schema-grant',schema:grantOperation.subject.schema,audiences:['person','batch'],privilege:'USAGE'},{action:'add',collection:'grants',meaning:{grants:schemaGrants.map(row=>({identity:effectClone(row.identity),meaning:effectClone(row.meaning)}))} as unknown as Json}));
 }
 const partition=partitionRendererDependenciesCore(bundle,projection,prepared),edges:TypedDependency[]=partition.physicalEdges.filter(edge=>{const touchesCreated=(identityDigest:string)=>{for(const table of createdTables){const tableHash=hashCanonical({kind:'table',table,subject:projection.catalog.tables.find(row=>row.identity.table===table)?.identity.subject});if(identityDigest===tableHash)return true;for(const collection of Object.values(projection.catalog))for(const row of collection)if(row.identity.table===table&&hashCanonical(row.identity)===identityDigest)return true;}return false;};return touchesCreated(edge.from)||touchesCreated(edge.to);}).map(edge=>({dependent:edge.from,prerequisite:edge.to,sourcePath:edge.sourcePath,reason:edge.reason,state:edge.state}));
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
const catalogCollectionByKind:Record<string,keyof PrefixCatalog>={table:'tables',column:'columns',key:'keys',check:'checks',foreignKey:'foreignKeys',index:'indexes',policy:'policies',grant:'grants',comment:'comments'};
const sourceOwnerReason=(kind:string,reason:string,targetKind:string):boolean=>kind==='operation'&&((reason==='operation-requires-table'&&targetKind==='table')||(reason==='operation-requires-field'&&targetKind==='column')||(['operation-requires-cursor-key','operation-requires-conflict-key'].includes(reason)&&targetKind==='key'))||kind==='seed-set'&&reason==='seed-set-requires-table'&&targetKind==='table';
const physicalReason=(from:string,to:string,reason:string):boolean=>reason==='foreign-key-requires-target-key'&&from==='foreignKey'&&to==='key'||reason==='policy-requires-related-table'&&from==='policy'&&to==='table'||reason==='policy-requires-relationship-foreign-key'&&from==='policy'&&to==='foreignKey'||reason==='typed-field-reference'&&['check','foreignKey','index','policy','grant','comment'].includes(from)&&to==='column'||reason==='owned-by-table'&&['column','key','check','foreignKey','index','policy','grant','comment'].includes(from)&&to==='table'||reason==='grant-requires-column'&&from==='grant'&&to==='column'||reason==='key-requires-column'&&from==='key'&&to==='column'||reason==='comment-requires-column'&&from==='comment'&&to==='column';
/** Partition the exact complete source graph into renderer dependencies and source-only publication obligations. */
function sameProjection(left:CatalogProjection,right:CatalogProjection):boolean{
 const paths=(value:CatalogProjection)=>[...value.sourcePaths.entries()].sort(([a],[b])=>a.localeCompare(b));
 return canonical({catalog:left.catalog,dependencies:left.dependencies,operations:left.operations,rendererOperations:left.rendererOperations,seedStates:left.seedStates,sourcePaths:paths(left)})===canonical({catalog:right.catalog,dependencies:right.dependencies,operations:right.operations,rendererOperations:right.rendererOperations,seedStates:right.seedStates,sourcePaths:paths(right)});
}
function partitionRendererDependenciesCore(bundle:TableDeploymentBundle,projection:CatalogProjection,prepared=false):ProjectionDependencyPartition{
 if(!prepared&&!sameProjection(projection,projectG10Bundle(bundle,'next').projection))throw new Error('G10_DEPENDENCY_PROJECTION_NOT_SOURCE_DERIVED');
 const catalog=new Map<string,{collection:keyof PrefixCatalog;row:EffectSubject}>(),owners=new Map<string,{row:EffectSubject;path:string}>(),tablePaths=new Map<string,string>();
 for(const collection of Object.keys(catalogCollectionByKind) as (keyof typeof catalogCollectionByKind)[]){
  const target=catalogCollectionByKind[collection];for(const row of projection.catalog[target]){const digest=hashCanonical(row.identity);if(catalog.has(digest))throw new Error('G10_DEPENDENCY_DUPLICATE_CATALOG_IDENTITY');catalog.set(digest,{collection:target,row});if(target==='tables'&&row.identity.table){const path=projection.sourcePaths.get(digest);if(!path)throw new Error('G10_DEPENDENCY_TABLE_PATH');tablePaths.set(row.identity.table,path);}}
 }
 for(const row of projection.operations){const kind=row.identity.kind;if(kind!=='operation'&&kind!=='seed-set')throw new Error('G10_DEPENDENCY_UNKNOWN_SOURCE_OWNER');if(row.identity.table!==null||typeof row.identity.subject!=='string'||!row.identity.subject)throw new Error('G10_DEPENDENCY_SOURCE_OWNER_ID');const digest=hashCanonical(row.identity),path=projection.sourcePaths.get(digest);if(!path||!path.startsWith('/'))throw new Error('G10_DEPENDENCY_SOURCE_OWNER_PATH');if(owners.has(digest))throw new Error('G10_DEPENDENCY_DUPLICATE_SOURCE_OWNER');owners.set(digest,{row,path});}
 const physicalEdges:CatalogProjection['dependencies']=[],publicationObligations:SourcePublicationObligation[]=[];let claimed=0;
 for(const edge of projection.dependencies){
  if(!edge||typeof edge.from!=='string'||typeof edge.to!=='string'||typeof edge.reason!=='string'||typeof edge.sourcePath!=='string'||!edge.sourcePath.startsWith('/')||edge.state!=='present')throw new Error('G10_DEPENDENCY_EDGE_SHAPE');
  const owner=owners.get(edge.from),target=catalog.get(edge.to);if(!target)throw new Error('G10_DEPENDENCY_TARGET_UNBOUND');
  if(owner){const kind=owner.row.identity.kind;if(edge.sourcePath!==owner.path||!sourceOwnerReason(kind,edge.reason,target.row.identity.kind))throw new Error('G10_DEPENDENCY_SOURCE_OWNER_MISMATCH');
   if(kind==='seed-set'){const meaning=owner.row.meaning as any,seedState=projection.seedStates.find(seed=>seed.id===owner.row.identity.subject);if(!meaning||meaning.id!==owner.row.identity.subject||!seedState||seedState.definitionDigest!==hashCanonical(meaning)||seedState.sourcePath!==owner.path||seedState.state!=='not-run')throw new Error('G10_DEPENDENCY_SEED_OWNER_MISMATCH');}
   else {const meaning=owner.row.meaning as any;if(!meaning||!meaning.operation||meaning.operation.id!==owner.row.identity.subject||!obj(meaning.operation.body))throw new Error('G10_DEPENDENCY_OPERATION_OWNER_MISMATCH');}
   publicationObligations.push({ownerKind:kind,ownerId:owner.row.identity.subject as string,ownerSourcePath:owner.path,targetCollection:target.collection,targetIdentity:target.row.identity,sourcePath:edge.sourcePath,reason:edge.reason});claimed++;continue;
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
export function deriveG10ProvenanceMutations(previous:CatalogProjection|null,next:CatalogProjection,effects:readonly EffectNode[]):CatalogMutation[]{
 if(!previous)return [];
 const touched=new Set<string>();
 for(const effect of effects){touched.add(hashCanonical(inventoryCatalogIdentity(effect.subject)));for(const mutation of effect.catalogMutations??[])touched.add(hashCanonical(mutation.identity));}
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
  for(const oldRow of oldRows){if(oldRow.identity.table===null||touched.has(hashCanonical(inventoryCatalogIdentityFromCatalog(oldRow.identity))))continue;const candidates=newRows.filter(row=>canonical(row.identity)===canonical(oldRow.identity));if(candidates.length!==1)continue;const fresh=candidates[0]!,oldSlot=pathSlot(collection,oldRow),newSlot=pathSlot(collection,fresh);if(!oldSlot||!newSlot)continue;const beforePath=oldSlot.container[oldSlot.key],afterPath=newSlot.container[newSlot.key];if(typeof beforePath!=='string'||typeof afterPath!=='string'||beforePath===afterPath)continue;
   const before=rowJson(oldRow),after=rowJson(fresh),beforeMeaning=(before as any).meaning,newMeaning=(after as any).meaning;
   if(['columns','keys','checks','foreignKeys','indexes','comments'].includes(collection)){delete beforeMeaning.expectation.sourcePath;delete newMeaning.expectation.sourcePath;}else{delete beforeMeaning.sourcePath;delete newMeaning.sourcePath;}
   if(canonical(before)!==canonical(after))throw new Error('G10_PROVENANCE_NONPATH_CHANGE:'+collection);
   const mutation:CatalogMutation={collection,action:'replace',identity:effectClone(oldRow.identity) as unknown as Json,before:rowJson(oldRow),after:rowJson(fresh)};out.push(mutation);
  }
 }
 return out;
}

function inventoryCatalogIdentityFromCatalog(value:EffectIdentity):InventorySubject{
 if(value.kind==='table'&&value.table!==null&&obj(value.subject)&&typeof value.subject.module==='string'&&typeof value.subject.element==='string')return {kind:'table',table:value.table,record:{module:value.subject.module,element:value.subject.element}};
 if(value.kind==='column'&&value.table!==null&&obj(value.subject)&&typeof value.subject.module==='string'&&typeof value.subject.element==='string')return {kind:'field',table:value.table,field:{module:value.subject.module,element:value.subject.element}};
 if(value.table!==null){const dependencyKind=value.kind==='foreignKey'?'foreignKey':value.kind==='index'?'index':value.kind==='policy'?'policy':value.kind==='grant'?'grant':value.kind==='check'?'check':value.kind==='key'?'key':value.kind==='comment'?'comment':undefined;if(dependencyKind){const id=['policy','grant','comment'].includes(dependencyKind)?JSON.stringify(value.subject):String(value.subject);return {kind:'dependency',table:value.table,dependencyKind,id,sourcePath:'/',meaningDigest:'0'.repeat(64)};}}
 return {kind:'metadata',profile:'umf.table-inventory-metadata/0.1'};
}

/** Lower only G02 .4 fills on retained carriers; no legacy migration plan is
 * synthesized. The internal constructor verifies exact effects against both
 * complete original bundles and the selected new-table bindings. */
export function deriveG02FieldEffects(previous:TableDeploymentBundle,next:TableDeploymentBundle,previousProjection:CatalogProjection,nextProjection:CatalogProjection,options:TableMigrationOptions,sourceOrder:number):{effects:EffectNode[];edges:TypedDependency[]}{
 const records=compileG02FieldEffects({previous,next,options,createdTables:nextProjection.catalog.tables.map(row=>row.identity.table).filter((table):table is string=>table!==null&&!previousProjection.catalog.tables.some(old=>old.identity.table===table))});
 if(!records.length||records.some(record=>record.field.module!==records[0]!.field.module||record.field.element!==records[0]!.field.element||record.table!==records[0]!.table))throw new Error('G10_G02_TYPED_EFFECT_SHAPE');
 const field=records[0]!.field,table=records[0]!.table,fill=records.find(record=>record.role==='backfill');
 if(!fill?.rowOperationId)throw new Error('G10_G02_EFFECT_BINDING');
 const target=nextProjection.catalog.columns.filter(row=>row.identity.table===table&&canonical(row.identity.subject)===canonical(field));
 const old=previousProjection.catalog.columns.filter(row=>row.identity.table===table&&canonical(row.identity.subject)===canonical(field));
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
  const common={id:`g02-${bindingKey}-${record.role}-${offset}`,kind:'table',subject,sourcePath:record.sourcePath,sql:record.sql,transaction:'required' as const,recovery:'rollback-transaction' as const,sourceOrder:sourceOrder+offset+1,atomicGroup:group};
  if(record.role==='backfill')effects.push({...common,kind:'backfill',operation:'apply-backfill',sql:'',dataBinding:{profile:'umf.table-inventory-backfill/0.1',selectionIndex:0,operationId:record.rowOperationId!,previousSourceDigest:previous.sourceDigest,nextSourceDigest:next.sourceDigest},transition:{action:'update',collection:'columns',meaning:{}}});
  else if(record.role==='add-column'){
   const addEffect:EffectNode={...common,operation:'add-column',transition:{action:'add',collection:'columns',meaning:{catalogMeaning:stagedMeaning('added'),validation:null,validity:null}}};
   if(!oldColumn){const tableRecord=tableBindings[0]!.record,tableIdentity={kind:'table',table,subject:tableRecord as unknown as Json},before=findSubject(previousProjection.catalog,'tables',tableIdentity),after=findSubject(nextProjection.catalog,'tables',tableIdentity),mutation:CatalogMutation={collection:'tables',action:'replace',identity:tableIdentity as unknown as Json,before:{identity:before.identity as unknown as Json,meaning:before.meaning,state:before.state},after:{identity:after.identity as unknown as Json,meaning:after.meaning,state:after.state}};addEffect.catalogMutations=[mutation];}
   effects.push(addEffect);
  }
  else if(record.role==='target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>row.identity.table===table&&row.identity.subject===domainId&&obj(row.meaning)&&canonical(row.meaning.field)===canonical(field));
   if(check.length!==1)throw new Error('G10_G02_TARGET_CHECK_BINDING');
   if(record.operation==='add-not-valid')throw new Error('G10_G02_UNSUPPORTED_DEFERRED_CHECK_VALIDATION');
   effects.push({...common,subject,operation:'target-check',transition:{action:'add',collection:'checks',meaning:{catalogMeaning:effectClone(check[0]!.meaning),validation:check[0]!.validation??null,validity:check[0]!.validity??null}}});
   effectSubjects.push(subject);continue;
  }else if(record.role==='validate-target-check'){
   const domainId=`domain:${field.module}.${field.element}`;
   const check=nextProjection.catalog.checks.filter(row=>row.identity.table===table&&row.identity.subject===domainId&&obj(row.meaning)&&canonical(row.meaning.field)===canonical(field));
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
  for(const columnIdentity of grantColumnIdentities(oldGrant[0]!,priorDeclaration.columns))edges.push({dependent:columnIdentity,prerequisite:revokeIdentity,sourcePath:revoke.sourcePath,reason:'g02-grant-revoke-before-field',state:'present'});
  for(const columnIdentity of grantColumnIdentities(newGrant[0]!,declaration.columns))edges.push({dependent:addIdentity,prerequisite:columnIdentity,sourcePath:add.sourcePath,reason:'g02-grant-add-after-field-group',state:'present'});
 }
 return {effects,edges};
}

export interface InventoryPlanInput {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:Json;history:Json;historyBinding:{profile:'umf.table-inventory-source-history/0.1';count:number;digest:string};inventory:InventoryDelta;initialPrefix:Omit<import('./inventory-graph').PrefixFrame,'digest'>;nextCatalog:Record<string,Json[]>;effects:EffectNode[];dependencies:TypedDependency[];publicationObligations:SourcePublicationObligation[];provenanceMutations:CatalogMutation[];seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};review:Json[];}
function verifySourcePublicationObligations(obligations:readonly SourcePublicationObligation[],schedule:ScheduledInventoryEffects):void{
 const published=schedule.prefixes.at(-1);if(!published||published.metadata.state!=='published')fail('SOURCE_PUBLICATION_PREFIX');
 for(const obligation of obligations){
  if(!obligation||!['operation','seed-set'].includes(obligation.ownerKind)||!obligation.ownerId||!obligation.ownerSourcePath.startsWith('/')||obligation.sourcePath!==obligation.ownerSourcePath||!['operation-requires-table','operation-requires-field','operation-requires-cursor-key','operation-requires-conflict-key','seed-set-requires-table'].includes(obligation.reason))fail('SOURCE_PUBLICATION_OBLIGATION_SHAPE');
  if(obligation.ownerKind==='operation'&&!obligation.reason.startsWith('operation-requires-')||obligation.ownerKind==='seed-set'&&obligation.reason!=='seed-set-requires-table')fail('SOURCE_PUBLICATION_OWNER_REASON');
  const targetKind=obligation.targetIdentity?.kind,targetCollection=targetKind==='table'?'tables':targetKind==='column'?'columns':targetKind==='key'?'keys':undefined;if(!targetCollection||obligation.targetCollection!==targetCollection||obligation.ownerKind==='operation'&&((obligation.reason==='operation-requires-table'&&targetKind!=='table')||(obligation.reason==='operation-requires-field'&&targetKind!=='column')||(['operation-requires-cursor-key','operation-requires-conflict-key'].includes(obligation.reason)&&targetKind!=='key'))||obligation.ownerKind==='seed-set'&&targetKind!=='table')fail('SOURCE_PUBLICATION_TARGET_KIND');
  const rows=published.catalog[obligation.targetCollection];if(!Array.isArray(rows)||rows.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&hashCanonical((row as Record<string,Json>).identity)===hashCanonical(obligation.targetIdentity)&&(row as Record<string,Json>).state==='present').length!==1)fail('SOURCE_PUBLICATION_TARGET_MISSING:'+obligation.ownerKind+':'+obligation.ownerId);
 }
}
/** Construct the closed unpublished G10 plan from already verified source projections and typed renderer effects. */
export function compileInventoryPlan(input:InventoryPlanInput):Record<string,Json>{
 const next=verifyTableDeployment(input.next),previous=input.previous===null?null:verifyTableDeployment(input.previous);if(next.bundleDigest!==input.next.bundleDigest||previous?.bundleDigest!==input.previous?.bundleDigest)fail('BUNDLE_VERIFICATION');
 try{verifySourcePublicationCoverage(next,input.publicationObligations);}catch{fail('SOURCE_PUBLICATION_SOURCE_COVERAGE');}
 return compileInventoryPlanCore(input);
}
function compileInventoryPlanCore(input:InventoryPlanInput):Record<string,Json>{
 const previous=input.previous,next=input.next;
 const sources=input.effects.map(effect=>({...effect})),metadataIds={prepare:'g10-inventory-prepare',approval:'g10-inventory-approval',publication:'g10-inventory-publication'},schedule=scheduleTypedInventoryEffects(input.initialPrefix,sources,input.dependencies,input.nextCatalog,metadataIds,input.provenanceMutations);verifySourcePublicationObligations(input.publicationObligations,schedule);
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
 return compileInventoryPlanFromPrepared(prepareInventoryCompilation(input,createHistoricalG10Verifier()));
}
export function compileG10InventoryDelta(input:unknown,verifyHistoricalG10?:HistoricalG10PlanVerifier):InventoryDelta {
 const request=validateG10RequestShape(input,verifyHistoricalG10),next=projectG10Bundle(request.next,'next'),previous=request.previous===null?null:projectG10Bundle(request.previous,'previous');
 const seedLineage=deriveInventorySeedLineage(request.history,{previous:request.previous,next:request.next,options:{seedSets:request.options.seedSets,retiredSeedSets:request.options.retiredSeedSets}},verifyHistoricalG10);
 return compileG10InventoryDeltaFromPrepared(request,next,previous,seedLineage);
}
function compileG10InventoryDeltaFromPrepared(request:G10ValidatedRequest,next:ReturnType<typeof projectG10Bundle>,previous:ReturnType<typeof projectG10Bundle>|null,seedLineage:ReturnType<typeof deriveInventorySeedLineage>):InventoryDelta {
 const options=request.options;
 const notImplemented:(keyof G10ValidatedRequest['options'])[]=['defaultChanges','conversions','concurrentIndexes','validations','retiredSeedSets'];
 for(const key of notImplemented)if(options[key].length)throw new Error('G10_COMPOSITION_NOT_IMPLEMENTED:/options/'+key);
 const g02Tables=options.tableIntents.filter((intent):intent is Extract<TableIntent,{kind:'create'}>=>intent.kind==='create').map(intent=>intent.table);
 if(options.backfills.length){
  if(!previous||options.backfills.length!==1)throw new Error('G10_G02_SELECTION_CLOSED');
  const ownedMarkers=partitionInventoryMarkersForG02(options.reviewedChanges as any,previous.bundle,next.bundle,g02Tables,options.backfills[0]!);
  compileG02FieldEffects({previous:previous.bundle,next:next.bundle,options:{version:'umf.table-migration-options/0.4',backfills:options.backfills,concurrentIndexes:[],reviewedChanges:ownedMarkers,validations:[]} as unknown as TableMigrationOptions,createdTables:g02Tables});
 }
 if(previous&&hashCanonical(previous.bundle.configuration)!==hashCanonical(next.bundle.configuration))throw new Error('G10_CONFIGURATION_CHANGE_UNSUPPORTED');
 const selected=new Map<string,TableIntent>();for(const [i,intent]of options.tableIntents.entries()){const k=JSON.stringify([intent.kind,intent.table]);if(selected.has(k))throw new Error('G10_INTENT_DUPLICATE:'+i);selected.set(k,intent);}
 const oldMap=new Map((previous?.tables??[]).map(t=>[t.table,t])),newMap=new Map(next.tables.map(t=>[t.table,t])),zero=hashCanonical(null),changes:InventoryChange[]=[],fieldChanges:InventoryFieldChange[]=[];
 for(const old of previous?.tables??[]){const fresh=newMap.get(old.table);if(fresh){if(!sameRef(old.record,fresh.record)||old.schema!==fresh.schema||old.name!==fresh.name)throw new Error('G10_RETAINED_TABLE_BINDING_CHANGED:'+old.table);const oldMeaning=previous!.reviews.find(r=>r.table===old.table)!.meaning,nextMeaning=next.reviews.find(r=>r.table===old.table)!.meaning,g02Selected=options.backfills.length===1&&(options.backfills[0] as any).table===old.table,g02SourceExact=!g02Selected||sameSourceExceptG02AndCreates(previous!.bundle,next.bundle,options,g02Tables);if(!g02SourceExact)throw new Error('G10_G02_SOURCE_DELTA_UNRELATED:'+old.table);if(stableMeaningDigest(oldMeaning)!==stableMeaningDigest(nextMeaning)&&!sameSourceExceptG05SelectedFields(previous!.bundle,next.bundle,options,old.table)&&!g02Selected)throw new Error('G10_RETAINED_SEMANTIC_CHANGE_UNIMPLEMENTED:'+old.table);continue;}const key=JSON.stringify(['remove',old.table]),intent=selected.get(key);if(!intent||!sameRef(intent.record,old.record))throw new Error('G10_REMOVE_INTENT_MISSING:'+old.table);selected.delete(key);changes.push({kind:'remove-table',table:old.table,record:clone(intent.record),beforePath:String((previous!.reviews.find(r=>r.table===old.table)!.meaning as any).physicalTable.path),afterPath:null,beforeMeaningDigest:old.meaningDigest,afterMeaningDigest:zero});}
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
 if(!Array.isArray(tables))reviewFail('TABLE_MIGRATION_REVIEW','/next/source');
 const index=tables.findIndex(value=>!!value&&typeof value==='object'&&(value as {id?:unknown}).id===tableId);
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
function legacyCandidates(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,accept:(candidate:TableInventoryReviewedChangeCandidate)=>void,maxCandidates:number,maxBytes:number,alreadyVerified=false):void{
 if(previous===null)return;
 try{
  consumeTableMigrationChangesBounded(alreadyVerified?previous:verifyTableDeployment(previous),alreadyVerified?next:verifyTableDeployment(next),{version:'umf.table-migration-discovery/0.3'},maxCandidates,maxBytes,item=>{
   const candidate={id:item.id,kind:item.kind,path:item.path,oldDigest:item.oldDigest,newDigest:item.newDigest,oldValue:asJson(item.oldValue),newValue:asJson(item.newValue),...(item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
   accept(candidate);
  });
 }
 catch(error){if(error instanceof UmfError&&error.code==='TABLE_MIGRATION_REVIEW')throw error;reviewFail('TABLE_MIGRATION_REVIEW','/previous');}
}
/** Build the independent, marker-free table inventory review from complete original sources. */
type PreparedReviewInputs={history:TableInventorySourceHistory;before:ReturnType<typeof projectG10Bundle>|null;after:ReturnType<typeof projectG10Bundle>;seedLineage:ReturnType<typeof deriveInventorySeedLineage>};
function discoverInventoryReviewCandidatesCore(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory,verifier:ReturnType<typeof createHistoricalG10Verifier>,prepared?:PreparedReviewInputs):TableInventoryReviewedChangeCandidate[]{
 const selectorKeys=['version','tableIntents','conversions','retiredSeedSets','retirements','restorations','archiveSources'];
 if(!exact(selector,selectorKeys)||selector.version!=='umf.table-inventory-discovery/0.1')reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 if(previous&&previous.source.format!=='json'||next.source.format!=='json')reviewFail('TABLE_MIGRATION_REVIEW','/source/format');
 if(!Array.isArray(selector.tableIntents)||!Array.isArray(selector.conversions)||!Array.isArray(selector.retiredSeedSets)||!Array.isArray(selector.retirements)||!Array.isArray(selector.restorations)||!Array.isArray(selector.archiveSources))reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 validateDiscoveryBounds(selector);
 if(selector.conversions.length||selector.retirements.length||selector.restorations.length||selector.archiveSources.length)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
 const history=prepared?.history??validateTableInventorySourceHistory(originalHistory,previous,verifier);
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
  const at=candidateIndex.get(item.id);
  if(at!==undefined){
   const prior=result[at]!;
   if(canonical([prior.kind,prior.path,prior.oldDigest,prior.newDigest,prior.oldValue,prior.newValue])!==canonical([item.kind,item.path,item.oldDigest,item.newDigest,item.oldValue,item.newValue]))reviewFail('TABLE_MIGRATION_REVIEW',item.path);
   for(const key of ['oldPath','newPath'] as const)if(prior[key]!==undefined&&item[key]!==undefined&&prior[key]!==item[key])reviewFail('TABLE_MIGRATION_REVIEW',item.path);
   const merged={...prior,...(prior.oldPath===undefined&&item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(prior.newPath===undefined&&item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
   let nextBytes:number,priorBytes:number;try{nextBytes=new TextEncoder().encode(canonical(merged)).byteLength;priorBytes=new TextEncoder().encode(canonical(prior)).byteLength;}catch{reviewFail('TABLE_MIGRATION_REVIEW','/selector');}
   if(retainedCandidateBytes-priorBytes+nextBytes>25165824)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
   retainedCandidateBytes+=nextBytes-priorBytes;result[at]=merged;return;
  }
  if(result.length>=2048)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
  let bytes:number;try{bytes=new TextEncoder().encode(canonical(item)).byteLength;}catch{reviewFail('TABLE_MIGRATION_REVIEW','/selector');}
  if(bytes>25165824||retainedCandidateBytes+bytes>25165824)reviewFail('TABLE_MIGRATION_REVIEW','/selector');
  candidateIndex.set(item.id,result.length);retainedCandidateBytes+=bytes;result.push(item);
 };
 legacyCandidates(previous,next,appendCandidate,2048-result.length,25165824-retainedCandidateBytes,prepared!==undefined);
 for(const {intent,index} of intentByIdentity.values()){
  const old=oldTables.get(intent.table),fresh=newTables.get(intent.table);
  const prior=old!==undefined,post=fresh!==undefined;
  if(intent.kind==='create'){
   if(prior||!post||JSON.stringify(intent.record)!==JSON.stringify(fresh.record))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const value=sideValue(after.reviews.find(row=>row.table===intent.table)!,intent,effectsCreate);
   const path=tableDeclarationPath(after.bundle,intent.table);
   appendCandidate(candidate('create-table',path,previous===null?null:asJson(absentTableReview(before!,intent,effectsCreate)),asJson(value),null,path));
  }else{
   if(!prior||post||JSON.stringify(intent.record)!==JSON.stringify(old.record))reviewFail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const sourceRow=before!.reviews.find(row=>row.table===intent.table);if(!sourceRow)reviewFail('TABLE_MIGRATION_REVIEW','/previous/source');
   const oldValue=sideValue(sourceRow,intent,effectsRemove),newValue=absentFromNext(after,intent,effectsRemove),oldPath=tableDeclarationPath(before!.bundle,intent.table),tablePath=`/options/tableIntents/${index}/disposition`;
   appendCandidate(candidate('remove-table',oldPath,asJson(oldValue),asJson(newValue),oldPath,null));
   appendCandidate(candidate('table-removal-effects',tablePath,asJson(oldValue),asJson(newValue),oldPath,null));
  }
 }
 const expectedChanges=[...(before?.tables??[]).filter(item=>!newTables.has(item.table)).map(item=>['remove',item.table] as const),...after.tables.filter(item=>!oldTables.has(item.table)).map(item=>['create',item.table] as const)];
 for(const [kind,table] of expectedChanges)if(!intentByIdentity.has(JSON.stringify([kind,table])))reviewFail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 const seedLineage=prepared?.seedLineage??deriveInventorySeedLineage(history as unknown as InventoryHistory,{previous,next,options:{seedSets:[],retiredSeedSets:[...selector.retiredSeedSets]}},verifier);
 for(const [index,id] of selector.retiredSeedSets.entries()){
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
  if(!original||hashCanonical(original.definition)!==lineage.definitionDigest||original.sourceDigest!==lineage.originalSourceDigest)reviewFail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  const oldReview:TableInventorySeedReview={profile:'umf.table-inventory-seed-retirement-review/0.1',side:'previous',source:{format:'json',sha256:previous.sourceDigest},configuration:asJson(previous.configuration),id,definition:original.definition,definitionDigest:lineage.definitionDigest,originalSourceDigest:lineage.originalSourceDigest,execution:lineage.execution,retired:false,effects:[]};
  const newReview:TableInventorySeedReview={...oldReview,side:'next',source:{format:'json',sha256:next.sourceDigest},configuration:asJson(next.configuration),retired:true,effects:['original-definition-and-execution-retained-in-history','no-data-replay']};
  const path=`/options/retiredSeedSets/${index}`;const oldPath=seedDefinitionPath(previous,id);
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
 const old=candidate.oldValue,newValue=candidate.newValue;
 if(candidate.kind!=='table-removal-effects'||!old||typeof old!=='object'||Array.isArray(old)||old.profile!=='umf.table-inventory-review/0.1'||old.side!=='previous'||typeof old.table!=='string'||!old.table||!newValue||typeof newValue!=='object'||Array.isArray(newValue)||newValue.profile!=='umf.table-inventory-review/0.1'||newValue.side!=='next'||newValue.table!==old.table||old.meaning===null||newValue.meaning!==null||canonical(old.effects)!==canonical(effectsRemove)||canonical(newValue.effects)!==canonical(effectsRemove)||!/^\/options\/tableIntents\/\d+\/disposition$/.test(candidate.path)||typeof candidate.oldPath!=='string'||candidate.newPath!==null||candidate.oldDigest!==hashCanonical(old)||candidate.newDigest!==hashCanonical(newValue)||candidate.id!=='review-'+hashCanonical([candidate.kind,candidate.path,candidate.oldDigest,candidate.newDigest]).slice(0,24))reviewFail('TABLE_MIGRATION_REVIEW',candidate.path);
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
function ownCanonicalComponent(input:unknown,path:string,maxBytes:number):Json{
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
  if(task.kind==='resume'){
   const frame=task.frame,count=frame.array?(frame.source as unknown[]).length:frame.keys!.length;
   if(frame.index>=count){active.delete(frame.source);continue;}
   const key=frame.array?frame.index++:frame.keys![frame.index++]!,property=String(key),descriptor=Object.getOwnPropertyDescriptor(frame.source,property);
   if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw new UmfError('NON_JSON','Inventory request contains hidden fields or accessors.',displayPath(childPath(frame.path,property)));
   tasks.push(task);
   tasks.push({kind:'value',value:descriptor.value,path:childPath(frame.path,property),assign:item=>{if(frame.array)(frame.target as Json[])[key as number]=item;else Object.defineProperty(frame.target,property,{value:item,enumerable:true,writable:true,configurable:true});}});
   continue;
  }
  const {value, path:at, assign}=task;
  if(value===null){add(4,at);assign(null);continue;}
  if(typeof value==='boolean'){add(value?4:5,at);assign(value);continue;}
  if(typeof value==='string'){countString(value,at);assign(value);continue;}
  if(typeof value==='number'){
   if(!Number.isFinite(value))throw new UmfError('NUMBER','Inventory request contains a non-finite number.',displayPath(at));
   add(JSON.stringify(value).length,at);assign(value);continue;
  }
  if(typeof value!=='object')throw new UmfError('NON_JSON','Inventory request contains a non-JSON value.',displayPath(at));
  if(active.has(value))throw new UmfError('CYCLE','Inventory request contains a cycle.',displayPath(at));
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
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
   for(const key of names)add(quotedJsonBytes(key)+1,childPath(at,key));
  }
  active.add(value);
  const target:Json[]|Record<string,Json>=array?new Array(value.length):Object.create(null);
  assign(target as Json);
  const frame:Frame={source:value,target,keys:array?null:names,index:0,array,path:at};
  tasks.push({kind:'resume',frame});
 }
 return root[0]!;
}
function ownRequestHistory(input:unknown):Json{
 if(!obj(input)||Object.getOwnPropertySymbols(input).length)throw new ShapeError('/history','history-profile-or-count');
 const keys=Object.getOwnPropertyNames(input),expected=['profile','plans','executions'];
 if(keys.length!==expected.length||expected.some(key=>!keys.includes(key)))throw new ShapeError('/history','history-profile-or-count');
 const profileDescriptor=Object.getOwnPropertyDescriptor(input,'profile'),planDescriptor=Object.getOwnPropertyDescriptor(input,'plans'),executionDescriptor=Object.getOwnPropertyDescriptor(input,'executions');
 if(!profileDescriptor||!profileDescriptor.enumerable||!('value'in profileDescriptor)||profileDescriptor.value!=='umf.table-inventory-source-history/0.1'||!planDescriptor||!planDescriptor.enumerable||!('value'in planDescriptor)||!executionDescriptor||!executionDescriptor.enumerable||!('value'in executionDescriptor)||!Array.isArray(planDescriptor.value)||!Array.isArray(executionDescriptor.value)||planDescriptor.value.length>128||executionDescriptor.value.length!==planDescriptor.value.length)throw new ShapeError('/history','history-profile-or-count');
 let owned:Json;try{owned=ownCanonicalComponent(input,'/history',25_165_824);}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')throw new ShapeError('/history','history-too-large');throw error;}
 if(!obj(owned)||!Array.isArray(owned.plans)||!Array.isArray(owned.executions)||owned.plans.length>128||owned.executions.length>128)throw new UmfError('LIMIT','Inventory history exceeds its original entry bound.','/history');
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
function ownRequestJson(input:unknown):TableInventoryMigrationRequest{
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
 let options:Json;try{options=ownCanonicalComponent(raw.options,'/options',6_291_456);}catch(error){if(error instanceof UmfError&&error.code==='LIMIT')throw new ShapeError('/options','options-too-large');throw error;}
 const owned={id:raw.id,predecessor:ownPredecessor(raw.predecessor,raw.previous),previous:raw.previous===null?null:copyJson(raw.previous),next:copyJson(raw.next),options,history:ownRequestHistory(raw.history)};
 return owned as unknown as TableInventoryMigrationRequest;
}
function prepareInventoryCompilation(input:unknown,verifyHistoricalG10:HistoricalG10PlanVerifier):PreparedInventoryCompilation{
 const owned=ownRequestJson(input),request:G10ValidatedRequest=validateG10RequestShape(owned,verifyHistoricalG10);
 const stableRequest:TableInventoryMigrationRequest={id:request.id,predecessor:request.predecessor,previous:request.previous,next:request.next,options:owned.options,history:owned.history};
 const next=projectG10Bundle(request.next,'next'),previous=request.previous===null?null:projectG10Bundle(request.previous,'previous');
 const lineage=deriveInventorySeedLineage(request.history,{previous:request.previous,next:request.next,options:{seedSets:request.options.seedSets,retiredSeedSets:request.options.retiredSeedSets}},verifyHistoricalG10),inventory=compileG10InventoryDeltaFromPrepared(request,next,previous,lineage),review=exactReviewFromPrepared(stableRequest,verifyHistoricalG10,{history:request.history,before:previous,after:next,seedLineage:lineage});
 return {request,inventory,next,previous,lineage,review,stableRequest};
}
function compileG10InventoryPlanInternal(input:unknown,verifyHistoricalG10:HistoricalG10PlanVerifier):Record<string,Json>{
 return compileInventoryPlanFromPrepared(prepareInventoryCompilation(input,verifyHistoricalG10));
}
function compileInventoryPlanFromPrepared(prepared:PreparedInventoryCompilation):Record<string,Json>{
 const {request,inventory,next,previous,lineage,review}=prepared;
 if(inventory.changes.some(change=>change.kind!=='create-table'))fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');
 const selected=request.options.tableIntents;if(selected.some(intent=>intent.kind!=='create'))fail('TABLE_REMOVAL_EFFECTS_NOT_LOWERED');
 const unsupported=(['defaultChanges','conversions','concurrentIndexes','validations','retiredSeedSets','retirements','restorations','archiveSources'] as const).find(key=>request.options[key].length!==0);if(unsupported)fail('COMPOSITION_NOT_LOWERED:'+unsupported);
 if(request.options.backfills.length&&request.options.backfills.length!==1)fail('G02_COMPOSITION_SELECTION_NOT_LOWERED');
 const derived=deriveInitialRendererEffectsCore(next.bundle,next.projection,previous?.projection??null,true);
 if(inventory.changes.length!==derived.effects.filter(effect=>effect.operation==='create-table').length)fail('CREATE_EFFECT_COVERAGE');
 const dependencies:TypedDependency[]=[...derived.edges];let effects=[...derived.effects];
 if(request.options.backfills.length){
  if(!previous)fail('G02_INITIAL_PLAN_UNSUPPORTED');
  const ownedMarkers=partitionInventoryMarkersForG02(request.options.reviewedChanges as any,previous.bundle,next.bundle,next.tables.map(table=>table.table).filter(table=>!previous!.tables.some(old=>old.table===table)),request.options.backfills[0]!);
  const lowered=deriveG02FieldEffects(previous.bundle,next.bundle,previous.projection,next.projection,{version:'umf.table-migration-options/0.4',backfills:request.options.backfills,concurrentIndexes:[],reviewedChanges:ownedMarkers,validations:[]} as any,effects.length);
  effects.push(...lowered.effects);dependencies.push(...lowered.edges);
 }
 if(request.options.seedSets.length){const seedStates=new Map(next.projection.seedStates.map(seed=>[seed.id,seed]));for(const selected of request.options.seedSets){if(!seedStates.has(selected))fail('SEED_SOURCE_BINDING');}
  const subject:InventorySubject={kind:'seed',sets:[...request.options.seedSets]},seedEffect:EffectNode={id:'g10-apply-selected-seeds',kind:'seed',operation:'apply-seeds',subject,sourcePath:'/options/seedSets',sql:'',transaction:'required',recovery:'rollback-transaction',sourceOrder:effects.length+1,atomicGroup:null,transition:{action:'update',collection:'tables',meaning:{}}};
  effects.push(seedEffect);for(const selected of request.options.seedSets){for(const obligation of derived.publicationObligations.filter(candidate=>candidate.ownerKind==='seed-set'&&candidate.ownerId===selected)){dependencies.push({dependent:hashCanonical({kind:'seed-set',table:null,subject:selected}),prerequisite:hashCanonical(obligation.targetIdentity),sourcePath:obligation.sourcePath,reason:'selected-seed-requires-source-table',state:'present'});}}
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
 const history=prepared.stableRequest.history as unknown as Json,historyBinding={profile:'umf.table-inventory-source-history/0.1' as const,count:request.history.plans.length,digest:hashCanonical(prepared.stableRequest.history)};
 const seedExecution=request.options.seedSets.length?{version:'umf.table-seed-execution/0.1' as const,sets:[...request.options.seedSets]}:'none';
 const provenanceMutations=deriveG10ProvenanceMutations(previous?.projection??null,next.projection,effects);
 return compileInventoryPlanCore({id:request.id,predecessor:request.predecessor,previous:request.previous,next:request.next,options:prepared.stableRequest.options as unknown as Json,history,historyBinding,inventory,initialPrefix,nextCatalog:next.projection.catalog as unknown as Record<string,Json[]>,effects,dependencies,publicationObligations:derived.publicationObligations,provenanceMutations,seedExecution,review:review as unknown as Json[]});
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
function exactReviewFromPrepared(request:TableInventoryMigrationRequest,verifier:HistoricalG10PlanVerifier,prepared:PreparedReviewInputs):TableInventoryReviewedChangeCandidate[]{
 const candidates=discoverInventoryReviewCandidatesCore(request.previous,request.next,discoverySelector(request.options),request.history,verifier,prepared);
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
 const body={...plan,review:review as unknown as Json[]};delete body.digest;body.digest=hashCanonical(body);
 if(new TextEncoder().encode(canonical(body)).length>25165824)throw new UmfError('TABLE_INVENTORY_PLAN_SIZE','The complete reviewed inventory plan exceeds the supported size bound.','/review');
 return body as unknown as TableInventoryMigrationPlan;
}

/** Compile from complete independently verified bundles and their explicit original history. */
export function compileTableInventoryMigration(request:TableInventoryMigrationRequest):TableInventoryMigrationResult{
 try{
  const verifier=createHistoricalG10Verifier();
  const prepared=prepareInventoryCompilation(request,verifier);
  const plan=compileInventoryPlanFromPrepared(prepared);
  return {status:'compiled',plan:withReview(plan,prepared.review),diagnostics:[]};
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
