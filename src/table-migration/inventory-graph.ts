import {hashCanonical} from '../compilation/bundle/hash';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type InventorySubject=
 |{kind:'table';table:string;record:{module:string;element:string}}
 |{kind:'field';table:string;field:{module:string;element:string}}
 |{kind:'dependency';table:string;dependencyKind:'check'|'foreignKey'|'index'|'key'|'policy'|'grant'|'comment';id:string;sourcePath:string;meaningDigest:string}
 |{kind:'seed';sets:string[]}
 |{kind:'schema-grant';schema:string;audiences:['person','batch'];privilege:'USAGE'}
 |{kind:'metadata';profile:'umf.table-inventory-metadata/0.1'};
export type EffectOperation='create-table'|'remove-table'|'enable-rls'|'force-rls'|'add-column'|'drop-column'|'target-check'|'install-default'|'change-default'|'tighten-not-null'|'relax-not-null'|'rename-column'|'dependency-drop'|'dependency-add'|'apply-backfill'|'apply-seeds'|'capture-originals'|'convert-field'|'validate-conversion'|'capture-retired-values'|'retire-field'|'restore-field'|'validate-restoration'|'create-concurrent-index'|'add-not-valid'|'validate'|'set-comment'|'prepare-inventory-metadata'|'record-inventory-approval'|'publish-inventory';
export interface EffectNode {id:string;kind:string;operation:EffectOperation;subject:InventorySubject;sourcePath:string;sql:string;transaction:'required'|'forbidden';recovery:'rollback-transaction'|'inspect-index';sourceOrder:number;atomicGroup:string|null;transition:{action:'add'|'remove'|'update'|'validate'|'invalidate'|'mark-valid'|'mark-invalid';collection:'tables'|'columns'|'keys'|'checks'|'foreignKeys'|'indexes'|'policies'|'grants'|'comments';meaning:Json};dataBinding?:{profile:'umf.table-inventory-backfill/0.1';selectionIndex:number;operationId:string;previousSourceDigest:string;nextSourceDigest:string};catalogMutations?:CatalogMutation[]}
export interface TypedDependency {dependent:string;prerequisite:string;sourcePath:string;reason:string;state:'present'|'absent'}
export interface ScheduledPhase {id:string;kind:'prepare'|'approval'|'transaction'|'backfill-add'|'backfill-tighten'|'field-replacement'|'field-conversion'|'field-retirement'|'field-restoration'|'concurrent-index'|'constraint-add'|'constraint-validation'|'seed'|'publication';transaction:'required'|'forbidden';steps:string[]}
export interface PrefixFrame {profile:'umf.table-inventory-prefix/0.1';index:number;completedSteps:string[];tableStates:Json[];catalog:Record<string,Json[]>;metadata:{profile:'umf.table-inventory-metadata/0.1';state:'pristine'|'pending'|'published'};seedStates:Json[];digest:string}
export interface ScheduledInventoryEffects {steps:EffectNode[];phases:ScheduledPhase[];prefixes:PrefixFrame[]}
export interface CatalogMutation {collection:'tables'|'columns'|'keys'|'checks'|'foreignKeys'|'indexes'|'policies'|'grants'|'comments';action:'add'|'remove'|'replace';identity:Json;before:Json|null;after:Json|null}
export interface InventoryMetadataStepIds {prepare:string;approval:string;publication:string}
export interface SourceCatalogProjection {catalog:Record<string,Json[]>;tables:{table:string;record:{module:string;element:string};meaningDigest:string}[]}
const collections=['tables','columns','keys','checks','foreignKeys','indexes','policies','grants','comments'] as const;
const sha=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>obj(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
function fail(code:string):never{throw new Error('G10_SCHEDULE_'+code);}
/** Map the step subject to the stable projection identity; source paths and meaning digests bind review, not object identity. */
function catalogIdentity(s:InventorySubject):{kind:string;table:string|null;subject:Json} {
 if(s.kind==='table')return {kind:'table',table:s.table,subject:s.record as unknown as Json};
 if(s.kind==='field')return {kind:'column',table:s.table,subject:s.field as unknown as Json};
 if(s.kind==='schema-grant')return {kind:'schema-grant',table:null,subject:{schema:s.schema,audiences:s.audiences,privilege:s.privilege}};
 if(s.kind==='dependency'){
  let subject:Json=s.id;
  if(s.dependencyKind==='policy'||s.dependencyKind==='grant'||s.dependencyKind==='comment'){
   try{const decoded=JSON.parse(s.id);if(Array.isArray(decoded))subject=decoded as Json;else fail('DEPENDENCY_ID');}catch{fail('DEPENDENCY_ID');}
  }
  return {kind:s.dependencyKind,table:s.table,subject};
 }
 return {kind:s.kind,table:null,subject:s as unknown as Json};
}
/** A target-check step is publicly bound to its Field but changes its source-derived domain CHECK row. */
function transitionIdentity(effect:EffectNode):{kind:string;table:string|null;subject:Json}{
 if(effect.operation==='target-check'&&effect.subject.kind==='field')return {kind:'check',table:effect.subject.table,subject:'domain:'+effect.subject.field.module+'.'+effect.subject.field.element};
 return catalogIdentity(effect.subject);
}
function subjectIdentity(s:InventorySubject):string{return hashCanonical(catalogIdentity(s));}
export function inventoryCatalogIdentity(s:InventorySubject):{kind:string;table:string|null;subject:Json}{return catalogIdentity(s);}
function collectionFor(s:InventorySubject):string|undefined{return s.kind==='table'?'tables':s.kind==='field'?'columns':s.kind==='schema-grant'?'grants':s.kind==='seed'||s.kind==='metadata'?undefined:({check:'checks',foreignKey:'foreignKeys',index:'indexes',key:'keys',policy:'policies',grant:'grants',comment:'comments'} as const)[s.dependencyKind];}
function validateEffect(value:EffectNode):void {
 const base=['id','kind','operation','subject','sourcePath','sql','transaction','recovery','sourceOrder','atomicGroup','transition'];const keys=[...base,...(value?.operation==='apply-backfill'?['dataBinding']:[]),...(value?.catalogMutations!==undefined?['catalogMutations']:[])];
 if(!exact(value,keys)||typeof value.id!=='string'||!value.id||typeof value.kind!=='string'||typeof value.operation!=='string'||typeof value.sourcePath!=='string'||!value.sourcePath.startsWith('/')||typeof value.sql!=='string'||!['required','forbidden'].includes(value.transaction)||!['rollback-transaction','inspect-index'].includes(value.recovery)||!Number.isSafeInteger(value.sourceOrder)||value.sourceOrder<0||(value.atomicGroup!==null&&typeof value.atomicGroup!=='string'))fail('EFFECT_SHAPE');
 const s=value.subject;if(!obj(s))return fail('SUBJECT_SHAPE');
 if(s.kind==='table'){if(!exact(s,['kind','table','record'])||typeof s.table!=='string'||!s.table||!exact(s.record,['module','element'])||typeof s.record.module!=='string'||typeof s.record.element!=='string')return fail('TABLE_SUBJECT');}
 else if(s.kind==='field'){if(!exact(s,['kind','table','field'])||typeof s.table!=='string'||!exact(s.field,['module','element'])||typeof s.field.module!=='string'||typeof s.field.element!=='string')return fail('FIELD_SUBJECT');}
 else if(s.kind==='dependency'){if(!exact(s,['kind','table','dependencyKind','id','sourcePath','meaningDigest'])||typeof s.table!=='string'||!['check','foreignKey','index','key','policy','grant','comment'].includes(String(s.dependencyKind))||typeof s.id!=='string'||!s.id||typeof s.sourcePath!=='string'||!sha(s.meaningDigest))return fail('DEPENDENCY_SUBJECT');}
 else if(s.kind==='seed'){if(!exact(s,['kind','sets'])||!Array.isArray(s.sets)||s.sets.some(x=>typeof x!=='string'||!x)||new Set(s.sets).size!==s.sets.length)return fail('SEED_SUBJECT');}
 else if(s.kind==='schema-grant'){if(!exact(s,['kind','schema','audiences','privilege'])||typeof s.schema!=='string'||!s.schema||!Array.isArray(s.audiences)||s.audiences.length!==2||s.audiences[0]!=='person'||s.audiences[1]!=='batch'||s.privilege!=='USAGE')return fail('SCHEMA_GRANT_SUBJECT');}
 else if(s.kind==='metadata'){if(!exact(s,['kind','profile'])||s.profile!=='umf.table-inventory-metadata/0.1')return fail('METADATA_SUBJECT');}
 else return fail('SUBJECT_KIND');
 const dependencyStepKind=():string=>value.subject.kind==='schema-grant'?'grant':value.subject.kind==='dependency'?({check:'table',foreignKey:'foreignKey',index:'index',key:'table',policy:'policy',grant:'grant',comment:'comment'} as const)[value.subject.dependencyKind]:'invalid';
 const dependencyOperation=['dependency-add','dependency-drop','create-concurrent-index','add-not-valid','validate'].includes(value.operation);
 const expectedKind=value.operation==='create-table'||value.operation==='remove-table'||value.operation==='enable-rls'||value.operation==='force-rls'||value.operation==='add-column'||value.operation==='drop-column'||value.operation==='target-check'||value.operation==='install-default'||value.operation==='change-default'||value.operation==='tighten-not-null'||value.operation==='relax-not-null'||value.operation==='rename-column'?'table':value.operation==='apply-seeds'?'seed':value.operation==='apply-backfill'?'backfill':value.operation==='capture-originals'||value.operation==='convert-field'||value.operation==='validate-conversion'?'conversion':value.operation==='capture-retired-values'||value.operation==='retire-field'||value.operation==='restore-field'||value.operation==='validate-restoration'?'retirement':value.operation==='prepare-inventory-metadata'||value.operation==='record-inventory-approval'||value.operation==='publish-inventory'?'metadata':value.operation==='set-comment'?'comment':dependencyOperation?dependencyStepKind():'invalid';
 if(value.kind!==expectedKind)fail('KIND_OPERATION_MISMATCH');
 const emptySql=['apply-backfill','apply-seeds','capture-originals','convert-field','validate-conversion','capture-retired-values','retire-field','restore-field','validate-restoration','prepare-inventory-metadata','record-inventory-approval','publish-inventory'].includes(value.operation);
 if(emptySql?value.sql!=='':value.sql.length===0)fail('SQL_BRANCH');
 const forbidden=value.operation==='create-concurrent-index';if((value.transaction==='forbidden')!==forbidden||(value.recovery==='inspect-index')!==forbidden)fail('TRANSACTION_BRANCH');
 if(value.operation==='apply-seeds'&&value.kind!=='seed'||value.operation==='apply-backfill'&&value.kind!=='backfill')fail('DATA_KIND');
 if(value.operation==='apply-backfill'&&(!exact(value.dataBinding,['profile','selectionIndex','operationId','previousSourceDigest','nextSourceDigest'])||value.dataBinding.profile!=='umf.table-inventory-backfill/0.1'||!Number.isSafeInteger(value.dataBinding.selectionIndex)||value.dataBinding.selectionIndex<0||typeof value.dataBinding.operationId!=='string'||!value.dataBinding.operationId||!sha(value.dataBinding.previousSourceDigest)||!sha(value.dataBinding.nextSourceDigest)||value.subject.kind!=='field'||value.transition.action!=='update'||value.transition.collection!=='columns'||!obj(value.transition.meaning)||Object.keys(value.transition.meaning).length!==0))fail('BACKFILL_BINDING');
 const c=collectionFor(value.subject);if(c&&value.transition.collection!==c&&!(value.operation==='target-check'&&value.subject.kind==='field'&&value.transition.collection==='checks'))fail('TRANSITION_SUBJECT_COLLECTION');
 if(!exact(value.transition,['action','collection','meaning'])||!['add','remove','update','validate','invalidate','mark-valid','mark-invalid'].includes(String(value.transition.action))||!collections.includes(value.transition.collection as typeof collections[number])||!obj(value.transition.meaning))fail('TRANSITION_SHAPE');
 if(value.catalogMutations!==undefined){if(!Array.isArray(value.catalogMutations)||value.catalogMutations.length>32)fail('CATALOG_MUTATIONS_SHAPE');for(const mutation of value.catalogMutations){if(!exact(mutation,['collection','action','identity','before','after'])||!collections.includes(mutation.collection)||!['add','remove','replace'].includes(mutation.action)||!obj(mutation.identity)||mutation.before!==null&&!obj(mutation.before)||mutation.after!==null&&!obj(mutation.after)||mutation.action==='add'&&(mutation.before!==null||mutation.after===null)||mutation.action==='remove'&&(mutation.before===null||mutation.after!==null)||mutation.action==='replace'&&(mutation.before===null||mutation.after===null)||mutation.before!==null&&(!obj((mutation.before as any).identity)||hashCanonical((mutation.before as any).identity)!==hashCanonical(mutation.identity))||mutation.after!==null&&(!obj((mutation.after as any).identity)||hashCanonical((mutation.after as any).identity)!==hashCanonical(mutation.identity)))fail('CATALOG_MUTATION_SHAPE');}}
 if(value.operation==='create-table'&&value.transition.action!=='add'||value.operation==='remove-table'&&value.transition.action!=='remove')fail('TABLE_TRANSITION');
 if(value.subject.kind==='schema-grant'&&(value.operation!=='dependency-add'||value.kind!=='grant'||value.transaction!=='required'||value.transition.collection!=='grants'||value.transition.action!=='add'))fail('SCHEMA_GRANT_BRANCH');
 if(value.transition.action==='update'&&(value.operation==='apply-seeds'?value.subject.kind!=='seed'||value.transition.collection!=='tables'||Object.keys(value.transition.meaning).length!==0:value.operation==='apply-backfill'?value.subject.kind!=='field'||value.transition.collection!=='columns'||!obj(value.transition.meaning)||Object.keys(value.transition.meaning).length!==0:value.operation==='tighten-not-null'||value.operation==='install-default'?value.subject.kind!=='field'||value.transition.collection!=='columns'||!obj(value.transition.meaning):value.subject.kind!=='table'||!['enable-rls','force-rls'].includes(value.operation)||value.transition.collection!=='tables'))fail('TABLE_UPDATE_BRANCH');
}
function prefixContains(initial:Omit<PrefixFrame,'digest'>,identity:string):boolean {
 for(const rows of Object.values(initial.catalog))for(const row of rows){
  if(!obj(row)||!Object.hasOwn(row,'identity'))continue;
  if(hashCanonical(row.identity)===identity&&row.state==='present')return true;
 }
 return false;
}
function stepDependencies(effects:EffectNode[],edges:TypedDependency[],initial:Omit<PrefixFrame,'digest'>):Map<string,Set<string>> {
 const byIdentity=new Map<string,EffectNode[]>();const index=(key:string,effect:EffectNode)=>{const rows=byIdentity.get(key)??[];rows.push(effect);byIdentity.set(key,rows);};for(const effect of effects){index(subjectIdentity(effect.subject),effect);if(effect.operation==='apply-seeds'&&effect.subject.kind==='seed')for(const setId of effect.subject.sets)index(hashCanonical({kind:'seed-set',table:null,subject:setId}),effect);if(effect.operation==='create-table'){const meaning=effect.transition.meaning as any,embedded=meaning?.embeddedCatalog;if(obj(embedded))for(const collection of ['columns','keys','checks'])if(Array.isArray(embedded[collection]))for(const row of embedded[collection])if(obj(row)&&obj(row.identity))index(hashCanonical(row.identity),effect);}}
 const out=new Map(effects.map(effect=>[effect.id,new Set<string>()]));
 for(const edge of edges){if(!exact(edge,['dependent','prerequisite','sourcePath','reason','state'])||!sha(edge.dependent)||!sha(edge.prerequisite)||typeof edge.sourcePath!=='string'||!edge.sourcePath.startsWith('/')||typeof edge.reason!=='string'||!edge.reason||!['present','absent'].includes(edge.state))fail('DEPENDENCY_SHAPE');if(edge.state!=='present')continue;
  const prerequisite=byIdentity.get(edge.prerequisite)??[],dependent=byIdentity.get(edge.dependent)??[];
  if(edge.reason==='g02-grant-revoke-before-field'){
   if(prerequisite.length!==1||prerequisite[0]!.operation!=='dependency-drop'||prerequisite[0]!.subject.kind!=='dependency'||prerequisite[0]!.subject.dependencyKind!=='grant'||dependent.length===0&&!prefixContains(initial,edge.dependent)||dependent.some(effect=>effect.subject.kind!=='field'||effect.atomicGroup!==prerequisite[0]!.atomicGroup)||dependent.length>0&&!dependent.some(effect=>effect.operation==='add-column'||effect.operation==='target-check'||effect.operation==='apply-backfill'||effect.operation==='install-default'||effect.operation==='tighten-not-null'))fail('G02_GRANT_REVOKE_EDGE');
   for(const effect of dependent)out.get(effect.id)!.add(prerequisite[0]!.id);continue;
  }
  if(edge.reason==='g02-grant-add-after-field-group'){
   if(dependent.length!==1||dependent[0]!.operation!=='dependency-add'||dependent[0]!.subject.kind!=='dependency'||dependent[0]!.subject.dependencyKind!=='grant'||prerequisite.length===0&&!prefixContains(initial,edge.prerequisite)||prerequisite.some(effect=>effect.subject.kind!=='field'||effect.atomicGroup!==dependent[0]!.atomicGroup)||prerequisite.length>0&&!prerequisite.some(effect=>effect.operation==='tighten-not-null'||effect.operation==='install-default'||effect.operation==='apply-backfill'||effect.operation==='add-column'||effect.operation==='target-check'))fail('G02_GRANT_ADD_EDGE');
   for(const effect of prerequisite)out.get(dependent[0]!.id)!.add(effect.id);continue;
  }
  if(edge.reason.startsWith('g02-effect-order:')){
   const match=/^g02-effect-order:(add-column|backfill|install-default|tighten-not-null|target-check|validate-target-check):(add-column|backfill|install-default|tighten-not-null|target-check|validate-target-check)$/.exec(edge.reason);if(!match)fail('G02_ORDER_EDGE');
   const roleOperation=(role:string,operation:EffectOperation)=>role==='add-column'?operation==='add-column':role==='backfill'?operation==='apply-backfill':role==='install-default'?operation==='install-default':role==='tighten-not-null'?operation==='tighten-not-null':role==='target-check'?operation==='target-check'||operation==='add-not-valid':operation==='validate';
   const allowed=(before:string,after:string)=>before==='add-column'&&['target-check','backfill'].includes(after)||before==='target-check'&&after==='backfill'||before==='backfill'&&['install-default','tighten-not-null'].includes(after)||before==='install-default'&&after==='tighten-not-null'||before==='target-check'&&after==='validate-target-check';
   const beforeRole=match[1]!,afterRole=match[2]!;if(!allowed(beforeRole,afterRole))fail('G02_ORDER_EDGE');
   const beforeMatches=prerequisite.filter(effect=>roleOperation(beforeRole,effect.operation)),afterMatches=dependent.filter(effect=>roleOperation(afterRole,effect.operation));
   if(beforeMatches.length!==1||afterMatches.length!==1||afterMatches[0]!.sourcePath!==edge.sourcePath)fail('G02_ORDER_EDGE_BINDING');out.get(afterMatches[0]!.id)!.add(beforeMatches[0]!.id);continue;
  }
  const prerequisiteInitiallyPresent=prefixContains(initial,edge.prerequisite),dependentInitiallyPresent=prefixContains(initial,edge.dependent);
  if(prerequisite.length===0&&!prerequisiteInitiallyPresent)fail('UNRESOLVED_PREREQUISITE');
  if(dependent.length===0&&!dependentInitiallyPresent)fail('UNRESOLVED_DEPENDENT');
  if(dependent.length===0&&prerequisite.some(effect=>effect.transition.action==='remove'||effect.transition.action==='invalidate'||effect.transition.action==='mark-invalid'))fail('RETAINED_DEPENDENT_BLOCKS_REMOVAL');
  if(dependent.length===0||prerequisite.length===0)continue;
  for(const before of prerequisite)for(const after of dependent){if(before.id===after.id)continue;if(edge.reason==='schema-grant-after-required-effects'){out.get(after.id)!.add(before.id);continue;}if(edge.reason==='g02-backfill-before-tighten'&&before.operation==='apply-backfill'&&after.operation==='tighten-not-null'){out.get(after.id)!.add(before.id);continue;}if(edge.reason==='g02-grant-add-after-tighten'&&before.operation==='tighten-not-null'&&after.operation==='dependency-add'){out.get(after.id)!.add(before.id);continue;}if(before.transition.action==='add'||before.transition.action==='validate'||before.transition.action==='mark-valid')out.get(after.id)!.add(before.id);if(before.transition.action==='remove'||before.transition.action==='invalidate'||before.transition.action==='mark-invalid')out.get(before.id)!.add(after.id);}
 }
 return out;
}
function topo(effects:EffectNode[],dependencies:Map<string,Set<string>>):EffectNode[][]{
 const unitKey=(effect:EffectNode)=>effect.atomicGroup===null?`single:${effect.id}`:`atomic:${effect.atomicGroup}`;
 const units=new Map<string,EffectNode[]>();for(const effect of effects){const key=unitKey(effect),members=units.get(key)??[];members.push(effect);units.set(key,members);}
 const unitOrder=new Map([...units].map(([key,members])=>[key,Math.min(...members.map(member=>member.sourceOrder))]));
 const needs=new Map([...units.keys()].map(key=>[key,new Set<string>()]));
 for(const [id,prerequisites]of dependencies){const dependent=unitKey(effects.find(effect=>effect.id===id)!);for(const prerequisite of prerequisites){const required=unitKey(effects.find(effect=>effect.id===prerequisite)!);if(dependent!==required)needs.get(dependent)!.add(required);}}
 const unitIndegree=new Map([...needs].map(([key,required])=>[key,required.size])),unitReverse=new Map([...units.keys()].map(key=>[key,[] as string[]]));
 for(const [key,required]of needs)for(const prerequisite of required)unitReverse.get(prerequisite)!.push(key);
 const sortUnits=(keys:string[])=>keys.sort((a,b)=>unitOrder.get(a)!-unitOrder.get(b)!||a.localeCompare(b));
 const ready=sortUnits([...units.keys()].filter(key=>unitIndegree.get(key)===0)),orderedUnits:string[]=[];
 while(ready.length){const current=ready.shift()!;orderedUnits.push(current);for(const dependent of unitReverse.get(current)!){const next=unitIndegree.get(dependent)!-1;unitIndegree.set(dependent,next);if(next===0){ready.push(dependent);sortUnits(ready);}}}
 if(orderedUnits.length!==units.size)fail('DEPENDENCY_CYCLE');
 const ordered:EffectNode[][]=[];
 for(const key of orderedUnits){const members=units.get(key)!,memberIds=new Set(members.map(member=>member.id)),memberNeeds=new Map(members.map(member=>[member.id,new Set([...dependencies.get(member.id)!].filter(id=>memberIds.has(id)))])),indegree=new Map([...memberNeeds].map(([id,required])=>[id,required.size])),reverse=new Map(members.map(member=>[member.id,[] as string[]]));for(const [id,required]of memberNeeds)for(const prerequisite of required)reverse.get(prerequisite)!.push(id);
  const memberSort=(ids:string[])=>ids.sort((a,b)=>members.find(x=>x.id===a)!.sourceOrder-members.find(x=>x.id===b)!.sourceOrder||a.localeCompare(b));
  const memberReady=memberSort(members.map(member=>member.id).filter(id=>indegree.get(id)===0)),orderedMembers:EffectNode[]=[];
  while(memberReady.length){const id=memberReady.shift()!;orderedMembers.push(members.find(member=>member.id===id)!);for(const dependent of reverse.get(id)!){const remaining=indegree.get(dependent)!-1;indegree.set(dependent,remaining);if(remaining===0){memberReady.push(dependent);memberSort(memberReady);}}}
  if(orderedMembers.length!==members.length)fail('ATOMIC_GROUP_DEPENDENCY_CYCLE');ordered.push(orderedMembers);
 }
 return ordered;
}
function phaseKind(effect:EffectNode):ScheduledPhase['kind']{
 if(effect.operation==='create-concurrent-index')return 'concurrent-index';if(effect.operation==='apply-seeds')return 'seed';if(effect.operation==='apply-backfill')return 'backfill-add';if(effect.operation==='convert-field'||effect.operation==='capture-originals'||effect.operation==='validate-conversion')return 'field-conversion';if(effect.operation==='retire-field'||effect.operation==='capture-retired-values')return 'field-retirement';if(effect.operation==='restore-field'||effect.operation==='validate-restoration')return 'field-restoration';if(effect.operation==='validate'||effect.operation==='add-not-valid')return effect.operation==='validate'?'constraint-validation':'constraint-add';if(effect.operation==='tighten-not-null')return 'backfill-tighten';return 'transaction';
}
function subjectRows(frame:PrefixFrame):Record<string,Json[]>{return frame.catalog;}
function applyCatalogMutationList(frame:PrefixFrame,mutations:readonly CatalogMutation[]):void{
 for(const mutation of mutations){const rows=frame.catalog[mutation.collection],matches=rows.map((row,index)=>({row,index})).filter(({row})=>obj(row)&&obj(row.identity)&&hashCanonical(row.identity)===hashCanonical(mutation.identity));if(matches.length!==(mutation.action==='add'?0:1))fail('CATALOG_MUTATION_CARDINALITY:'+mutation.collection);const current=matches[0]?.row??null;if(hashCanonical(current)!==hashCanonical(mutation.before))fail('CATALOG_MUTATION_BEFORE:'+mutation.collection);if(mutation.action==='add')rows.push(structuredClone(mutation.after) as Json);else if(mutation.action==='remove')rows.splice(matches[0]!.index,1);else rows[matches[0]!.index]=structuredClone(mutation.after) as Json;}
}
function applyCatalogMutations(frame:PrefixFrame,effect:EffectNode):void{applyCatalogMutationList(frame,effect.catalogMutations??[]);}
function applyTransition(frame:PrefixFrame,effect:EffectNode):void{
 const collection=effect.transition.collection,rows=frame.catalog[collection]??[],key=hashCanonical(transitionIdentity(effect)),index=rows.findIndex(row=>obj(row)&&row.identity!==undefined&&hashCanonical(row.identity)===key),action=effect.transition.action;
 if(effect.operation==='apply-seeds'){
  if(action!=='update'||effect.subject.kind!=='seed'||collection!=='tables'||Object.keys(effect.transition.meaning as Record<string,Json>).length!==0)fail('SEED_TRANSITION');
 }else if(effect.subject.kind==='schema-grant'){
  if(action!=='add'||collection!=='grants'||index>=0)fail('SCHEMA_GRANT_TRANSITION');const grants=(effect.transition.meaning as any).grants;
  if(!Array.isArray(grants)||grants.length!==2)fail('SCHEMA_GRANT_ROWS');const roles=new Set<string>();
  for(const item of grants){if(!exact(item,['identity','meaning'])||!obj(item.identity)||!obj(item.meaning)||item.identity.kind!=='grant'||item.identity.table!==null||!Array.isArray(item.identity.subject)||item.identity.subject.length!==3||typeof item.identity.subject[0]!=='string'||item.identity.subject[1]!=='usage'||item.identity.subject[2]!==null||item.meaning.table!==null||item.meaning.privilege!=='usage'||item.meaning.columns!==null||item.meaning.grantOption!==false||item.meaning.effect!=='grant-schema-usage')fail('SCHEMA_GRANT_ROW_SHAPE');const role=item.meaning.role;if(typeof role!=='string'||role!==item.identity.subject[0]||roles.has(role))fail('SCHEMA_GRANT_ROLE');roles.add(role);if(rows.some(row=>obj(row)&&hashCanonical(row.identity)===hashCanonical(item.identity)))fail('DUPLICATE_PREFIX_SUBJECT');rows.push({identity:item.identity as unknown as Json,meaning:item.meaning as unknown as Json,state:'present'} as unknown as Json);}
 }else if(action==='add'){
  if(index>=0)fail('DUPLICATE_PREFIX_SUBJECT');
  if(effect.operation==='create-table'&&effect.subject.kind==='table'){
   const meaning=effect.transition.meaning as any;if(!exact(meaning,['tableMeaning','embeddedCatalog'])||!obj(meaning.tableMeaning)||!exact(meaning.embeddedCatalog,['columns','keys','checks'])||!Array.isArray(meaning.embeddedCatalog.columns)||!Array.isArray(meaning.embeddedCatalog.keys)||!Array.isArray(meaning.embeddedCatalog.checks))fail('TABLE_CREATE_EMBEDDED_SHAPE');
   rows.push({identity:catalogIdentity(effect.subject) as unknown as Json,meaning:meaning.tableMeaning as Json,state:'present'} as unknown as Json);
   for(const name of ['columns','keys','checks']){const embedded=meaning.embeddedCatalog[name] as Json[],target=frame.catalog[name]!;for(const item of embedded){if(!obj(item)||!obj(item.identity)||item.identity.table!==effect.subject.table||item.state!=='present'||target.some(row=>obj(row)&&hashCanonical(row.identity)===hashCanonical(item.identity)))fail('TABLE_CREATE_EMBEDDED_SUBJECT');target.push(item);}}
  }else {const value=effect.transition.meaning as any;if(!exact(value,['catalogMeaning','validation','validity'])||!obj(value.catalogMeaning))fail('DEPENDENCY_CATALOG_STATE');const row:Record<string,Json>={identity:transitionIdentity(effect) as unknown as Json,meaning:value.catalogMeaning as Json,state:'present'};if(value.validation!==null)row.validation=value.validation as Json;if(value.validity!==null)row.validity=value.validity as Json;rows.push(row as unknown as Json);}
 }
 else if(action==='remove'){if(index<0)fail('MISSING_PREFIX_SUBJECT');rows.splice(index,1);}
 else if(action==='update'){
  if(effect.operation==='apply-backfill'&&effect.subject.kind==='field'){
   if(collection!=='columns'||index<0||!obj(rows[index])||rows[index]!.state!=='present'||!obj(effect.transition.meaning)||Object.keys(effect.transition.meaning).length!==0)fail('BACKFILL_NO_CATALOG_TRANSITION');
  }else if((effect.operation==='tighten-not-null'||effect.operation==='install-default')&&effect.subject.kind==='field'){
   if(collection!=='columns'||index<0||!obj(rows[index])||!obj(effect.transition.meaning))fail('FIELD_REQUIREDNESS_TRANSITION');rows[index]={...rows[index] as Record<string,Json>,meaning:effect.transition.meaning};
  }else{
   if(index<0||!obj(rows[index]))fail('MISSING_PREFIX_SUBJECT');const tableMeaning=effect.transition.meaning as any;if(!obj(tableMeaning)||!obj(tableMeaning.rls)||typeof tableMeaning.rls.enabled!=='boolean'||typeof tableMeaning.rls.forced!=='boolean')fail('TABLE_RLS_MEANING');rows[index]={...rows[index] as Record<string,Json>,meaning:tableMeaning as Json};
  }
 }
 else {
  if(index<0)fail('MISSING_PREFIX_SUBJECT');const old=rows[index]!;if(!obj(old))fail('PREFIX_SUBJECT_SHAPE');
  if(collection==='checks'||collection==='foreignKeys'){
   if(action!=='validate'&&action!=='invalidate')fail('CONSTRAINT_TRANSITION');
   rows[index]={...old,validation:action==='validate'?'validated':'not-validated'};
  }else if(collection==='indexes'){
   if(action!=='mark-valid'&&action!=='mark-invalid')fail('INDEX_TRANSITION');
   rows[index]={...old,validity:action==='mark-valid'?'valid':'invalid'};
  }else fail('VALIDATION_TRANSITION_COLLECTION');
 }
 if(effect.operation!=='apply-seeds')frame.catalog[collection]=rows;
 applyCatalogMutations(frame,effect);
 const subject=effect.subject;
 if(subject.kind==='table'){
  const states=frame.tableStates as Record<string,Json>[],tableIndex=states.findIndex(state=>state.table===subject.table);
  if(action==='add'){
   const definitionDigest=hashCanonical(null);
   if(tableIndex<0)states.push({table:subject.table,record:subject.record as unknown as Json,state:'present',definitionDigest,creationStep:effect.id,removalStep:null});
   else {const old=states[tableIndex]!;if(old.state!=='absent')fail('TABLE_ALREADY_PRESENT');states[tableIndex]={...old,state:'present',definitionDigest,creationStep:effect.id,removalStep:null};}
  }else if(action==='remove'){
   if(tableIndex<0||states[tableIndex]!.state!=='present')fail('TABLE_NOT_PRESENT');states[tableIndex]={...states[tableIndex]!,state:'absent',removalStep:effect.id};
  }else if(action==='update'){
   if(tableIndex<0||states[tableIndex]!.state!=='present')fail('TABLE_NOT_PRESENT');
  }
 }
 if(effect.operation==='apply-seeds'){
  if(effect.subject.kind!=='seed')fail('SEED_SUBJECT');const byId=new Map<string,number>();frame.seedStates.forEach((raw,index)=>{if(!obj(raw)||typeof raw.id!=='string')fail('SEED_PREFIX_SHAPE');byId.set(raw.id,index);});
  for(const id of effect.subject.sets){const index=byId.get(id);if(index===undefined)fail('SEED_PREFIX_MISSING');const current=frame.seedStates[index]!;if(!obj(current)||current.execution!=='not-run'||current.disposition!=='apply-once')fail('SEED_PREFIX_NOT_APPLICABLE');frame.seedStates[index]={...current,execution:'confirmed'};}
 }
}
function frameDigest(frame:Omit<PrefixFrame,'digest'>):string{return hashCanonical(frame);}
function tableDefinitionDigest(table:string,record:Json,catalog:Record<string,Json[]>):string{
 if(!exact(catalog,collections as unknown as string[])||collections.some(collection=>!Array.isArray(catalog[collection])))fail('TABLE_DIGEST_CATALOG_SHAPE');
 const localCatalog=Object.fromEntries(collections.map(collection=>[collection,catalog[collection]!.filter(raw=>obj(raw)&&obj(raw.identity)&&raw.identity.table===table)])) as Record<string,Json[]>;
 const tableRows=localCatalog.tables??[];
 if(tableRows.length!==1||!obj(tableRows[0])||tableRows[0].state!=='present'||!obj(tableRows[0].identity)||hashCanonical(tableRows[0].identity.subject)!==hashCanonical(record))fail('TABLE_DEFINITION_BINDING:'+table);
 return hashCanonical({profile:'umf.table-inventory-table-definition/0.1',table,record,catalog:localCatalog});
}
function refreshTableDefinitionDigests(frame:Omit<PrefixFrame,'digest'>):void{
 if(!Array.isArray(frame.tableStates)||!exact(frame.catalog,collections as unknown as string[])||collections.some(collection=>!Array.isArray(frame.catalog[collection])))fail('TABLE_STATES_SHAPE');const seen=new Set<string>();
 for(const raw of frame.tableStates){
  if(!obj(raw)||typeof raw.table!=='string'||!raw.table||!('record'in raw)||!['present','absent'].includes(String(raw.state)))fail('TABLE_STATE_SHAPE');
  if(seen.has(raw.table))fail('TABLE_STATE_DUPLICATE');seen.add(raw.table);
  if(raw.state==='absent'){
   if(collections.some(collection=>frame.catalog[collection]!.some(row=>obj(row)&&obj(row.identity)&&row.identity.table===raw.table)))fail('ABSENT_TABLE_HAS_CATALOG_ROWS:'+raw.table);
   (raw as Record<string,Json>).definitionDigest=hashCanonical(null);
  }else (raw as Record<string,Json>).definitionDigest=tableDefinitionDigest(raw.table,raw.record as Json,frame.catalog);
 }
}
function orderCatalogFrame(catalog:Record<string,Json[]>,target:Record<string,Json[]>,allowedByCollection:Map<string,Set<string>>):void {
 for(const [collection,rows]of Object.entries(catalog)){
  const targetRows=target[collection]??[],rank=new Map<string,number>(),allowed=new Set<string>();
  targetRows.forEach((row,index)=>{if(!obj(row)||!obj(row.identity))fail('TARGET_CATALOG_SUBJECT');const key=hashCanonical(row.identity);if(rank.has(key))fail('TARGET_CATALOG_DUPLICATE');rank.set(key,index);allowed.add(key);});
  const original=new Map<string,number>();
  rows.forEach((row,index)=>{if(!obj(row)||!obj(row.identity))fail('PREFIX_CATALOG_SUBJECT');const key=hashCanonical(row.identity);if(original.has(key))fail('PREFIX_CATALOG_DUPLICATE');if(!allowedByCollection.get(collection)?.has(key))fail('PREFIX_CATALOG_UNKNOWN_SUBJECT');original.set(key,index);});
  // Intermediate frames may retain old subjects that a later typed step will
  // remove, but no frame may introduce a subject outside the verified source
  // endpoints. The final exact-target check below proves that nothing remains
  // lost or extra after all scheduled effects.
  rows.sort((left,right)=>{const leftKey=hashCanonical((left as Record<string,Json>).identity),rightKey=hashCanonical((right as Record<string,Json>).identity),leftRank=rank.get(leftKey),rightRank=rank.get(rightKey),leftOrder=leftRank??targetRows.length+(original.get(leftKey)??0),rightOrder=rightRank??targetRows.length+(original.get(rightKey)??0);return leftOrder-rightOrder;});
 }
}
function assertExactTargetCatalog(actual:Record<string,Json[]>,target:Record<string,Json[]>):void{
 if(!exact(actual,collections as unknown as string[])||!exact(target,collections as unknown as string[]))fail('TARGET_CATALOG_COLLECTIONS');
 for(const collection of collections){const a=actual[collection],t=target[collection];if(!Array.isArray(a)||!Array.isArray(t)||a.length!==t.length)fail('TARGET_CATALOG_COUNT:'+collection);for(let index=0;index<t.length;index++)if(hashCanonical(a[index])!==hashCanonical(t[index]))fail('TARGET_CATALOG_MISMATCH:'+collection+':'+index);}
}
/** Build index zero from the compiler's actual source projection, or the true null initial state. */
export function initialInventoryPrefix(source:SourceCatalogProjection|null,seedStates:Json[]=[]):Omit<PrefixFrame,'digest'> {
 const catalog=source?structuredClone(source.catalog):{tables:[],columns:[],keys:[],checks:[],foreignKeys:[],indexes:[],policies:[],grants:[],comments:[]};
 if(!exact(catalog,['tables','columns','keys','checks','foreignKeys','indexes','policies','grants','comments'])||Object.values(catalog).some(rows=>!Array.isArray(rows)))fail('SOURCE_CATALOG_SHAPE');
 const tableStates=source?source.tables.map(table=>({table:table.table,record:structuredClone(table.record),state:'present',definitionDigest:hashCanonical(null),creationStep:null,removalStep:null} as unknown as Json)):[];
 const initial={profile:'umf.table-inventory-prefix/0.1' as const,index:0,completedSteps:[],tableStates,catalog,metadata:{profile:'umf.table-inventory-metadata/0.1' as const,state:source?'published' as const:'pristine' as const},seedStates:structuredClone(seedStates)};
 refreshTableDefinitionDigests(initial);return initial;
}
/** Deterministic typed graph scheduler. It consumes source-derived effects and dependencies, never SQL text. */
export function scheduleTypedInventoryEffects(initial:Omit<PrefixFrame,'digest'>,effects:EffectNode[],edges:TypedDependency[],targetCatalog?:Record<string,Json[]>,metadataStepIds?:InventoryMetadataStepIds,provenanceMutations:CatalogMutation[]=[]):ScheduledInventoryEffects {
 if(!exact(initial,['profile','index','completedSteps','tableStates','catalog','metadata','seedStates'])||initial.profile!=='umf.table-inventory-prefix/0.1'||initial.index!==0||initial.completedSteps.length!==0||!Array.isArray(initial.tableStates)||!Array.isArray(initial.seedStates)||!exact(initial.metadata,['profile','state'])||initial.metadata.profile!=='umf.table-inventory-metadata/0.1'||!['pristine','published'].includes(initial.metadata.state)||initial.metadata.state==='pristine'&&(initial.tableStates.length!==0||Object.values(initial.catalog??{}).some(value=>Array.isArray(value)&&value.length!==0))||!exact(initial.catalog,['tables','columns','keys','checks','foreignKeys','indexes','policies','grants','comments'])||Object.values(initial.catalog).some(value=>!Array.isArray(value)))fail('INITIAL_PREFIX_SHAPE');
 if(!Array.isArray(effects)||effects.length>99999||!Array.isArray(edges)||edges.length>200000)fail('BOUND');const ids=new Set<string>();for(const effect of effects){validateEffect(effect);if(ids.has(effect.id))fail('DUPLICATE_STEP_ID');ids.add(effect.id);}
 const dependencies=stepDependencies(effects,edges,initial),groups=topo(effects,dependencies),ordered=groups.flat(),phases:ScheduledPhase[]=[{id:'phase-00001',kind:'prepare',transaction:'required',steps:metadataStepIds?[metadataStepIds.prepare]:[]},{id:'phase-00002',kind:'approval',transaction:'required',steps:metadataStepIds?[metadataStepIds.approval]:[]}],frames:PrefixFrame[]=[];
 const allowedByCollection=new Map<string,Set<string>>();for(const collection of collections){const allowed=new Set<string>();for(const row of [...initial.catalog[collection]!,...(targetCatalog?.[collection]??[])]){if(!obj(row)||!obj(row.identity))fail('SOURCE_CATALOG_SUBJECT');allowed.add(hashCanonical(row.identity));}allowedByCollection.set(collection,allowed);}
 for(const effect of effects){const collection=collectionFor(effect.subject);if(collection){const identity=hashCanonical(catalogIdentity(effect.subject));allowedByCollection.get(collection)!.add(identity);}if(effect.operation==='create-table'){const meaning=effect.transition.meaning as any,embedded=meaning?.embeddedCatalog;if(obj(embedded))for(const collection of ['columns','keys','checks'])if(Array.isArray(embedded[collection]))for(const row of embedded[collection]){if(!obj(row)||!obj(row.identity))fail('CREATE_EMBEDDED_SUBJECT');allowedByCollection.get(collection)!.add(hashCanonical(row.identity));}}}
 let before={...structuredClone(initial),index:0,completedSteps:[],digest:''} as PrefixFrame;before.digest=frameDigest({profile:before.profile,index:before.index,completedSteps:before.completedSteps,tableStates:before.tableStates,catalog:before.catalog,metadata:before.metadata,seedStates:before.seedStates});frames.push(before);
 const snapshot=(index:number,state:'pristine'|'pending'|'published'):PrefixFrame=>{const frame:PrefixFrame={profile:'umf.table-inventory-prefix/0.1',index,completedSteps:[...before.completedSteps],tableStates:structuredClone(before.tableStates),catalog:structuredClone(before.catalog),metadata:{profile:'umf.table-inventory-metadata/0.1',state},seedStates:structuredClone(before.seedStates),digest:''};frame.digest=frameDigest({profile:frame.profile,index:frame.index,completedSteps:frame.completedSteps,tableStates:frame.tableStates,catalog:frame.catalog,metadata:frame.metadata,seedStates:frame.seedStates});return frame;};
 before=snapshot(1,'pending');if(metadataStepIds)before.completedSteps=[metadataStepIds.prepare];before.digest=frameDigest({profile:before.profile,index:before.index,completedSteps:before.completedSteps,tableStates:before.tableStates,catalog:before.catalog,metadata:before.metadata,seedStates:before.seedStates});frames.push(before);before=snapshot(2,'pending');if(metadataStepIds)before.completedSteps=[metadataStepIds.prepare,metadataStepIds.approval];before.digest=frameDigest({profile:before.profile,index:before.index,completedSteps:before.completedSteps,tableStates:before.tableStates,catalog:before.catalog,metadata:before.metadata,seedStates:before.seedStates});frames.push(before);
 let completed:string[]=metadataStepIds?[metadataStepIds.prepare,metadataStepIds.approval]:[];let phaseIndex=2;
 let businessGroupIndex=0;for(const items of groups){const group={items};const kind=group.items.some(x=>x.operation==='create-concurrent-index')?'concurrent-index':group.items.some(x=>x.operation==='apply-backfill')&&group.items.some(x=>x.operation==='add-column')?'backfill-add':group.items.some(x=>x.operation==='validate'||x.operation==='add-not-valid')?'constraint-validation':group.items.some(x=>x.operation==='apply-seeds')?'seed':group.items.some(x=>x.operation==='apply-backfill')?'backfill-tighten':group.items.some(x=>x.operation==='convert-field'||x.operation==='capture-originals'||x.operation==='validate-conversion')?'field-conversion':group.items.some(x=>x.operation==='retire-field'||x.operation==='capture-retired-values')?'field-retirement':group.items.some(x=>x.operation==='restore-field'||x.operation==='validate-restoration')?'field-restoration':'transaction';
  const transaction=group.items[0]!.transaction;if(group.items.some(x=>x.transaction!==transaction))fail('ATOMIC_GROUP_TRANSACTION_MISMATCH');const phaseId=`phase-${String(phaseIndex+1).padStart(5,'0')}`;phaseIndex++;phases.push({id:phaseId,kind,transaction,steps:group.items.map(x=>x.id)});
  // Never mutate the already-emitted approval prefix while applying a group.
  const working=structuredClone(before);
  for(const effect of group.items){applyTransition(working,effect);completed=[...completed,effect.id];}
  if(businessGroupIndex===0&&provenanceMutations.length)applyCatalogMutationList(working,provenanceMutations);businessGroupIndex++;
  if(targetCatalog)orderCatalogFrame(working.catalog,targetCatalog,allowedByCollection);
  refreshTableDefinitionDigests(working);
  before=working;
  before=snapshot(frames.length,'pending');before.completedSteps=[...completed];before.digest=frameDigest({profile:before.profile,index:before.index,completedSteps:before.completedSteps,tableStates:before.tableStates,catalog:before.catalog,metadata:before.metadata,seedStates:before.seedStates});frames.push(before);before=snapshot(frames.length,'pending');
 }
 if(!groups.length&&provenanceMutations.length)fail('PROVENANCE_WITHOUT_BUSINESS_CARRIER');
 phases.push({id:`phase-${String(phaseIndex+1).padStart(5,'0')}`,kind:'publication',transaction:'required',steps:metadataStepIds?[metadataStepIds.publication]:[]});
 if(targetCatalog)assertExactTargetCatalog(before.catalog,targetCatalog);
 const published=snapshot(frames.length,'published');if(metadataStepIds)published.completedSteps=[...completed,metadataStepIds.publication];published.digest=frameDigest({profile:published.profile,index:published.index,completedSteps:published.completedSteps,tableStates:published.tableStates,catalog:published.catalog,metadata:published.metadata,seedStates:published.seedStates});frames.push(published);
 return {steps:ordered,phases,prefixes:frames};
}
