// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
/**
 * Pure CONTRACT-904 reference model (US-907). It evaluates control-state transitions, the
 * delegation/guard/tx-1 decision order and reserved item-token syntax from supplied facts only.
 * It reads no clock, performs no I/O, authenticates nobody and attests no native executor.
 */
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
const TERMINAL=new Set<BulkJobStatus>(['completed','stopped','cancelled']);
const FENCE=/^(0|[1-9][0-9]*)$/;
const SEGMENT=/^[A-Za-z0-9_-]{1,128}$/;
const CANONICAL=/^(0|[1-9][0-9]*)$/;
const refuse=(code?:string):BulkTransitionResult=>code?{ok:false,code}:{ok:false};
const accept=(state:BulkJobState,basis?:string):BulkTransitionResult=>basis?{ok:true,state,basis}:{ok:true,state};
const fail=(code:string,message:string):never=>{throw new UmfError(code,message,'');};
/** Exact unsigned decimal text incremented without wrap; anything else throws. */
export function nextBulkFence(fence:string):string {
 if(typeof fence!=='string'||!FENCE.test(fence))return fail('PAP_FENCE','Fence must be exact unsigned decimal text');
 return (BigInt(fence)+1n).toString();
}
function advance(s:BulkJobState):BulkJobState {
 const next=s.nextBatch+1;
 s.nextBatch=next;s.committedBatches+=1;s.claim=null;
 s.status=next===s.batchCount?'completed':s.cancelRequested?'cancelled':'queued';
 return s;
}
/** Applies one event to a job state (null before submit). Never mutates its inputs. */
export function applyBulkEvent(state:BulkJobState|null,event:BulkEvent):BulkTransitionResult {
 if(state===null){
  if(event.kind!=='submit')return refuse();
  const n=event.batchCount;
  if(!Number.isSafeInteger(n)||n<0)return refuse();
  return accept({status:n===0?'completed':'queued',batchCount:n,nextBatch:0,committedBatches:0,fence:'0',claim:null,cancelRequested:false,stop:null},n===0?'empty-manifest':'seal-delegation-intent-capacity');
 }
 const s=structuredClone(state);
 if(TERMINAL.has(s.status)){
  if(event.kind==='cancel')return accept(s,'terminal-noop');
  if(s.status==='cancelled'&&(event.kind==='claim'||event.kind==='execute'))return refuse('PAP_CANCELLED');
  return refuse();
 }
 if(event.kind==='cancel'){
  if(s.status==='queued'||(s.status==='running'&&s.claim!==null&&!s.claim.effectAdmitted)){s.status='cancelled';s.claim=null;return accept(s);}
  s.cancelRequested=true;return accept(s,'cancel-requested');
 }
 if(s.status==='queued'){
  if(event.kind==='claim'){const fence=nextBulkFence(s.fence);s.status='running';s.fence=fence;s.claim={batch:s.nextBatch,fence,effectAdmitted:false};return accept(s);}
  if(event.kind==='execute')return refuse('PAP_FENCE');
  return refuse();
 }
 const claim=s.claim;
 if(s.status==='running'&&claim!==null){
  switch(event.kind){
   case 'execute':
    if(s.cancelRequested)return refuse('PAP_CANCELLED');
    if(event.fence!==claim.fence)return refuse('PAP_FENCE');
    if(event.batch!==claim.batch)return refuse('PAP_ORDER');
    if(claim.effectAdmitted)return refuse();
    claim.effectAdmitted=true;return accept(s);
   case 'commit':
    if(!claim.effectAdmitted)return refuse();
    return accept(advance(s));
   case 'failure':
    s.status='stopped';s.stop={batch:claim.batch,code:event.code};s.claim=null;return accept(s);
   case 'lose-custody':
    if(!claim.effectAdmitted)return refuse();
    s.status='reconciling';return accept(s);
   case 'expire-claim':
    if(claim.effectAdmitted||!event.confirmedNoExecution)return refuse();
    s.status='queued';s.claim=null;return accept(s);
   default:return refuse();
  }
 }
 if(s.status==='reconciling'&&claim!==null&&event.kind==='reconcile'){
  if(event.evidence==='committed')return accept(advance(s));
  if(event.evidence==='noncommit-admitted'){s.status='stopped';s.stop={batch:claim.batch,code:'PAP_ABORT_DISPOSITION_UNKNOWN'};s.claim=null;return accept(s);}
  return accept(s,'unresolved');
 }
 return refuse();
}
export interface BulkDecisionInput {delegation:'valid'|'missing'|'expired'|'human-lost';guards:'pass'|'changed'|'deleted'|'rebound';guardItem?:number;tx1:{decision:'committed'|'conflict'|'rejected'|'entity-missing';code?:string;item?:number}|null}
export interface BulkDecision {status:'denied'|'conflict'|'rejected'|'committed';code?:string;item?:number;tx1Invoked:boolean;itemOutcome:boolean;qualificationFault?:boolean}
/** Delegation, then batch guards, then tx/1; guard conflicts are never translated into tx/1 codes. */
export function bulkDecisionOrder(input:BulkDecisionInput):BulkDecision {
 if(input.delegation!=='valid')return {status:'denied',code:'AUTHORIZATION',tx1Invoked:false,itemOutcome:false};
 if(input.guards!=='pass'){const r:BulkDecision={status:'conflict',code:'PAP_GUARD',tx1Invoked:false,itemOutcome:false};if(input.guardItem!==undefined)r.item=input.guardItem;return r;}
 const t=input.tx1;
 if(t===null)return fail('PAP_ORDER','tx/1 result required once guards pass');
 if(t.decision==='committed')return {status:'committed',tx1Invoked:true,itemOutcome:true};
 if(t.decision==='conflict'||t.decision==='rejected')return {status:t.decision,code:t.code as string,item:t.item as number,tx1Invoked:true,itemOutcome:true};
 return {status:'rejected',code:'ENTITY_MISSING',item:t.item as number,tx1Invoked:true,itemOutcome:true,qualificationFault:true};
}
const ordinal=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/** `pap1/<namespace>/<id>/<batch>/<item>`; restricted ASCII segments make the encoding injective. */
export function bulkItemToken(namespace:string,id:string,batch:number,item:number):string {
 if(typeof namespace!=='string'||!SEGMENT.test(namespace)||typeof id!=='string'||!SEGMENT.test(id))return fail('PAP_INVALID','JobRef segments must match [A-Za-z0-9_-]{1,128}');
 if(!ordinal(batch)||!ordinal(item))return fail('PAP_INVALID','Batch and item must be canonical unsigned integers');
 return `pap1/${namespace}/${id}/${batch}/${item}`;
}
export function parseBulkItemToken(key:string):{namespace:string;id:string;batch:number;item:number} {
 const p=typeof key==='string'?key.split('/'):[];
 if(p.length!==5||p[0]!=='pap1'||!SEGMENT.test(p[1]!)||!SEGMENT.test(p[2]!)||!CANONICAL.test(p[3]!)||!CANONICAL.test(p[4]!))return fail('PAP_INVALID','Malformed reserved bulk token');
 const batch=Number(p[3]),item=Number(p[4]);
 if(!ordinal(batch)||!ordinal(item))return fail('PAP_INVALID','Ordinal out of range');
 return {namespace:p[1]!,id:p[2]!,batch,item};
}
export const isReservedBulkKey=(key:string):boolean=>typeof key==='string'&&key.startsWith('pap1/');
/** Reserved keys are valid only on the registered bulk path. */
export function checkBulkKeyUse(key:string,viaBulk:boolean):{ok:boolean;code?:string} {
 return isReservedBulkKey(key)&&!viaBulk?{ok:false,code:'PAP_RESERVED'}:{ok:true};
}
