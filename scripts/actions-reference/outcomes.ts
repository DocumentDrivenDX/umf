import {referenceObservedDeployment} from './attribution';
import type {SQL} from 'bun';
import type {ReferenceCommittedResult} from './executor';
import {copyJson} from '../../src/model/json';
import {UmfError} from '../../src/model/types';
import {inspectActions,registerActions,type Action} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {ReferenceActionPolicy} from './policy';
import {ReferenceRevisionRepository,type RetainedActionRevision} from './revisions';
import type {ReferenceStoreControl} from './store';
import type {TrustedActionSession} from './authentication';
import {admitReferenceRequest,type RevisionReference,type ReferenceInvokeRequest} from './protocol';
import {referenceIntent} from './intent';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
export type ReferenceTerminalDecision={status:'rejected'|'conflict';code:string};
export type ReferenceLookupDecision=ReferenceCommittedResult|ReferenceTerminalDecision|{status:'not-found'}|{status:'denied'|'unsupported'|'expired';code:string};
function retainedAction(revision:RetainedActionRevision):Action {
 const inspection=inspectActions(revision.source,registerActions(new Registry())),selected=inspection.actions.find(a=>a.module===revision.target.module&&a.action.id===revision.target.action);
 if(!inspection.validation.valid||!selected)throw Error('Invalid retained source');return selected.action;
}
function namespace(control:ReferenceStoreControl,session:TrustedActionSession,request:ReferenceInvokeRequest):string {
 if(!request.key)throw Error('Replay key required');return encodeReferenceIdentity([session.tenant,control.store,session.principal,request.target.module,request.target.action,request.key]);
}
/** Host-only terminal retention; lookup never calls an executor or grants fresh admission. */
export class ReferenceActionOutcomes {
 readonly revisions:ReferenceRevisionRepository;
 constructor(readonly policy:ReferenceActionPolicy){this.revisions=new ReferenceRevisionRepository(policy.store);}
 async appendInTransaction(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession,revision:RetainedActionRevision,requestInput:ReferenceInvokeRequest,resultInput:ReferenceTerminalDecision):Promise<void>{
  const request=admitReferenceRequest(requestInput,'invoke'),result=copyJson(resultInput) as unknown as ReferenceTerminalDecision;
  if(!result||Object.keys(result).some(k=>!['status','code'].includes(k))||!['rejected','conflict'].includes(result.status)||typeof result.code!=='string'||!result.code||result.code.length>256)throw Error('Invalid terminal decision');
  await this.policy.authorizeReplayDiscovery(tx,control,session,request.target.module,request.target.action);
  const retained=await this.revisions.readInTransaction(tx,control,revision.target);
  if(retained.id!==revision.id||retained.lifecycle!=='active')throw Error('Revision not active');
  const action=retainedAction(retained);await this.policy.authorize(tx,control,session,action);
  if(encodeReferenceIdentity(request.target)!==encodeReferenceIdentity(retained.target))throw Error('Revision mismatch');
  const identity=namespace(control,session,request),fingerprint=referenceIntent(retained.source,action,request);
  await tx`insert into action_outcome(store,identity,revision,fingerprint,original_intent,result) values (${control.id},${identity},${retained.id},${fingerprint},${encodeReferenceJson(request)},${encodeReferenceJson(result)})`;
 }
 async lookup(storeName:string,credential:unknown,requestInput:unknown):Promise<ReferenceLookupDecision>{
  let request:ReferenceInvokeRequest;try{request=admitReferenceRequest(requestInput,'lookup');}catch(error){if(error instanceof UmfError)return {status:'unsupported',code:'PARAMETER'};throw error;}let session:TrustedActionSession;
  try{session=this.policy.issuer.authenticate(credential);}catch(error){if(error instanceof Error&&error.message==='AUTHENTICATION')return {status:'denied',code:'AUTHORIZATION'};throw error;}
  return this.policy.store.transaction(storeName,(tx,control)=>this.lookupInTransaction(tx,control,session,request));
 }
 /** Keep replay interpretation and fresh execution within the same store boundary. */
 async lookupInTransaction(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession,request:ReferenceInvokeRequest,observe?:(attribution:{revision:RevisionReference;deployment:unknown})=>void):Promise<ReferenceLookupDecision>{
   try{await this.policy.authorizeReplayDiscovery(tx,control,session,request.target.module,request.target.action);}catch(error){if(error instanceof Error&&error.message==='AUTHORIZATION')return {status:'denied',code:'AUTHORIZATION'};throw error;}
   const identity=namespace(control,session,request),rows=await tx`select revision::text,fingerprint,result,tombstone from action_outcome where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   let revision:RetainedActionRevision;
   if(rows.length){const originals=await tx`select identity from action_revision where store=${control.id} and id=${rows[0]!.revision}`;if(originals.length!==1)throw Error('Missing retained revision');revision=await this.revisions.readInTransaction(tx,control,decodeReferenceJson(originals[0]!.identity) as unknown as ReferenceInvokeRequest['target']);}
   else {try{revision=await this.revisions.readInTransaction(tx,control,request.target);}catch(error){if(error instanceof Error&&error.message==='Retained revision does not resolve')return {status:'unsupported',code:'REVISION'};throw error;}}
   const action=retainedAction(revision);
   try{await this.policy.authorize(tx,control,session,action);}catch(error){if(error instanceof Error&&error.message==='AUTHORIZATION')return {status:'denied',code:'AUTHORIZATION'};if(error instanceof Error&&error.message==='UNSUPPORTED_AUTHORIZATION')return {status:'denied',code:'AUTHORIZATION'};throw error;}
   observe?.({revision:copyJson(revision.target) as unknown as RevisionReference,deployment:action.binding.kind==='handler'?referenceObservedDeployment(revision.deployment):null});
   if(revision.lifecycle==='unavailable')return {status:'unsupported',code:'REVISION'};
   if(!rows.length)return {status:'not-found'};
   if(rows[0]!.tombstone)return {status:'expired',code:'TOKEN_EXPIRED'};
   if(encodeReferenceIdentity(request.target)!==encodeReferenceIdentity(revision.target))return {status:'conflict',code:'TOKEN_REUSE'};
   try{if(referenceIntent(revision.source,action,request)!==rows[0]!.fingerprint)return {status:'conflict',code:'TOKEN_REUSE'};}catch(error){if(error instanceof UmfError&&error.code==='PARAMETER')return {status:'unsupported',code:'PARAMETER'};throw error;}
   return decodeReferenceJson(rows[0]!.result) as unknown as ReferenceTerminalDecision|ReferenceCommittedResult;
 }
}
