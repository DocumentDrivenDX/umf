// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Private R2 input admission primitives. These values are immutable source DATA,
 * not validated archive handles or comparison certificates. The module is not
 * re-exported from the table-migration public barrel.
 */
import {canonicalCharged,canonicalChargedHistory,sha256Text,sha256TextCharged,type CanonicalHistoryDocument,type CanonicalHistoryMemberSpan} from '../compilation/bundle/hash';
import {ownCanonicalComponent} from './inventory-component-copy';
import type {TableDeploymentBundle} from '../table-deployment';
import {projectG10BundleWithAccounting,type CatalogProjection,type InventoryProjection,type InventoryTable} from './inventory-projection';
import {sourceFieldMeaningFromIndex,sourceMappingPathFromIndex} from './inventory-g05-selection';
import type {
 TableInventoryArchiveSource,TableInventoryDiscoveryConversion,
 TableInventoryDiscoveryIntent,TableInventoryRetirement,
 TableInventorySourceHistory,
} from './inventory-options';
import {rowExpressionInputRefs} from '../extensions/tables/row-expressions';
import type {AccountingContext} from '../model/internal/accounting-context';

export type R2Json=null|boolean|number|string|R2Json[]|{[key:string]:R2Json};
export type R2Ref={module:string;element:string};
export type R2TargetCustody={profile:'umf.native-target-custody/0.1';custodianId:string;registrationId:string;resourceId:string;incarnation:string;registrationDigest:string};
export type TableArchiveRef={
 profile:'umf.retained-table-archive-ref/0.1';providerId:string;storeId:string;
 archiveId:string;lineageId:string;originalTableToken:string;
 originalPhysicalGeneration:string;targetCustody:R2TargetCustody;table:string;record:R2Ref;
 retirementPlanDigest:string;retirementSourceDigest:string;
 tableMeaningDigest:string;nativeDomainDigest:string;archiveSourceDigest:string;
};
export type TableArchiveMaterialKind='source'|'configuration'|'bundle'|'plan'|'source-meaning';
export type TableArchiveMaterial={kind:TableArchiveMaterialKind;sha256:string;bytes:string};
export type TableArchiveSource={archive:TableArchiveRef;materials:TableArchiveMaterial[]};
export type RetireIntent={kind:'retire';table:string;record:R2Ref;retention:{policyId:string;policyRevision:number;minimumRetentionMs:number}};
export type RestoreIntent={kind:'restore';table:string;record:R2Ref;archive:TableArchiveRef};
export type R2TableIntent=TableInventoryDiscoveryIntent|RetireIntent|RestoreIntent;
export type R2FieldArchiveRef={profile:'umf.retired-field-archive-ref/0.1';providerId:string;archiveId:string;tableToken:string;targetCustody:R2TargetCustody;retirementPlanDigest:string;retirementSourceDigest:string;fieldMeaningDigest:string};
export type R2NewInstances={mode:'refuse'}|{mode:'null'}|{mode:'fill';expression:import('../extensions/tables/types').RowExpression};
export type R2FieldRestoration={table:string;field:R2Ref;archive:R2FieldArchiveRef;newInstances:R2NewInstances};
export type R2LineageTarget={kind:'current-descendant';expectedTableToken:string}|{kind:'same-plan-restored-descendant';tableRestoreIntentIndex:number};
export type R2FieldArchiveLineage={profile:'umf.field-archive-lineage-selection/0.1';providerId:string;storeId:string;lineageId:string;originalTableToken:string;wholeTableArchive:TableArchiveRef;target:R2LineageTarget};
export type R2LineageFieldRestoration={profile:'umf.lineage-field-restoration/0.1';table:string;field:R2Ref;archive:R2FieldArchiveRef;newInstances:R2NewInstances;lineage:R2FieldArchiveLineage};
export type R2Restoration=R2FieldRestoration|R2LineageFieldRestoration;
/** Exact marker-free discovery selector .2; nested existing arrays retain their original types. */
export type R2DiscoverySelector={
 version:'umf.table-inventory-discovery/0.2';tableIntents:R2TableIntent[];
 conversions:TableInventoryDiscoveryConversion[];retiredSeedSets:string[];
 retirements:TableInventoryRetirement[];restorations:R2Restoration[];
 archiveSources:TableInventoryArchiveSource[];tableArchiveSources:TableArchiveSource[];
};

export const R2_WORK_LIMIT=1_000_000;
export const R2_SUBJECT_LIMIT=99_999;
export const R2_CONTEXT_BYTE_LIMIT=100_663_296;
const ownedShapeRegistrationToken=Symbol('r2-owned-shape-registration');
const registerOwnedShape=Symbol('r2-register-owned-shape');
const ownedHistoryRegistrationToken=Symbol('r2-owned-history-registration');
const registerOwnedHistory=Symbol('r2-register-owned-history');
const lookupOwnedHistory=Symbol('r2-lookup-owned-history');
const associateOwnedHistoryMember=Symbol('r2-associate-owned-history-member');
type OwnedHistoryDocument=CanonicalHistoryDocument&{readonly materialized:WeakMap<CanonicalHistoryMemberSpan,string>};
/**
 * Frozen deterministic work-event table for the D1 admission primitives.
 * Each visited JSON node/array slot/object key costs 1. Each 4096-byte UTF-8
 * block admitted, canonicalized, or prepared for hashing costs 1. Each
 * chronological history member costs 8; each whole-archive material record
 * costs 4; each retained review-subject slot costs 1. The counters are shared
 * across a context, distinct from byte ceilings, and never reset per archive.
 * Raw admission additionally charges before each atomic own-key call, by the
 * exact returned slot count before processing, and before each single-key
 * descriptor call. The native key array can exist before its size is known;
 * this is not an OS heap or total-attempt time bound.
 */
export const R2_WORK_EVENT_UNITS={
 jsonNode:1,jsonArraySlot:1,objectKey:1,utf8Block:1,historyMember:8,
 archiveMaterial:4,retainedSubject:1,rawOwnKeysCall:1,rawOwnKeysResult:1,ownPropertyDescriptor:1,
} as const;
const UTF8_BLOCK=4096;
export class R2WorkLimitError extends Error {
 constructor(readonly path:string,readonly dimension:'work'|'subjects'|'bytes'){
  super(`R2_CONTEXT_${dimension.toUpperCase()}_LIMIT:${path}`);
 }
}
/** Deterministic bounded counters shared by every D1 operation for one root. */
export class R2WorkMeter implements AccountingContext {
 private work=0;private subjects=0;private bytes=0;
 #ownedShapeMetadata=new WeakMap<object,readonly string[]>();
 #ownedHistoryMetadata=new WeakMap<object,OwnedHistoryDocument>();
 #ownedHistoryMembers=new WeakMap<object,{document:OwnedHistoryDocument;span:CanonicalHistoryMemberSpan}>();
 [registerOwnedShape](token:typeof ownedShapeRegistrationToken,owner:object,keys:readonly string[]):void{
  if(token!==ownedShapeRegistrationToken)throw new TypeError('R2_CONTEXT_SHAPE_OWNER');
  this.#ownedShapeMetadata.set(owner,keys);
 }
 [registerOwnedHistory](token:typeof ownedHistoryRegistrationToken,owner:object,document:CanonicalHistoryDocument):void{
  if(token!==ownedHistoryRegistrationToken||!Object.isFrozen(owner))throw new TypeError('R2_CONTEXT_HISTORY_OWNER');
  // Charge every entry before publishing any association, so an exhausted
  // meter cannot leave a partially registered history in this context.
  this.visit('r2-history-root-map-retention','/history');
  for(const member of document.members)this.visit('r2-history-member-map-retention',`/history/${member.kind}/${member.index}`);
  const owned=Object.freeze({...document,materialized:new WeakMap<object,string>()});this.#ownedHistoryMetadata.set(owner,owned);
  for(const member of document.members)this.#ownedHistoryMembers.set(member.value,{document:owned,span:member});
 }
 [lookupOwnedHistory](token:typeof ownedHistoryRegistrationToken,value:object):{root:OwnedHistoryDocument|undefined;member:{document:OwnedHistoryDocument;span:CanonicalHistoryMemberSpan}|undefined}{
  if(token!==ownedHistoryRegistrationToken)throw new TypeError('R2_CONTEXT_HISTORY_OWNER');return {root:this.#ownedHistoryMetadata.get(value),member:this.#ownedHistoryMembers.get(value)};
 }
 [associateOwnedHistoryMember](token:typeof ownedHistoryRegistrationToken,source:object,copy:object):void{
  if(token!==ownedHistoryRegistrationToken||!Object.isFrozen(copy))throw new TypeError('R2_CONTEXT_HISTORY_OWNER');const found=this.#ownedHistoryMembers.get(source);if(found){this.visit('r2-history-normalized-member-map-retention','/history/executions');this.#ownedHistoryMembers.set(copy,found);}
 }
 charge(event:string,count=1,path='/'):void{
  if(!Object.hasOwn(R2_WORK_EVENT_UNITS,event)||!Number.isSafeInteger(count)||count<0)throw new R2WorkLimitError(path,'work');
  this.work=this.nextWork(R2_WORK_EVENT_UNITS[event as keyof typeof R2_WORK_EVENT_UNITS]*count,path);
 }
 chargeBytes(count:number,path:string):void{
  if(!Number.isSafeInteger(count)||count<0||this.bytes+count>R2_CONTEXT_BYTE_LIMIT)throw new R2WorkLimitError(path,'bytes');
  const next=this.nextWork(Math.ceil(count/UTF8_BLOCK),path);this.bytes+=count;this.work=next;
 }
 chargeWorkBytes(count:number,path:string):void{
  if(!Number.isSafeInteger(count)||count<0)throw new R2WorkLimitError(path,'work');
  this.work=this.nextWork(Math.ceil(count/UTF8_BLOCK),path);
 }
 retainSubject(identityOrPath:unknown,path?:string):void{
  const subjectPath=path??String(identityOrPath);
  if(this.subjects+1>R2_SUBJECT_LIMIT)throw new R2WorkLimitError(subjectPath,'subjects');
  const next=this.nextWork(R2_WORK_EVENT_UNITS.retainedSubject,subjectPath);this.subjects++;this.work=next;
 }
 visit(_category:string,_path:string,count=1):void{this.charge('jsonNode',count,_path);}
 retainBytes(_domain:string,count:number,path:string):void{this.chargeBytes(count,path);}
 scanUtf8(text:string,path:string):number{const bytes=scalarUtf8Bytes(text);this.chargeBytes(bytes,path);return bytes;}
 appendCanonicalChunk(text:string,path:string):number{return this.scanUtf8(text,path);}
 snapshot():Readonly<{work:number;subjects:number;bytes:number}>{
  return Object.freeze({work:this.work,subjects:this.subjects,bytes:this.bytes});
 }
 private nextWork(increment:number,path:string):number{
  const next=this.work+increment;if(!Number.isSafeInteger(next)||next>R2_WORK_LIMIT)throw new R2WorkLimitError(path,'work');return next;
 }
}
function scalarUtf8Bytes(text:string):number{let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<0x80)bytes++;else if(c<0x800)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}return bytes;}

/** Canonical bytes for an exact, frozen R2-owned history root; not semantic validation. */
export function ownedR2HistoryByteLength(value:unknown,meter:R2WorkMeter,path='/history'):number|undefined{
 if(!value||typeof value!=='object')return undefined;meter.visit('r2-history-canonical-root-lookup',path);
 return meter[lookupOwnedHistory](ownedHistoryRegistrationToken,value).root?.byteLength;
}
/** Exact canonical member bytes for a member of a registered frozen history only. */
export function ownedR2HistoryMember(value:unknown,meter:R2WorkMeter,path='/history/member'):{readonly text:string;readonly byteLength:number}|undefined{
 if(!value||typeof value!=='object')return undefined;meter.visit('r2-history-canonical-member-lookup',path);
 const found=meter[lookupOwnedHistory](ownedHistoryRegistrationToken,value).member;if(!found)return undefined;const {document,span}=found;
 const cached=document.materialized.get(span);if(cached!==undefined)return {text:cached,byteLength:span.byteEnd-span.byteStart};
 const byteLength=span.byteEnd-span.byteStart;meter.retainBytes('r2-history-member-canonical-copy',byteLength,path);meter.visit('r2-history-member-canonical-map-retention',path);
 const text=document.text.slice(span.start,span.end);document.materialized.set(span,text);return {text,byteLength};
}

/** Fixed validator-constructor propagation for normalized execution wrappers. */
export function ownR2HistoryExecutionWrapper(source:unknown,meter:R2WorkMeter,path:string):{planDigest:unknown;entryDigest:unknown;seedOutcomes:unknown[]} {
 if(!isPlainRecord(source)||!Object.isFrozen(source)||Object.getOwnPropertySymbols(source).length!==0||Object.getOwnPropertyNames(source).length!==3)throw new TypeError(`R2_HISTORY_EXECUTION_SOURCE:${path}`);
 const read=(key:'planDigest'|'entryDigest'|'seedOutcomes'):unknown=>{const descriptor=Object.getOwnPropertyDescriptor(source,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw new TypeError(`R2_HISTORY_EXECUTION_SOURCE:${path}`);return descriptor.value;};
 const planDigest=read('planDigest'),entryDigest=read('entryDigest'),seedOutcomes=read('seedOutcomes');
 if(!Array.isArray(seedOutcomes)||!meter[lookupOwnedHistory](ownedHistoryRegistrationToken,source).member)throw new TypeError(`R2_HISTORY_EXECUTION_SOURCE:${path}`);
 meter.visit('r2-history-normalized-execution-copy',path,3);const copy=Object.freeze({planDigest,entryDigest,seedOutcomes});meter[associateOwnedHistoryMember](ownedHistoryRegistrationToken,source,copy);return copy;
}

function isPlainRecord(value:unknown):value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;
}
/** Preflight a JSON graph, charge it, then clone; rejects cycles/non-JSON before retaining. */
const MAX_JSON_VALUES=100_000,MAX_JSON_DEPTH=128;
// Capture these intrinsics once. Raw admission uses one atomic own-key result
// per unowned node; the exact result extent is charged before it is processed.
const capturedOwnKeys=Reflect.ownKeys;
const capturedGetOwnPropertyDescriptor=Object.getOwnPropertyDescriptor;
/** Descriptor-safe copy with the inherited core JSON shape/numeric/depth/value rules. */
function copyAdmittedJson(value:unknown,meter:R2WorkMeter,path:string):R2Json{
 const active=new Set<object>();let values=0;
 const visit=(current:unknown,currentPath:string,depth:number):R2Json=>{
  meter.charge('jsonNode',1,currentPath);
  if(++values>MAX_JSON_VALUES||depth>MAX_JSON_DEPTH)throw new TypeError(`R2_CONTEXT_JSON_LIMIT:${currentPath}`);
  if(current===null||typeof current==='string'||typeof current==='boolean'){
   if(typeof current==='string')meter.scanUtf8(current,currentPath);return current;
  }
  if(typeof current==='number'){
   if(!Number.isFinite(current)||Object.is(current,-0)||(Number.isInteger(current)&&!Number.isSafeInteger(current)))throw new TypeError(`R2_CONTEXT_NUMBER:${currentPath}`);return current;
  }
  if(typeof current!=='object')throw new TypeError(`R2_CONTEXT_NON_JSON:${currentPath}`);
  const object=current as object;if(active.has(object))throw new TypeError(`R2_CONTEXT_CYCLE:${currentPath}`);
  const array=Array.isArray(current),prototype=Object.getPrototypeOf(current);
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new TypeError(`R2_CONTEXT_PROTOTYPE:${currentPath}`);
  meter.charge('rawOwnKeysCall',1,currentPath);
  const keys=capturedOwnKeys(current);
  // The native array already exists at this point. Charge its exact extent,
  // including symbols and an array's length key, before descriptor work.
  meter.charge('rawOwnKeysResult',keys.length,currentPath);
  const possibleJsonProperties=keys.length-(array?1:0);
  if(possibleJsonProperties>MAX_JSON_VALUES-values)throw new TypeError(`R2_CONTEXT_JSON_LIMIT:${currentPath}`);
  active.add(object);
  try{
   const result:unknown[]=array?[]:Object.create(null);
   let ownedProperties=0;
   for(const rawKey of keys){
    if(typeof rawKey!=='string')throw new TypeError(`R2_CONTEXT_SYMBOL:${currentPath}`);
    const key=rawKey;
    meter.charge('ownPropertyDescriptor',1,currentPath);
    const descriptor=capturedGetOwnPropertyDescriptor(current,key);
    if(!descriptor)throw new TypeError(`R2_CONTEXT_DESCRIPTOR:${currentPath}`);
    if(array&&key==='length'){
     if(descriptor.enumerable||!Object.hasOwn(descriptor,'value')||descriptor.value!==(current as unknown[]).length)throw new TypeError(`R2_CONTEXT_DESCRIPTOR:${currentPath}`);
     continue;
    }
    if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw new TypeError(`R2_CONTEXT_DESCRIPTOR:${currentPath}`);
    if(array&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=0xffff_ffff||Number(key)>=(current as unknown[]).length))throw new TypeError(`R2_CONTEXT_ARRAY_PROPERTY:${currentPath}`);
    // Charge key bytes at the bounded container path before building the
    // potentially large child diagnostic path.
    if(!array)meter.scanUtf8(key,currentPath);
    const childPath=`${currentPath}/${key}`;
    meter.charge(array?'jsonArraySlot':'objectKey',1,childPath);
    const child=visit(descriptor.value,childPath,depth+1);
    if(array)result[Number(key)]=child;else Object.defineProperty(result,key,{value:child,enumerable:true,writable:true,configurable:true});
    ownedProperties++;
   }
   if(array&&ownedProperties!==(current as unknown[]).length)throw new TypeError(`R2_CONTEXT_SPARSE_ARRAY:${currentPath}`);
   // Reuse the already-charged intrinsic result as private key-order metadata;
   // no second raw-key carrier is created or exported.
   meter[registerOwnedShape](ownedShapeRegistrationToken,result,keys as string[]);
   return result as R2Json;
  }finally{active.delete(object);}
 };
 return visit(value,path,0);
}
type DeepReadonly<T>=T extends readonly (infer V)[]?readonly DeepReadonly<V>[]:T extends object?{readonly [K in keyof T]:DeepReadonly<T[K]>}:T;
export type R2OwnedHistoryEnvelope={readonly profile:'umf.table-inventory-source-history/0.1';readonly plans:readonly DeepReadonly<R2Json>[];readonly executions:readonly DeepReadonly<R2Json>[]};
function deepFreezeJson(value:R2Json,meter?:R2WorkMeter,path='/freeze'):void{
 const stack:{value:R2Json;path:string;exit:boolean}[]=[];meter?.charge('jsonNode',1,path);stack.push({value,path,exit:false});while(stack.length){const item=stack.pop()!;if(item.exit){Object.freeze(item.value);continue;}meter?.charge('jsonNode',1,item.path);meter?.charge('jsonArraySlot',1,item.path);stack.push({value:item.value,path:item.path,exit:true});if(Array.isArray(item.value)){for(let i=0;i<item.value.length;i++){meter?.charge('jsonArraySlot',1,`${item.path}/${i}`);stack.push({value:item.value[i]!,path:`${item.path}/${i}`,exit:false});}}else if(item.value!==null&&typeof item.value==='object'){for(const key in item.value){if(!Object.hasOwn(item.value,key))continue;meter?.charge('objectKey',1,`${item.path}/${key}`);stack.push({value:(item.value as {[key:string]:R2Json})[key]!,path:`${item.path}/${key}`,exit:false});}}}
}
export function snapshotR2Json<T extends R2Json>(value:T,meter:R2WorkMeter,path:string):{value:DeepReadonly<T>;canonical:string}{
 const owned=copyAdmittedJson(value,meter,path) as T;
 const text=canonicalCharged(owned,meter,path);
 deepFreezeJson(owned,meter,path);return {value:owned as DeepReadonly<T>,canonical:text};
}
/** Own/freeze/canonicalize the fixed R2 history root and retain exact direct-member spans. */
export function snapshotR2HistoryJson<T extends R2Json>(value:T,meter:R2WorkMeter,path='/history'):{value:DeepReadonly<T>;canonical:string}{
 const owned=copyAdmittedJson(value,meter,path) as T,document=canonicalChargedHistory(owned,meter,path);
 deepFreezeJson(owned,meter,path);
 if(isR2HistoryEnvelope(owned))meter[registerOwnedHistory](ownedHistoryRegistrationToken,owned,document);
 return {value:owned as DeepReadonly<T>,canonical:document.text};
}
/** Copy, canonicalize and freeze the complete history before registering exact member spans. */
export function ownR2HistoryComponent(value:unknown,meter:R2WorkMeter,path='/history'):{readonly value:R2OwnedHistoryEnvelope;readonly canonical:string;readonly byteLength:number}{
 const owned=ownCanonicalComponent(value,path,25_165_824,meter) as R2Json;
 if(!isR2HistoryEnvelope(owned))throw new TypeError(`R2_HISTORY_SHAPE:${path}`);
 const document=canonicalChargedHistory(owned,meter,path);deepFreezeJson(owned,meter,path);meter[registerOwnedHistory](ownedHistoryRegistrationToken,owned,document);
 return Object.freeze({value:owned as unknown as R2OwnedHistoryEnvelope,canonical:document.text,byteLength:document.byteLength});
}
function isR2HistoryEnvelope(value:unknown):value is Record<string,unknown>&{profile:'umf.table-inventory-source-history/0.1';plans:R2Json[];executions:R2Json[]}{
 return isPlainRecord(value)&&Object.keys(value).length===3&&Object.hasOwn(value,'profile')&&value.profile==='umf.table-inventory-source-history/0.1'&&Array.isArray(value.plans)&&Array.isArray(value.executions)&&value.plans.length<=128&&value.executions.length===value.plans.length;
}
export type R2FieldMeaningIndex={table:string;field:R2Ref;path:string;meaning:DeepReadonly<R2Json>};
export type R2BundleSourceIndex={bundle:DeepReadonly<TableDeploymentBundle>;tables:DeepReadonly<InventoryTable[]>;reviews:DeepReadonly<InventoryProjection[]>;projection:DeepReadonly<Omit<CatalogProjection,'sourcePaths'>>;sourcePaths:readonly {identity:string;path:string}[];fieldMeanings:readonly R2FieldMeaningIndex[]};
export type R2OwnedSourceData={
 readonly previous:DeepReadonly<TableDeploymentBundle>|null;readonly next:DeepReadonly<TableDeploymentBundle>;
 readonly previousIndex:DeepReadonly<R2BundleSourceIndex>|null;readonly nextIndex:DeepReadonly<R2BundleSourceIndex>;
 readonly history:DeepReadonly<TableInventorySourceHistory>;readonly selector:DeepReadonly<R2DiscoverySelector>;
 readonly meter:R2WorkMeter;readonly canonicalInputs:Readonly<{previous:string|null;next:string;history:string;selector:string}>;
};
/** Owned .2 source components only. No field denotes a verified history or capability. */
export type R2OwnedSourceComponents={
 readonly previous:DeepReadonly<TableDeploymentBundle>|null;
 readonly next:DeepReadonly<TableDeploymentBundle>;
 readonly history:DeepReadonly<TableInventorySourceHistory>;
 readonly selector:DeepReadonly<R2DiscoverySelector>;
 readonly meter:R2WorkMeter;
 readonly canonicalInputs:Readonly<{previous:string|null;next:string;history:string;selector:string}>;
};
type R2RawRequestComponents=readonly [previous:unknown,next:unknown,history:unknown,selector:unknown];
/** Reads only the fixed request envelope; child values stay raw until copied at their own roots. */
function admitR2RawRequestEnvelope(input:unknown,meter:R2WorkMeter):R2RawRequestComponents{
 if(input===null||typeof input!=='object'||Array.isArray(input))throw new TypeError('R2_INPUT_SHAPE:/');
 const prototype=Object.getPrototypeOf(input);
 if(prototype!==Object.prototype&&prototype!==null)throw new TypeError('R2_CONTEXT_PROTOTYPE:/');
 // Charge the fixed four-slot raw-reference carrier before construction. It is
 // an envelope staging record, not an owned copy of any component value.
 meter.charge('jsonNode',1,'/');meter.charge('jsonNode',1,'/components');meter.charge('jsonArraySlot',4,'/components');
 const components:unknown[]=[undefined,undefined,undefined,undefined];
 meter.charge('rawOwnKeysCall',1,'/');
 const keys=capturedOwnKeys(input);
 meter.charge('rawOwnKeysResult',keys.length,'/');
 if(keys.length!==4)throw new TypeError('R2_INPUT_SHAPE:/');
 let seen=0;
 for(const rawKey of keys){
  if(typeof rawKey!=='string')throw new TypeError('R2_CONTEXT_SYMBOL:/');
  let index=-1;
  if(rawKey==='previous')index=0;else if(rawKey==='next')index=1;else if(rawKey==='history')index=2;else if(rawKey==='selector')index=3;
  meter.charge('ownPropertyDescriptor',1,'/');
  const descriptor=capturedGetOwnPropertyDescriptor(input,rawKey);
  if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw new TypeError('R2_CONTEXT_DESCRIPTOR:/');
  if(index<0)throw new TypeError('R2_INPUT_SHAPE:/');
  meter.scanUtf8(rawKey,'/');meter.charge('objectKey',1,'/');
  components[index]=descriptor.value;seen|=1<<index;
 }
 if(seen!==15)throw new TypeError('R2_INPUT_SHAPE:/');
 return components as unknown as R2RawRequestComponents;
}
/**
 * Owns verified complete deployment source projections and supported original
 * an empty history (nonempty replay remains explicitly unsupported), plus a closed .2 selector snapshot. It deliberately
 * does not assert archive resolution or issue context-bound archive handles.
 */
export function ownR2SourceComponents(input:unknown,meter=new R2WorkMeter()):R2OwnedSourceComponents{
 // Safely admit the fixed envelope without applying a JSON component's node or
 // depth ceiling to the wrapper. Each referenced component is then owned once
 // at its original root, with its own value counter and the same shared meter.
 const [previousRaw,nextRaw,historyRaw,selectorRaw]=admitR2RawRequestEnvelope(input,meter);
 const previousSnapshot=previousRaw===null?null:snapshotR2Json(previousRaw as R2Json,meter,'/previous');
 const nextSnapshot=snapshotR2Json(nextRaw as R2Json,meter,'/next');
 const historySnapshot=snapshotR2HistoryJson(historyRaw as R2Json,meter,'/history');
 const selectorInputSnapshot=snapshotR2Json(selectorRaw as R2Json,meter,'/selector');
 const selector=parseR2DiscoverySelectorAdmitted(selectorInputSnapshot.value,meter);
 const history=historySnapshot.value as unknown as Record<string,unknown>;
 if(nextSnapshot.value===null||!exactRecord(history,['profile','plans','executions'])||history.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(history.plans)||!Array.isArray(history.executions)||history.plans.length>128||history.executions.length!==history.plans.length)throw new TypeError('R2_HISTORY_SHAPE:/history');
  for(let i=0;i<history.plans.length;i++)meter.charge('historyMember',1,`/history/plans/${i}`);
 for(let i=0;i<selector.tableArchiveSources.length;i++){
  const source=selector.tableArchiveSources[i]!;
  for(const material of source.materials){void material;meter.charge('archiveMaterial',1,`/selector/tableArchiveSources/${i}/materials`);}
 }
 const selectorSnapshot={value:selector as unknown as DeepReadonly<R2DiscoverySelector>,canonical:selectorInputSnapshot.canonical};
 if(previousSnapshot!==null&&!isSourceBundleEnvelope(previousSnapshot.value))throw new TypeError('R2_BUNDLE_ENVELOPE:/previous');
 if(!isSourceBundleEnvelope(nextSnapshot.value))throw new TypeError('R2_BUNDLE_ENVELOPE:/next');
 return Object.freeze({
  previous:(previousSnapshot===null?null:previousSnapshot.value) as DeepReadonly<TableDeploymentBundle>|null,
  next:nextSnapshot.value as DeepReadonly<TableDeploymentBundle>,
  history:historySnapshot.value as unknown as DeepReadonly<TableInventorySourceHistory>,
  selector:selectorSnapshot.value,meter,
  canonicalInputs:Object.freeze({previous:previousSnapshot?.canonical??null,next:nextSnapshot.canonical,history:historySnapshot.canonical,selector:selectorSnapshot.canonical}),
 });
}
function isSourceBundleEnvelope(value:unknown):value is Record<string,unknown>{
 return exactRecord(value,['version','canonicalization','source','sourceDigest','configuration','configurationDigest','module','profile','steps','expectedCatalog','seedSets','bundleDigest','nativeQualified']);
}
/** Source-only compatibility snapshot. It is data, never a registered issuer/capability. */
export function snapshotR2SourceData(input:unknown,meter=new R2WorkMeter()):R2OwnedSourceData{
 const owned=ownR2SourceComponents(input,meter);
 if(owned.history.plans.length!==0)throw new TypeError('R2_UNSUPPORTED_METERED_HISTORY:/history/plans');
 const previousInput=owned.previous,nextInput=owned.next;
 // The inputs were already descriptor-admitted above. This additional charge
 // Both bundles are immutable JSON-owned values from the request admission;
 // the verifier below charges its own exact source/configuration/compiler path.
 const nextProjection=projectG10BundleWithAccounting(nextInput,'next',meter);
 const previousProjection=previousInput===null?null:projectG10BundleWithAccounting(previousInput,'previous',meter);
 if(nextProjection.bundle.source.format!=='json'||(previousProjection!==null&&previousProjection.bundle.source.format!=='json'))throw new TypeError('R2_JSON_SOURCE_REQUIRED:/source/format');
 const nextIndex=freezeSourceIndex(nextProjection,meter,'/next/index'),previousIndex=previousProjection===null?null:freezeSourceIndex(previousProjection,meter,'/previous/index');void nextIndex;void previousIndex;
 // Projection work is now transposed through the target's source-owned
 // projection leaf. Context issuance remains fail-closed until prepared history
 // and all G10 evidence are consumed under this same meter.
 throw new TypeError('R2_UNSUPPORTED_METERED_CATALOG_PROJECTION:/next');
}

export function freezeSourceIndex(result:ReturnType<typeof projectG10BundleWithAccounting>,meter:R2WorkMeter,path:string):DeepReadonly<R2BundleSourceIndex>{
 const sourcePaths:{identity:string;path:string}[]=[];for(const [identity,sourcePath]of result.projection.sourcePaths){meter.charge('jsonArraySlot',1,`${path}/sourcePaths`);const itemPath=`${path}/sourcePaths/${sourcePaths.length}`;meter.charge('jsonNode',1,itemPath);meter.charge('objectKey',2,itemPath);const sourcePathEntry={identity,path:sourcePath};const item=copyAdmittedJson(sourcePathEntry,meter,itemPath) as unknown as {identity:string;path:string};sourcePaths.push(item);}
 meter.charge('jsonNode',1,`${path}/projection`);meter.charge('objectKey',5,`${path}/projection`);const projection={catalog:result.projection.catalog,dependencies:result.projection.dependencies,operations:result.projection.operations,rendererOperations:result.projection.rendererOperations,seedStates:result.projection.seedStates};
 const fieldMeanings:R2FieldMeaningIndex[]=[];for(let index=0;index<result.bundle.expectedCatalog.columns.length;index++){const column=result.bundle.expectedCatalog.columns[index]!;
  const meaning=sourceFieldMeaningFromIndex(result.sourceIndex,column.table,column.field,meter);const sourcePath=sourceMappingPathFromIndex(result.sourceIndex,column.table,column.field);
  if(meaning===null||sourcePath===null)throw new TypeError(`R2_FIELD_SOURCE_MISSING:${path}/expectedCatalog/columns/${index}`);
  meter.charge('jsonArraySlot',1,`${path}/fieldMeanings`);const itemPath=`${path}/fieldMeanings/${index}`;meter.charge('jsonNode',1,itemPath);meter.charge('objectKey',4,itemPath);const item:R2FieldMeaningIndex={table:column.table,field:column.field,path:sourcePath,meaning};fieldMeanings.push(item);
 }
 const bundle=result.bundle,tables=result.tables,reviews=result.reviews;
 meter.charge('jsonNode',1,path);meter.charge('objectKey',6,path);const value={bundle,tables,reviews,projection,sourcePaths,fieldMeanings} as unknown as R2Json;
 const owned=value;
 canonicalCharged(owned,meter,path);
 deepFreezeJson(owned,meter,path);return owned as unknown as DeepReadonly<R2BundleSourceIndex>;
}
/** Build a side-specific index wrapper while borrowing an already frozen exact-content core. */
export function freezeSourceIndexSide(result:ReturnType<typeof projectG10BundleWithAccounting>,core:DeepReadonly<R2BundleSourceIndex>,meter:R2WorkMeter,path:string):DeepReadonly<R2BundleSourceIndex>{
 meter.charge('jsonNode',1,path);meter.charge('objectKey',6,path);
 for(const key of ['bundle','tables','reviews','projection','sourcePaths','fieldMeanings'])meter.scanUtf8(key,`${path}/@key`);
 canonicalCharged(result.reviews as unknown as R2Json,meter,`${path}/reviews`);
 deepFreezeJson(result.reviews as unknown as R2Json,meter,`${path}/reviews`);
 const value=Object.freeze({...core,reviews:result.reviews});return value as unknown as DeepReadonly<R2BundleSourceIndex>;
}
function deepFreezeBundle(bundle:TableDeploymentBundle,meter:R2WorkMeter,path:string):DeepReadonly<TableDeploymentBundle>{
 deepFreezeJson(bundle as unknown as R2Json,meter,path);return bundle as DeepReadonly<TableDeploymentBundle>;
}
const DISCOVERY_KEYS=['version','tableIntents','conversions','retiredSeedSets','retirements','restorations','archiveSources','tableArchiveSources'] as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
function shape(ok:unknown,path:string,code='SELECTOR_SHAPE'):asserts ok{if(!ok)throw new TypeError(`R2_${code}:${path}`);}
function exactRecord(value:unknown,keys:readonly string[]):value is Record<string,unknown>{return isPlainRecord(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function boundedText(value:unknown,maxBytes:number):value is string{return typeof value==='string'&&value.length>0&&value.length<=maxBytes&&!value.includes('\0')&&scalarUtf8Bytes(value)<=maxBytes;}
function r2Ref(value:unknown,path:string):asserts value is R2Ref{
 shape(exactRecord(value,['module','element'])&&boundedText(value.module,256)&&boundedText(value.element,256),path,'REF');
}
function targetCustodyShape(value:unknown,path:string):asserts value is R2TargetCustody{
 const keys=['profile','custodianId','registrationId','resourceId','incarnation','registrationDigest'];
 shape(exactRecord(value,keys)&&value.profile==='umf.native-target-custody/0.1'&&['custodianId','registrationId','resourceId','incarnation'].every(key=>typeof value[key]==='string'&&UUID.test(value[key] as string))&&typeof value.registrationDigest==='string'&&SHA.test(value.registrationDigest),path,'TARGET_CUSTODY');
}
function tableArchiveRef(value:unknown,path:string):asserts value is TableArchiveRef{
 const keys=['profile','providerId','storeId','archiveId','lineageId','originalTableToken','originalPhysicalGeneration','targetCustody','table','record','retirementPlanDigest','retirementSourceDigest','tableMeaningDigest','nativeDomainDigest','archiveSourceDigest'];
 shape(exactRecord(value,keys)&&value.profile==='umf.retained-table-archive-ref/0.1',path,'TABLE_ARCHIVE_REF');
 const ref=value as Record<string,unknown>;
 for(const key of ['providerId','storeId','archiveId','lineageId','originalTableToken','originalPhysicalGeneration'])shape(typeof ref[key]==='string'&&UUID.test(ref[key] as string),`${path}/${key}`,'TABLE_ARCHIVE_REF');
 shape(boundedText(ref.table,256),`${path}/table`,'TABLE_ARCHIVE_REF');
 r2Ref(ref.record,`${path}/record`);
 for(const key of ['retirementPlanDigest','retirementSourceDigest','tableMeaningDigest','nativeDomainDigest','archiveSourceDigest'])shape(typeof ref[key]==='string'&&SHA.test(ref[key] as string),`${path}/${key}`,'TABLE_ARCHIVE_REF');
 targetCustodyShape(ref.targetCustody,`${path}/targetCustody`);
}
function tableArchiveSources(value:unknown,path:string,meter?:R2WorkMeter):asserts value is TableArchiveSource[]{
 shape(Array.isArray(value)&&value.length<=64,path,'TABLE_ARCHIVE_SOURCES');
 const entries=value as unknown[];
 const keys=['source','configuration','bundle','plan','source-meaning'];
 const seen=new Set<string>();let total=0;
 entries.forEach((entry,index)=>{
  const p=`${path}/${index}`;shape(exactRecord(entry,['archive','materials']),p,'TABLE_ARCHIVE_SOURCE');const row=entry as Record<string,unknown>;tableArchiveRef(row.archive,`${p}/archive`);const archive=row.archive as TableArchiveRef;
  const identity=JSON.stringify([archive.providerId,archive.archiveId]);shape(!seen.has(identity),`${p}/archive`,'TABLE_ARCHIVE_DUPLICATE');seen.add(identity);
  shape(Array.isArray(row.materials)&&row.materials.length===5,`${p}/materials`,'TABLE_ARCHIVE_MATERIALS');
  const kinds=new Set<string>(),materials=row.materials as unknown[];
  materials.forEach((material:unknown,materialIndex:number)=>{
   const mp=`${p}/materials/${materialIndex}`;shape(exactRecord(material,['kind','sha256','bytes']),mp,'TABLE_ARCHIVE_MATERIAL');const item=material as Record<string,unknown>;
   const expected=keys[materialIndex];shape(item.kind===expected,`${mp}/kind`,'TABLE_ARCHIVE_MATERIAL_ORDER');shape(typeof item.kind==='string'&&!kinds.has(item.kind),`${mp}/kind`,'TABLE_ARCHIVE_MATERIAL_DUPLICATE');kinds.add(item.kind as string);
   shape(typeof item.sha256==='string'&&SHA.test(item.sha256),`${mp}/sha256`,'TABLE_ARCHIVE_MATERIAL_DIGEST');
   shape(typeof item.bytes==='string'&&/^(?:[A-Za-z0-9_-]{4})*(?:(?:[A-Za-z0-9_-][AQgw])|(?:[A-Za-z0-9_-]{2}[AEIMQUYcgkosw048]))?$/.test(item.bytes),`${mp}/bytes`,'TABLE_ARCHIVE_MATERIAL_BASE64URL');
   const encoded=item.bytes as string,rem=encoded.length%4;
   const decodedLength=Math.floor(encoded.length*3/4);
   // Canonical unpadded base64url admits no one-character tail. The final
   // alphabet above enforces the unused low bits for two/three-character tails.
   shape(rem!==1,`${mp}/bytes`,'TABLE_ARCHIVE_MATERIAL_BASE64URL');
   shape(decodedLength<=25_165_824,`${mp}/bytes`,'TABLE_ARCHIVE_MATERIAL_SIZE');
   if(item.kind==='source'||item.kind==='bundle')shape(decodedLength<=16_777_216,`${mp}/bytes`,'TABLE_ARCHIVE_SOURCE_SIZE');
   total+=decodedLength;shape(total<=67_108_864,path,'TABLE_ARCHIVE_TOTAL_SIZE');
  });
 });
}
function fieldArchiveRef(value:unknown,path:string):asserts value is R2FieldArchiveRef{
 const keys=['profile','providerId','archiveId','tableToken','targetCustody','retirementPlanDigest','retirementSourceDigest','fieldMeaningDigest'];
 shape(exactRecord(value,keys)&&value.profile==='umf.retired-field-archive-ref/0.1',path,'FIELD_ARCHIVE_REF');const archive=value as Record<string,unknown>;
 for(const key of ['providerId','archiveId','tableToken'])shape(typeof archive[key]==='string'&&UUID.test(archive[key] as string),`${path}/${key}`,'FIELD_ARCHIVE_REF');
 for(const key of ['retirementPlanDigest','retirementSourceDigest','fieldMeaningDigest'])shape(typeof archive[key]==='string'&&SHA.test(archive[key] as string),`${path}/${key}`,'FIELD_ARCHIVE_REF');
 targetCustodyShape(archive.targetCustody,`${path}/targetCustody`);
}
function fieldNewInstances(value:unknown,path:string):asserts value is R2NewInstances{
 if(isPlainRecord(value)&&value.mode==='refuse')shape(exactRecord(value,['mode']),path,'FIELD_NEW_INSTANCES');
 else if(isPlainRecord(value)&&value.mode==='null')shape(exactRecord(value,['mode']),path,'FIELD_NEW_INSTANCES');
 else if(isPlainRecord(value)&&value.mode==='fill'&&exactRecord(value,['mode','expression'])){
  try{rowExpressionInputRefs(value.expression as import('../extensions/tables/types').RowExpression);}catch{shape(false,`${path}/expression`,'FIELD_FILL_EXPRESSION');}
 }else shape(false,path,'FIELD_NEW_INSTANCES');
}
function fieldRestoration(value:unknown,path:string,index:number,tableIntents:readonly unknown[]):asserts value is R2Restoration{
 const common=['table','field','archive','newInstances'];shape(isPlainRecord(value),path,'FIELD_RESTORATION');const row=value as Record<string,unknown>;
 shape(boundedText(row.table,256),`${path}/table`,'FIELD_RESTORATION');r2Ref(row.field,`${path}/field`);fieldArchiveRef(row.archive,`${path}/archive`);fieldNewInstances(row.newInstances,`${path}/newInstances`);
 if(exactRecord(value,common))return;
 shape(exactRecord(value,['profile',...common,'lineage'])&&row.profile==='umf.lineage-field-restoration/0.1',path,'LINEAGE_FIELD_RESTORATION');
 const lineage=row.lineage;shape(exactRecord(lineage,['profile','providerId','storeId','lineageId','originalTableToken','wholeTableArchive','target'])&&lineage.profile==='umf.field-archive-lineage-selection/0.1',`${path}/lineage`,'FIELD_ARCHIVE_LINEAGE');const source=lineage as Record<string,unknown>;
 for(const key of ['providerId','storeId','lineageId','originalTableToken'])shape(typeof source[key]==='string'&&UUID.test(source[key] as string),`${path}/lineage/${key}`,'FIELD_ARCHIVE_LINEAGE');
 tableArchiveRef(source.wholeTableArchive,`${path}/lineage/wholeTableArchive`);
 const target=source.target;
 if(isPlainRecord(target)&&target.kind==='current-descendant')shape(exactRecord(target,['kind','expectedTableToken'])&&typeof target.expectedTableToken==='string'&&UUID.test(target.expectedTableToken),`${path}/lineage/target`,'FIELD_ARCHIVE_TARGET');
 else if(isPlainRecord(target)&&target.kind==='same-plan-restored-descendant'){
  shape(exactRecord(target,['kind','tableRestoreIntentIndex'])&&Number.isSafeInteger(target.tableRestoreIntentIndex)&&Number(target.tableRestoreIntentIndex)>=0&&Number(target.tableRestoreIntentIndex)<tableIntents.length,`${path}/lineage/target`,'FIELD_ARCHIVE_TARGET');
  const intent=tableIntents[Number(target.tableRestoreIntentIndex)];shape(isPlainRecord(intent)&&intent.kind==='restore'&&intent.table===row.table,`${path}/lineage/target/tableRestoreIntentIndex`,'FIELD_ARCHIVE_TARGET_BINDING');
 }else shape(false,`${path}/lineage/target`,'FIELD_ARCHIVE_TARGET');
}
/**
 * Structural parser for the private .2 discovery selector. It validates the
 * closed envelope, new intent/ref/material grammar and bounds. Existing G05
 * child records are still subject to their original semantic validator when a
 * complete request/source context exists.
 */
export function parseR2DiscoverySelectorShape(value:unknown,meter?:R2WorkMeter):R2DiscoverySelector{
 const admissionMeter=meter??new R2WorkMeter();
 const owned=snapshotR2Json(value as R2Json,admissionMeter,'/selector').value;
 return parseR2DiscoverySelectorAdmitted(owned,meter);
}
/** Shape-only parser for the immutable graph admitted at the public unknown boundary. */
function parseR2DiscoverySelectorAdmitted(value:unknown,meter?:R2WorkMeter):R2DiscoverySelector{
 shape(exactRecord(value,DISCOVERY_KEYS)&&value.version==='umf.table-inventory-discovery/0.2','/selector','SELECTOR_PROFILE_OR_KEYS');
 const selector=value as Record<string,unknown>;
 const caps:Record<string,number>={tableIntents:512,conversions:256,retiredSeedSets:256,retirements:256,restorations:256,archiveSources:64};
 for(const [key,maximum] of Object.entries(caps))shape(Array.isArray(selector[key])&&(selector[key] as unknown[]).length<=maximum,`/selector/${key}`,'SELECTOR_ARRAY_BOUND');
 shape(Array.isArray(selector.tableArchiveSources)&&selector.tableArchiveSources.length<=64,'/selector/tableArchiveSources','SELECTOR_ARRAY_BOUND');
 const tableIntents=selector.tableIntents as unknown[];
 shape(tableIntents.filter(item=>isPlainRecord(item)&&item.kind==='create').length<=256&&tableIntents.filter(item=>isPlainRecord(item)&&item.kind==='remove').length<=256&&tableIntents.filter(item=>isPlainRecord(item)&&item.kind==='retire').length<=256&&tableIntents.filter(item=>isPlainRecord(item)&&item.kind==='restore').length<=256,'/selector/tableIntents','TABLE_INTENT_BOUND');
 const seenIntents=new Set<string>();
 tableIntents.forEach((intent,index)=>{
  const path=`/selector/tableIntents/${index}`;if(!isPlainRecord(intent))shape(false,path,'TABLE_INTENT');const row=intent as Record<string,unknown>;shape(boundedText(row.table,256),`${path}/table`,'TABLE_INTENT');r2Ref(row.record,`${path}/record`);const intentKey=JSON.stringify([row.kind,row.table]);shape(!seenIntents.has(intentKey),path,'TABLE_INTENT_DUPLICATE');seenIntents.add(intentKey);
  if(row.kind==='create')shape(exactRecord(row,['kind','table','record']),path,'TABLE_INTENT');
  else if(row.kind==='remove')shape(exactRecord(row,['kind','table','record','disposition'])&&exactRecord(row.disposition,['mode'])&&row.disposition.mode==='irreversible-purge',path,'TABLE_INTENT');
  else if(row.kind==='retire')shape(exactRecord(row,['kind','table','record','retention'])&&exactRecord(row.retention,['policyId','policyRevision','minimumRetentionMs'])&&boundedText(row.retention.policyId,128)&&Number.isSafeInteger(row.retention.policyRevision)&&Number(row.retention.policyRevision)>0&&Number.isSafeInteger(row.retention.minimumRetentionMs)&&Number(row.retention.minimumRetentionMs)>=0&&Number(row.retention.minimumRetentionMs)<=315_360_000_000,path,'TABLE_INTENT');
  else if(row.kind==='restore'){shape(exactRecord(row,['kind','table','record','archive']),path,'TABLE_INTENT');tableArchiveRef(row.archive,`${path}/archive`);}
  else shape(false,`${path}/kind`,'TABLE_INTENT_KIND');
 });
 const conversions=selector.conversions as unknown[];
 conversions.forEach((conversion,index)=>{
  const path=`/selector/conversions/${index}`;shape(exactRecord(conversion,['table','field','recipe','nulls','invalid','recovery']),path,'CONVERSION');const row=conversion as Record<string,unknown>;
  shape(boundedText(row.table,256),path,'CONVERSION');r2Ref(row.field,`${path}/field`);shape(row.nulls==='preserve'&&row.invalid==='abort',path,'CONVERSION');
  shape(exactRecord(row.recipe,['version','kind','parameters'])&&row.recipe.version==='umf.conversion-recipe/0.1'&&isPlainRecord(row.recipe.parameters),`${path}/recipe`,'CONVERSION_RECIPE');const recipe=row.recipe as Record<string,unknown>,parameters=recipe.parameters as Record<string,unknown>;
  const emptyKinds=['numeric-exact','text-date','date-text','text-instant','instant-text','text-uuid','uuid-text'];
  if(emptyKinds.includes(String(recipe.kind)))shape(Object.keys(parameters).length===0,`${path}/recipe/parameters`,'CONVERSION_PARAMETERS');
  else if(recipe.kind==='numeric-rescale')shape(exactRecord(parameters,['rounding'])&&['half-even','toward-zero'].includes(String(parameters.rounding)),`${path}/recipe/parameters`,'CONVERSION_PARAMETERS');
  else if(recipe.kind==='date-instant')shape(exactRecord(parameters,['at','offset'])&&parameters.at==='00:00:00'&&parameters.offset==='Z',`${path}/recipe/parameters`,'CONVERSION_PARAMETERS');
  else if(recipe.kind==='instant-date')shape(exactRecord(parameters,['time','offset'])&&['require-midnight','discard'].includes(String(parameters.time))&&parameters.offset==='Z',`${path}/recipe/parameters`,'CONVERSION_PARAMETERS');
  else if(recipe.kind==='text-boolean'||recipe.kind==='boolean-text')shape(exactRecord(parameters,['trueToken','falseToken'])&&boundedText(parameters.trueToken,128)&&boundedText(parameters.falseToken,128)&&parameters.trueToken!==parameters.falseToken,`${path}/recipe/parameters`,'CONVERSION_PARAMETERS');
  else shape(false,`${path}/recipe/kind`,'CONVERSION_KIND');
  const recovery=row.recovery;
  if(isPlainRecord(recovery)&&recovery.mode==='irreversible')shape(exactRecord(recovery,['mode']),`${path}/recovery`,'CONVERSION_RECOVERY');
  else if(isPlainRecord(recovery)&&recovery.mode==='retained-originals')shape(exactRecord(recovery,['mode','policy'])&&exactRecord(recovery.policy,['id','revision'])&&boundedText(recovery.policy.id,256)&&boundedText(recovery.policy.revision,256),`${path}/recovery`,'CONVERSION_RECOVERY');
  else if(isPlainRecord(recovery)&&recovery.mode==='round-trip')shape(exactRecord(recovery,['mode','proofProfile'])&&recovery.proofProfile==='umf.exact-integer-widening-roundtrip/0.1',`${path}/recovery`,'CONVERSION_RECOVERY');
  else shape(false,`${path}/recovery`,'CONVERSION_RECOVERY');
 });
 const seeds=selector.retiredSeedSets as unknown[],seedIds=new Set<string>();seeds.forEach((seed,index)=>{shape(boundedText(seed,256),`/selector/retiredSeedSets/${index}`,'SEED_ID');shape(!seedIds.has(seed as string),`/selector/retiredSeedSets/${index}`,'SEED_DUPLICATE');seedIds.add(seed as string);});
 (selector.retirements as unknown[]).forEach((entry,index)=>{
  const path=`/selector/retirements/${index}`;shape(exactRecord(entry,['table','field','retention']),path,'FIELD_RETIREMENT');const row=entry as Record<string,unknown>;shape(boundedText(row.table,256),path,'FIELD_RETIREMENT');r2Ref(row.field,`${path}/field`);shape(exactRecord(row.retention,['policyId','policyRevision','minimumRetentionMs']),`${path}/retention`,'FIELD_RETENTION');const retention=row.retention as Record<string,unknown>;shape(boundedText(retention.policyId,128)&&Number.isSafeInteger(retention.policyRevision)&&Number(retention.policyRevision)>0&&Number.isSafeInteger(retention.minimumRetentionMs)&&Number(retention.minimumRetentionMs)>=0&&Number(retention.minimumRetentionMs)<=315_360_000_000,`${path}/retention`,'FIELD_RETENTION');
 });
 (selector.restorations as unknown[]).forEach((entry,index)=>{
  fieldRestoration(entry,`/selector/restorations/${index}`,index,tableIntents);
 });
 let g05Bytes=0;(selector.archiveSources as unknown[]).forEach((entry,index)=>{const path=`/selector/archiveSources/${index}`;shape(exactRecord(entry,['digest','source']),path,'FIELD_ARCHIVE_SOURCE');const row=entry as Record<string,unknown>;shape(typeof row.digest==='string'&&SHA.test(row.digest)&&exactRecord(row.source,['format','utf8'])&&row.source.format==='json'&&typeof row.source.utf8==='string',path,'FIELD_ARCHIVE_SOURCE');const source=row.source as Record<string,unknown>,utf8=source.utf8 as string;const size=scalarUtf8Bytes(utf8);shape(size<=1_048_576,`${path}/source/utf8`,'FIELD_ARCHIVE_SOURCE_SIZE');shape((meter?sha256TextCharged(utf8,1_048_576,meter,`${path}/digest`):sha256Text(utf8,1_048_576))===row.digest,`${path}/digest`,'FIELD_ARCHIVE_SOURCE_DIGEST');g05Bytes+=size;shape(g05Bytes<=4_194_304,`/selector/archiveSources`,'FIELD_ARCHIVE_SOURCE_AGGREGATE');});
 tableArchiveSources(selector.tableArchiveSources,'/selector/tableArchiveSources',meter);
 return selector as unknown as R2DiscoverySelector;
}
