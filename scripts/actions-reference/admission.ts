import {referenceObservedDeployment} from './attribution';
import {ReferenceHandlerRegistry} from './handlers';
import type {SQL} from 'bun';
import {qualifyReferenceRecipe} from './recipe-profile';
import {copyJson} from '../../src/model/json';
import type {ReferenceStoreControl} from './store';
import type {TrustedActionSession} from './authentication';
import {UmfError} from '../../src/model/types';
import {inspectActions,registerActions} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {ReferenceActionPolicy} from './policy';
import {ReferenceRevisionRepository} from './revisions';
import {admitReferenceRequest,type RevisionReference} from './protocol';
import {encodeReferenceIdentity} from './codec';
import {prepareReferenceAction,type PreparedReferenceAction} from './preparation';
/** Read-only fresh preparation; returned snapshots confer no execution permission after lock release. Existing tokens must route through retained replay, never fresh work. */
export class ReferenceActionAdmission {
 readonly revisions:ReferenceRevisionRepository;
 constructor(readonly policy:ReferenceActionPolicy,readonly handlers=new ReferenceHandlerRegistry()){this.revisions=new ReferenceRevisionRepository(policy.store);}
 async prepareFresh(storeName:string,credential:unknown,requestInput:unknown):Promise<PreparedReferenceAction>{
  const request=admitReferenceRequest(requestInput,'invoke'),session=this.policy.issuer.authenticate(credential);
  return this.policy.store.transaction(storeName,(tx,control)=>this.prepareInTransaction(tx,control,session,request));
 }
 /** Trusted executor composition only: its caller must keep this transaction through execution/commit. */
 async prepareInTransaction(tx:SQL,control:ReferenceStoreControl,sessionInput:TrustedActionSession,requestInput:unknown,observe?:(attribution:{revision:RevisionReference;deployment:unknown})=>void):Promise<PreparedReferenceAction>{
  const request=admitReferenceRequest(requestInput,'invoke'),session=copyJson(sessionInput) as unknown as TrustedActionSession;
   if(session.tenant!==control.tenant)throw new UmfError('AUTHORIZATION','Trusted tenant scope required');
   if(request.key){await this.policy.authorizeReplayDiscovery(tx,control,session,request.target.module,request.target.action);const identity=encodeReferenceIdentity([session.tenant,control.store,session.principal,request.target.module,request.target.action,request.key]);const existing=await tx`select id from action_outcome where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;if(existing.length)throw new UmfError('TOKEN_REUSE','Retained tokens must route to original replay');}
   const revision=await this.revisions.readInTransaction(tx,control,request.target),inspection=inspectActions(revision.source,registerActions(new Registry())),selected=inspection.actions.find(item=>item.module===request.target.module&&item.action.id===request.target.action);
   if(!inspection.validation.valid||!selected)throw new UmfError('REVISION','Invalid retained source');
   await this.policy.authorize(tx,control,session,selected.action);
   observe?.({revision:copyJson(revision.target) as unknown as RevisionReference,deployment:selected.action.binding.kind==='handler'?referenceObservedDeployment(revision.deployment):null});
   if(control.invocation_fenced)throw new UmfError('REVISION','Store invocation is fenced');
   const handlers=selected.action.binding.kind==='handler'?await this.handlers.qualifyInTransaction(tx,control,selected.action,revision.deployment):this.handlers;
   const prepared=prepareReferenceAction(revision,request,handlers);if(prepared.action.binding.kind==='recipe')qualifyReferenceRecipe(prepared.source,prepared.action);return prepared;
 }
}
