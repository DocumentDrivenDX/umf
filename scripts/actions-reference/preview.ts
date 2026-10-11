import {ReferenceHandlerRegistry} from './handlers';
import {UmfError} from '../../src/model/types';
import {ReferenceActionAdmission} from './admission';
import {ReferenceActionPolicy} from './policy';
import {admitReferenceRequest,type ReferenceInvokeRequest,type RevisionReference} from './protocol';
import type {TrustedActionSession} from './authentication';
import {freezeReferenceState} from './state';
import {checkReferencePreconditions} from './preconditions';
import {referenceStoreVersion} from './versions';
import {referenceFailure,type ReferenceFailure} from './failures';
export type ReferencePreviewDecision=ReferenceFailure|{status:'rejected'|'conflict';code:string}|{status:'preview';revision:RevisionReference;profile:{id:'umf.actions.tx';version:'1'};stateBasis:{store:string;epoch:string;version:string};preconditions:'satisfied'|'rejected'|'unchecked';changes:'not-computed';commitGuaranteed:false};
/** Validation-only native snapshot. No recipe/handler execution, reservation, audit, outbox or replay writes. */
export class ReferenceActionPreview {
 readonly admission:ReferenceActionAdmission;
 constructor(readonly policy:ReferenceActionPolicy,handlers=new ReferenceHandlerRegistry()){this.admission=new ReferenceActionAdmission(policy,handlers);}
 async preview(storeName:string,credential:unknown,requestInput:unknown):Promise<ReferencePreviewDecision>{
  let request:ReferenceInvokeRequest,session:TrustedActionSession;
  try{request=admitReferenceRequest(requestInput,'preview');}catch(error){if(error instanceof UmfError)return {status:'unsupported',code:'PARAMETER'};throw error;}
  try{session=this.policy.issuer.authenticate(credential);}catch(error){const failure=referenceFailure(error,'admission');if(failure)return failure;throw error;}
  let stage:'admission'|'execution'='admission';
  try{return await this.policy.store.transaction(storeName,async(tx,control)=>{
   const prepared=await this.admission.prepareInTransaction(tx,control,session,request),state=await freezeReferenceState(tx,control,prepared,this.admission.handlers);stage='execution';
   const checked=checkReferencePreconditions(prepared,state);
   if(checked.kind==='conflict'||checked.kind==='rejected'&&checked.stage==='input')return {status:checked.kind,code:checked.code};
   return {status:'preview',revision:prepared.target,profile:{id:'umf.actions.tx',version:'1'},stateBasis:{store:control.store,epoch:control.epoch,version:referenceStoreVersion(control)},preconditions:checked.kind==='ready'?'satisfied':'rejected',changes:'not-computed',commitGuaranteed:false};
  });}catch(error){const failure=referenceFailure(error,stage);if(failure)return failure;throw error;}
 }
}
