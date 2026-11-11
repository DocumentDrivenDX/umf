// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';

export type BulkJobStatus='queued'|'running'|'reconciling'|'completed'|'stopped'|'cancelled';
export interface BulkClaim {batch:number;fence:string;effectAdmitted:boolean}
export interface BulkJobState {status:BulkJobStatus;batchCount:number;nextBatch:number;committedBatches:number;fence:string;claim:BulkClaim|null;cancelRequested:boolean;stop:{batch:number;code:string}|null}
export type BulkReconcileEvidence='committed'|'noncommit-admitted'|'receipt-not-found'|'native-status-null'|'lease-expired'|'session-changed'|'unavailable';
export type BulkEvent=
 |{kind:'submit';batchCount:number}|{kind:'claim'}|{kind:'execute';batch:number;fence:string}|{kind:'commit'}
 |{kind:'failure';failure:'conflict'|'rejected'|'authorization-loss'|'known-failure';code:string}
 |{kind:'lose-custody'}|{kind:'reconcile';evidence:BulkReconcileEvidence}
 |{kind:'expire-claim';confirmedNoExecution:boolean}|{kind:'cancel'}|{kind:'resume'};
export type BulkTransitionResult={ok:true;state:BulkJobState;basis?:string}|{ok:false;code?:string};
export interface BulkDecisionInput {delegation:'valid'|'missing'|'expired'|'human-lost';guards:'pass'|'changed'|'deleted'|'rebound';guardItem?:number;tx1:{decision:'committed'|'conflict'|'rejected'|'entity-missing';code?:string;item?:number}|null}
export interface BulkDecision {status:'denied'|'conflict'|'rejected'|'committed';code?:string;item?:number;tx1Invoked:boolean;itemOutcome:boolean;qualificationFault?:boolean}

type NativeFamily={['bulk-actions']:{applyBulkEvent(fields:{state:BulkJobState|null;event:BulkEvent}):unknown;bulkDecisionOrder(fields:{input:BulkDecisionInput}):unknown;nextBulkFence(fields:{fence:string}):unknown;bulkItemToken(fields:{namespace:string;id:string;batch:number;item:number}):unknown;parseBulkItemToken(fields:{key:string}):unknown;isReservedBulkKey(fields:{key:string}):unknown;checkBulkKeyUse(fields:{key:string;viaBulk:boolean}):unknown}};
type Guard=(value:unknown)=>boolean;
function invoke<T>(isNative:Guard,run:()=>unknown):T {
 try {
  const result=run();
  // The generic wire decodes into null-prototype objects. The public bulk
  // result is a plain structured-cloned object, including retained state.
  return (result!==null&&typeof result==='object'?structuredClone(result):result) as T;
 } catch(error) {
  if(!isNative(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code==='string'&&(native.code.startsWith('PAP_')||native.code==='REQUEST'||native.code==='LIMIT')){
   throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  }
  throw error;
 }
}
const hasOwn=(value:object,key:PropertyKey):boolean=>Object.prototype.hasOwnProperty.call(value,key);
function ownData(value:object,key:PropertyKey):{present:boolean;value:unknown}{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor&&hasOwn(descriptor,'value')?{present:true,value:descriptor.value}:{present:false,value:undefined};}
function withoutUndefined(value:unknown,names:readonly string[]):unknown {
 if(value===null||typeof value!=='object'||Array.isArray(value))return value;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 let changed=false;
 for(const name of names){
  const descriptor=descriptors[name];
  if(descriptor?.enumerable&&hasOwn(descriptor,'value')&&descriptor.value===undefined){
   delete descriptors[name];
   changed=true;
  }
 }
 return changed?Object.create(Object.getPrototypeOf(value),descriptors):value;
}
function normalizeDecisionInput(input:BulkDecisionInput):BulkDecisionInput {
 const tx1Field=ownData(input,'tx1');
 if(!tx1Field.present||tx1Field.value===null||typeof tx1Field.value!=='object')return withoutUndefined(input,['guardItem']) as BulkDecisionInput;
 const tx1=withoutUndefined(tx1Field.value,['code','item']);
 const outer=withoutUndefined(input,['guardItem']) as BulkDecisionInput;
 if(tx1!==tx1Field.value){
  const descriptors:PropertyDescriptorMap=Object.getOwnPropertyDescriptors(outer);
  descriptors.tx1={...descriptors.tx1,value:tx1};
  return Object.create(Object.getPrototypeOf(outer),descriptors) as BulkDecisionInput;
 }
 return outer;
}
/** All bulk control semantics execute in the shared Rust engine. */
export function createBulkActionsRustDefault(engine:NativeFamily,isNative:Guard){const family=engine['bulk-actions'];return Object.freeze({
 applyBulkEvent(state:BulkJobState|null,event:BulkEvent):BulkTransitionResult{return invoke(isNative,()=>family.applyBulkEvent({state,event})) as BulkTransitionResult;},
 bulkDecisionOrder(input:BulkDecisionInput):BulkDecision{
  const nativeInput=normalizeDecisionInput(input);
  const value=invoke(isNative,()=>family.bulkDecisionOrder({input:nativeInput})) as BulkDecision;
  const tx1=ownData(input,'tx1').value;
  if(value.tx1Invoked&&typeof tx1==='object'&&tx1!==null){
   for(const key of ['code','item'] as const){
    if((value[key] as unknown)===null&&ownData(tx1,key).value===undefined){
     Object.defineProperty(value,key,{value:undefined});
    }
   }
  }
  return value;
 },
 nextBulkFence(fence:string):string{return invoke(isNative,()=>family.nextBulkFence({fence})) as string;},
 bulkItemToken(namespace:string,id:string,batch:number,item:number):string{return invoke(isNative,()=>family.bulkItemToken({namespace,id,batch,item})) as string;},
 parseBulkItemToken(key:string):{namespace:string;id:string;batch:number;item:number}{return invoke(isNative,()=>family.parseBulkItemToken({key})) as {namespace:string;id:string;batch:number;item:number};},
 isReservedBulkKey(key:string):boolean{return invoke(isNative,()=>family.isReservedBulkKey({key})) as boolean;},
 checkBulkKeyUse(key:string,viaBulk:boolean):{ok:boolean;code?:string}{return invoke(isNative,()=>family.checkBulkKeyUse({key,viaBulk})) as {ok:boolean;code?:string};},
});}
