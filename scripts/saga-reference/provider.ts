// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash,randomUUID} from 'node:crypto';
import {SQL} from 'bun';
import {UmfError} from '../../src/model/types';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {ReferenceActionExecutor,type ReferenceCommittedResult} from '../actions-reference/executor';
import type {ReferenceActionStore} from '../actions-reference/store';
import type {TrustedActionSession} from '../actions-reference/authentication';
import {admitReferenceRequest,type ReferenceInvokeRequest} from '../actions-reference/protocol';
import {encodeReferenceJson,decodeReferenceJson} from '../actions-reference/codec';

export type ProviderResult = ReferenceCommittedResult | {status:'rejected'|'conflict'|'failed'|'denied'|'unsupported'|'expired';code:string} | {status:'indeterminate'};
export interface SagaProviderFaults {beforeAdmission?:(ticket:string,request:ReferenceInvokeRequest)=>Promise<void>;afterInvoke?:(ticket:string,result:ProviderResult)=>Promise<void>;afterFinality?:(ticket:string,result:ProviderResult)=>Promise<void>}
function snapshotRequest(ticket:string,input:ReferenceInvokeRequest):ReferenceInvokeRequest {
 const request=admitReferenceRequest(input,'invoke');
 if(request.correlation!==undefined&&request.correlation!==ticket)throw new UmfError('SAGA_ORDER','Invocation correlation does not match original ticket');
 if(encodeReferenceJson(request.inputs).length>65_536)throw new UmfError('SAGA_LIMIT','Saga input custody exceeds 65536 UTF-16 code units');
 return {...request,correlation:ticket};
}
const digest=(value:unknown)=>createHash('sha256').update(canonicalSchemaJson(value)).digest('hex');

/** Test-only admission and finality gateway around the qualified action executor. */
export class SagaProviderGateway {
 readonly sql:SQL;
 readonly issuerId:string;
 #dispositions=new WeakMap<object,{ticket:string;digest:string;resultDigest:string}>();
 #fact(ticket:string,request:ReferenceInvokeRequest,result:ProviderResult):ProviderResult {const value=structuredClone(result);this.#dispositions.set(value,{ticket,digest:digest(request),resultDigest:digest(value)});return value;}
 isOriginalDisposition(ticket:string,request:ReferenceInvokeRequest,result:unknown):boolean {if(!result||typeof result!=='object')return false;const fact=this.#dispositions.get(result);return !!fact&&fact.ticket===ticket&&fact.resultDigest===digest(result)&&fact.digest===digest(snapshotRequest(ticket,request));}
 private subject(credential:unknown):TrustedActionSession {return this.executor.policy.issuer.authenticate(credential);}
 private readonly invokeOriginal:ReturnType<ReferenceActionExecutor['reserveInvocationNamespace']>;
 constructor(readonly store:ReferenceActionStore,readonly storeName:string,readonly executor:ReferenceActionExecutor,readonly faults:SagaProviderFaults={},issuerId=storeName){if(!issuerId||issuerId.length>256)throw new UmfError('SAGA_LIMIT','Provider issuer identity is invalid');this.issuerId=issuerId;this.sql=new SQL({url:store.url,max:4});this.invokeOriginal=executor.reserveInvocationNamespace('saga1/',result=>{if(encodeReferenceJson(result).length>65_536)throw new UmfError('SAGA_LIMIT','Saga result custody exceeds 65536 UTF-16 code units');});}
 async initialize():Promise<void>{await this.sql.unsafe(await Bun.file(new URL('./provider.sql',import.meta.url)).text()).simple();}
 async register(ticket:string,tenant:string,request:ReferenceInvokeRequest,credential:unknown):Promise<'registered'|'original'|'conflict'>{
  request=snapshotRequest(ticket,request);const subject=this.subject(credential);if(subject.tenant!==tenant)throw Error('AUTHORIZATION');
  const intent=encodeReferenceJson(request),fingerprint=digest(request),identity=encodeReferenceJson(subject);
  const epoch=await this.store.transaction(this.storeName,async(_tx,control)=>{if(control.tenant!==tenant)throw Error('AUTHORIZATION');return control.epoch;});
  return this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;const rows=await tx`select tenant,intent_digest,state,subject,store_name,epoch from saga_provider_ticket where ticket=${ticket} for update`;if(rows.length){if(rows[0]!.tenant!==tenant||rows[0]!.intent_digest!==fingerprint||rows[0]!.subject!==identity||rows[0]!.store_name!==this.storeName||rows[0]!.epoch!==epoch)return 'conflict';return rows[0]!.state==='closed'?'original':'registered';}await tx`insert into saga_provider_ticket(ticket,tenant,intent_digest,intent,state,subject,store_name,epoch) values (${ticket},${tenant},${fingerprint},${intent},'open',${identity},${this.storeName},${epoch})`;return 'registered';});
 }
 private async originalScope(ticket:string,credential:unknown,request:ReferenceInvokeRequest):Promise<boolean>{
  let subject:TrustedActionSession;try{subject=this.subject(credential);}catch{return false;}
  const identity=encodeReferenceJson(subject),rows=await this.sql`select subject,store_name,epoch,intent_digest from saga_provider_ticket where ticket=${ticket}`;
  if(rows.length!==1||rows[0]!.subject!==identity||rows[0]!.store_name!==this.storeName||rows[0]!.intent_digest!==digest(request))return false;
  return this.store.transaction(this.storeName,async(_tx,control)=>control.tenant===subject.tenant&&control.epoch===rows[0]!.epoch);
 }
 async holdAdmission(ticket:string):Promise<void>{await this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;const rows=await tx`select state from saga_provider_ticket where ticket=${ticket} for update`;if(rows.length!==1||rows[0]!.state!=='open')throw Error('TICKET_CLOSED');await tx`insert into saga_provider_attempt(ticket,attempt,state) values (${ticket},1,'admitted')`;});}
 async deliver(ticket:string,credential:unknown,request:ReferenceInvokeRequest):Promise<ProviderResult>{
  request=snapshotRequest(ticket,request);
  if(!await this.originalScope(ticket,credential,request))return {status:'denied',code:'AUTHORIZATION'};
  const authorization=await this.executor.outcomes.lookup(this.storeName,credential,{protocol:request.protocol,target:request.target,key:request.key,inputs:request.inputs,...(request.expectedVersions?{expectedVersions:request.expectedVersions}:{})});
  if(authorization.status==='denied'||authorization.status==='unsupported'||authorization.status==='expired'){
   // Only the original authenticated subject may fence an invocation that has
   // never entered native execution. A current read refusal is not an outcome.
   const closed=await this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;const [row]=await tx`select state from saga_provider_ticket where ticket=${ticket} for update`;const attempts=await tx`select state from saga_provider_attempt where ticket=${ticket}`;if(!row||row.state!=='open'||attempts.length)return false;await tx`update saga_provider_ticket set state='closed',final_disposition=${encodeReferenceJson(authorization)},closed_at=clock_timestamp() where ticket=${ticket}`;return true;});
   return closed?this.#fact(ticket,request,authorization):authorization;
  }
  await this.faults.beforeAdmission?.(ticket,structuredClone(request));
  const fp=digest(request);
  const admission=await this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;const rows=await tx`select tenant,intent_digest,state,final_disposition from saga_provider_ticket where ticket=${ticket} for update`;if(!rows.length)throw Error('TICKET_NOT_REGISTERED');const row=rows[0]!;if(row.intent_digest!==fp)return {kind:'conflict' as const};if(row.state==='closed')return {kind:'closed' as const,result:decodeReferenceJson(row.final_disposition) as ProviderResult};const unresolved=await tx`select attempt from saga_provider_attempt where ticket=${ticket} and state='admitted'`;if(unresolved.length)return {kind:'pending' as const};const prior=await tx`select result from saga_provider_attempt where ticket=${ticket} and state in ('committed','rejected','conflict','refused','rolled-back') order by attempt limit 1`;if(prior.length){await tx`update saga_provider_ticket set state='closed',final_disposition=${prior[0]!.result},closed_at=clock_timestamp() where ticket=${ticket} and state='open'`;return {kind:'closed' as const,result:decodeReferenceJson(prior[0]!.result) as ProviderResult};}const seq=await tx`select coalesce(max(attempt),0)::int+1 as n from saga_provider_attempt where ticket=${ticket}`;const attempt=Number(seq[0]!.n);await tx`insert into saga_provider_attempt(ticket,attempt,state) values (${ticket},${attempt},'admitted')`;return {kind:'admit' as const,attempt};});
  if(admission.kind==='closed')return this.#fact(ticket,request,admission.result);if(admission.kind==='conflict')return {status:'conflict',code:'TOKEN_REUSE'};if(admission.kind==='pending')return {status:'indeterminate'};
  const result=await this.invokeOriginal(this.storeName,credential,request) as ProviderResult;await this.faults.afterInvoke?.(ticket,result);
  if(result.status==='indeterminate')return result;
  const terminal=result.status==='failed'?'rolled-back':['committed','rejected','conflict'].includes(result.status)?result.status:'refused';
  await this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;await tx`update saga_provider_attempt set state=${terminal},result=${encodeReferenceJson(result)},settled_at=clock_timestamp() where ticket=${ticket} and attempt=${admission.attempt} and state='admitted'`;await tx`update saga_provider_ticket set state='closed',final_disposition=${encodeReferenceJson(result)},closed_at=clock_timestamp() where ticket=${ticket} and state='open'`;});
  // TRANSIENT_ABORT is final only after the original executor invocation has
  // returned (including all of its internal retries) and the whole ticket is
  // atomically fenced against later admission.
  if(terminal==='rolled-back'){const closed=await this.closeNoncommit(ticket,(result as {code:string}).code);if(closed.status==='pending')return {status:'indeterminate'};await this.faults.afterFinality?.(ticket,closed);return this.#fact(ticket,request,closed);}
  await this.faults.afterFinality?.(ticket,result);
  return this.#fact(ticket,request,result);
 }
 async lookup(ticket:string,credential:unknown,request:ReferenceInvokeRequest):Promise<ProviderResult|{status:'pending'}>{
  request=snapshotRequest(ticket,request);
  if(!await this.originalScope(ticket,credential,request))return {status:'denied',code:'AUTHORIZATION'};
  const found=await this.executor.outcomes.lookup(this.storeName,credential,{protocol:'umf.actions.tx/1',target:request.target,key:request.key,inputs:request.inputs,...(request.expectedVersions?{expectedVersions:request.expectedVersions}:{})});
  if(found.status==='denied'||found.status==='unsupported'||found.status==='expired')return found;
  const rows=await this.sql`select intent_digest,state,final_disposition from saga_provider_ticket where ticket=${ticket}`;if(!rows.length)return {status:'unsupported',code:'TICKET'};if(rows[0]!.intent_digest!==digest(request))return {status:'conflict',code:'TOKEN_REUSE'};
  if(['committed','rejected','conflict'].includes(found.status)&&!(found.status==='conflict'&&found.code==='TOKEN_REUSE'))return this.#fact(ticket,request,found as ProviderResult);
  if(rows[0]!.state==='closed')return this.#fact(ticket,request,decodeReferenceJson(rows[0]!.final_disposition) as ProviderResult);
  return {status:'pending'};
 }
 async reconcile(ticket:string,credential:unknown,request:ReferenceInvokeRequest):Promise<ProviderResult|{status:'pending'}>{
  request=snapshotRequest(ticket,request);const result=await this.lookup(ticket,credential,request);if(result.status==='conflict'&&result.code==='TOKEN_REUSE')return {status:'pending'};if(this.isOriginalDisposition(ticket,request,result)){
   const state=['committed','rejected','conflict'].includes(result.status)?result.status:'rolled-back';
   await this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;await tx`update saga_provider_attempt set state=${state},result=${encodeReferenceJson(result)},settled_at=coalesce(settled_at,clock_timestamp()) where ticket=${ticket} and state='admitted'`;await tx`update saga_provider_ticket set state='closed',final_disposition=${encodeReferenceJson(result)},closed_at=coalesce(closed_at,clock_timestamp()) where ticket=${ticket} and state='open'`;});return result;
  }
  // Provider attempt journals are observations, not a completion signal for
  // the enclosing executor call. A started invocation with no tx/1 outcome
  // stays pending until that invocation's owner records its terminal result.
  return {status:'pending'};
 }
 private async closeNoncommit(ticket:string,reason:string):Promise<ProviderResult|{status:'pending'}>{
  return this.sql.begin(async tx=>{await tx`select ticket from saga_gateway_lock where singleton=true for update`;const rows=await tx`select state,final_disposition from saga_provider_ticket where ticket=${ticket} for update`;if(!rows.length)throw Error('TICKET_NOT_REGISTERED');if(rows[0]!.state==='closed')return decodeReferenceJson(rows[0]!.final_disposition) as ProviderResult;const attempts=await tx`select state from saga_provider_attempt where ticket=${ticket}`;if(attempts.some((row:any)=>row.state==='admitted'))return {status:'pending'};if(attempts.some((row:any)=>row.state!=='rolled-back'))return {status:'conflict',code:'SAGA_EFFECT'};const disposition:{status:'failed';code:string}={status:'failed',code:reason};await tx`update saga_provider_ticket set state='closed',final_disposition=${encodeReferenceJson(disposition)},closed_at=clock_timestamp() where ticket=${ticket} and state='open'`;return disposition;});
 }
 async close():Promise<void>{await this.sql.close();}
 async retainedEvidence(ticket:string):Promise<{issuer:string;tenant:string;ticket:string;observation:unknown}|undefined>{const rows=await this.sql`select tenant,state,final_disposition,intent_digest,epoch,store_name,intent from saga_provider_ticket where ticket=${ticket}`;if(rows.length!==1||rows[0]!.state!=='closed')return;return {issuer:this.issuerId,tenant:rows[0]!.tenant,ticket,observation:{profile:'umf.actions.saga.provider-finality/1',intentDigest:rows[0]!.intent_digest,storeEpoch:rows[0]!.epoch,store:rows[0]!.store_name,actionRevision:(decodeReferenceJson(rows[0]!.intent) as unknown as ReferenceInvokeRequest).target.revision,action:(decodeReferenceJson(rows[0]!.intent) as unknown as ReferenceInvokeRequest).target,key:(decodeReferenceJson(rows[0]!.intent) as unknown as ReferenceInvokeRequest).key,finalDisposition:decodeReferenceJson(rows[0]!.final_disposition)}};}
}
