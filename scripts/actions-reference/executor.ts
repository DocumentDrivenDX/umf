import {copyJson} from '../../src/model/json';
import {ReferenceAttemptJournal,type ReferenceAttemptSink} from './attempts';
import {ReferenceCommitUncertain,referenceKnownAbort} from './transaction-failures';
import {verifyReferenceEntityOutputs} from './handler-outputs';
import {ReferenceHandlerRegistry} from './handlers';
import {executeReferenceHandler} from './handler-execution';
import type {ActionInputs} from '../../src/extensions/actions/selector';
import {verifyReferenceGraph} from './graph';
import {randomUUID} from 'node:crypto';
import {referenceStoreVersion,retainReferenceReceipt} from './versions';
import {referenceFailure} from './failures';
import {ReferenceActionPreview,type ReferencePreviewDecision} from './preview';
import {UmfError} from '../../src/model/types';
import {knownActionModel,knownActionRelationship} from '../../src/extensions/actions/known-model';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import type {ActionEntityInput} from '../../src/extensions/actions/selector';
import {ReferenceActionAdmission} from './admission';
import {ReferenceActionOutcomes,type ReferenceLookupDecision} from './outcomes';
import {ReferenceActionPolicy} from './policy';
import type {TrustedActionSession} from './authentication';
import type {ReferenceInvokeRequest} from './protocol';
import {admitReferenceRequest,type RevisionReference} from './protocol';
import {freezeReferenceState,seedReferenceEntity} from './state';
import {referenceEntityAliases} from './aliases';
import {executeCandidateRecipeEffects,verifyReferencePostconditions} from './recipe';
import {encodeReferenceJson,encodeReferenceIdentity} from './codec';
import {referenceIntent} from './intent';
export interface ReferenceCommittedResult {
 status:'committed';revision:RevisionReference;outputs:ActionInputs;
 changes:({kind:'created'|'updated'|'deleted';entity:ActionEntityInput}|{kind:'linked'|'unlinked';relationship:{module:string;relationship:string};source:ActionEntityInput;target:ActionEntityInput})[];version:string;
 receipt:{store:string;epoch:string;version:string};noOp:boolean;
 verification:({kind:'recipe';effects:{effect:string;status:'verified';outcome:'changed'|'no-op'}[];postconditions:{condition:string;status:'satisfied'}[];frames:'enforced';constraints:'verified'}|{kind:'handler';deployment:{id:string;version:string;build:string};postconditions:{condition:string;status:'satisfied'}[];frames:'enforced';constraints:'verified';outputs:'verified'});
}
export type ReferenceRecipeCommittedResult=ReferenceCommittedResult&{verification:Extract<ReferenceCommittedResult['verification'],{kind:'recipe'}>};
/** Native graph-write execution with bounded known-abort retries and explicit uncertain acknowledgement. */
export class ReferenceActionExecutor {
 readonly admission:ReferenceActionAdmission;
 readonly outcomes:ReferenceActionOutcomes;
 constructor(readonly policy:ReferenceActionPolicy,handlers=new ReferenceHandlerRegistry(),readonly attempts:ReferenceAttemptSink=new ReferenceAttemptJournal(policy.store.url)){this.admission=new ReferenceActionAdmission(policy,handlers);this.outcomes=new ReferenceActionOutcomes(policy);}
 async preview(storeName:string,credential:unknown,requestInput:unknown):Promise<ReferencePreviewDecision>{return new ReferenceActionPreview(this.policy,this.admission.handlers).preview(storeName,credential,requestInput);}
 async invoke(storeName:string,credential:unknown,requestInput:unknown):Promise<ReferenceLookupDecision|{status:'failed';code:string}|{status:'indeterminate'}>{
  let attemptId=randomUUID();
  const observe=async(phase:'started'|'observed',decision:string,code:string|undefined,metadata:any)=>{try{await this.attempts.append({attemptId,phase,decision,...(code?{code}:{}),metadata:copyJson(metadata)});}catch{/* Instrumentation cannot classify business outcomes or trigger retries. */}};
  const context:any={actor:null,requestedTarget:null,revision:null,deployment:null,policy:null,profile:{id:'umf.actions.tx',version:'1'},correlation:null};
  // Snapshot caller data and authenticate before the first await; telemetry latency
  // must never create a window for caller mutation of the admitted invocation.
  let request:ReferenceInvokeRequest|undefined,session:TrustedActionSession|undefined;
  let refusal:{status:'unsupported'|'denied';code:string}|undefined,unexpected:unknown;
  try{request=admitReferenceRequest(requestInput,'invoke');}catch(error){if(error instanceof UmfError)refusal={status:'unsupported',code:'PARAMETER'};else unexpected=error;}
  if(request){context.requestedTarget=request.target;context.correlation=request.correlation??null;
   try{session=this.policy.issuer.authenticate(credential);context.actor={tenant:session!.tenant,principal:session!.principal,service:session!.service};}catch(error){if(error instanceof Error&&error.message==='AUTHENTICATION')refusal={status:'denied',code:'AUTHORIZATION'};else unexpected=error;}
  }
  await observe('started','pending',undefined,context);
  if(refusal){await observe('observed',refusal.status,refusal.code,context);return refusal;}
  if(unexpected||!request||!session){await observe('observed','host-error',undefined,context);throw unexpected??Error('Invocation admission unavailable');}
  for(let attempt=1;attempt<=3;attempt++){
  context.actor={tenant:session!.tenant,principal:session!.principal,service:session!.service};
  context.revision=null;context.deployment=null;context.policy=null;context.route='fresh';
  if(attempt>1){attemptId=randomUUID();await observe('started','pending',undefined,context);}
  const attribution=(value:{revision:RevisionReference;deployment:unknown})=>{context.revision=value.revision;context.deployment=value.deployment;};
  let stage:'admission'|'execution'='admission';
  let result:ReferenceLookupDecision|{status:'failed';code:string}|{status:'indeterminate'};
  try{result=await this.policy.store.transaction(storeName,async(tx,control)=>{
   if(session!.tenant===control.tenant)context.policy={store:control.store,epoch:control.epoch,version:control.policy_version.toString()};
   if(request.key){const replay=await this.outcomes.lookupInTransaction(tx,control,session!,request,attribution);if(replay.status!=='not-found'){context.route='retained-lookup';if(replay.status==='committed'){context.revision=replay.revision;context.deployment=replay.verification.kind==='handler'?replay.verification.deployment:null;}return replay;}}
   const prepared=await this.admission.prepareInTransaction(tx,control,session!,request,attribution);context.revision=prepared.target;context.deployment=prepared.deployment??null;const state=await freezeReferenceState(tx,control,prepared,this.admission.handlers);stage='execution';const candidate=prepared.action.binding.kind==='recipe'?executeCandidateRecipeEffects(prepared,state):await executeReferenceHandler(prepared,state,this.admission.handlers);
   const revision=await this.admission.revisions.readInTransaction(tx,control,prepared.target);
   let result:ReferenceCommittedResult|{status:'rejected'|'conflict';code:string};
   if(candidate.kind!=='candidate')result={status:candidate.kind,code:candidate.code};
   else {
    const outputs='outputs' in candidate?candidate.outputs:{};
    verifyReferenceEntityOutputs(prepared,state,candidate,outputs);
    const sequence=control.business_sequence+(candidate.orderedChanges.length?1n:0n),version=referenceStoreVersion(control,sequence);
    const entities=new Map(state.frames.flatMap(frame=>frame.entity?[[frame.entity.id,frame.entity] as const]:[]));for(const change of candidate.changes)entities.set(change.entity.id,change.entity);
    const identityFor=(entity:NonNullable<typeof state.frames[number]['entity']>,keyId?:string):ActionEntityInput=>{const record=knownActionModel(prepared.source,entity.record,'record'),key=((record.keys??[]) as {id:string;primary:boolean;fields:{module:string;element:string}[]}[]).find(key=>keyId?key.id===keyId:key.primary);if(!key)throw new UmfError('SELECTOR','Qualified result Key required');return {key:{...entity.record,key:key.id},components:key.fields.map(field=>entity.fields[actionFieldValueKey(field)]!)};};
    const changes:ReferenceCommittedResult['changes']=candidate.orderedChanges.map(change=>{if('entity' in change)return {kind:change.kind,entity:identityFor(change.entity)};const source=entities.get(change.link.sourceEntity)!,target=entities.get(change.link.targetEntity)!,definition=knownActionRelationship(prepared.source,change.link.relationship),key=definition.target.find((endpoint:{module:string;element:string})=>endpoint.module===target.record.module&&endpoint.element===target.record.element)?.key;if(!key)throw new UmfError('SELECTOR','Authored result target Key required');return {kind:change.kind,relationship:change.link.relationship,source:identityFor(source),target:identityFor(target,key)};});
    const pendingAliases=new Set<string>();
    for(const change of candidate.changes)if(change.kind==='created')for(const alias of referenceEntityAliases(prepared.source,change.entity)){if(pendingAliases.has(alias.identity))throw new UmfError('CONSTRAINT','Duplicate candidate Key');pendingAliases.add(alias.identity);const existing=await tx`select id from action_key_alias where store=${control.id} and lookup=action_identity_lookup(${alias.identity}) and identity=${alias.identity}`;if(existing.length)throw new UmfError('CONSTRAINT','Created Key already exists in native store');}
    await verifyReferenceGraph(tx,control,prepared.source,{entities:state.frames.flatMap(frame=>frame.entity?[frame.entity]:[]),changes:candidate.changes,links:candidate.links});
    const postconditions=verifyReferencePostconditions(prepared,candidate.pre,candidate.post,outputs);
    for(const change of candidate.links)if(change.kind==='unlinked'){const rows=await tx`delete from action_link where store=${control.id} and relationship=${encodeReferenceIdentity(change.link.relationship)} and source_entity=${change.link.sourceEntity} and target_entity=${change.link.targetEntity} returning id`;if(rows.length!==1)throw new UmfError('SELECTOR','Frozen unlinked association no longer resolves');}
    for(const change of candidate.changes)if(change.kind==='deleted'){await tx`delete from action_key_alias where store=${control.id} and entity=${change.entity.id}`;const rows=await tx`delete from action_entity where store=${control.id} and id=${change.entity.id} returning id`;if(rows.length!==1)throw new UmfError('SELECTOR','Frozen deleted entity no longer resolves');}
    const eventEntities=candidate.updates.map(entity=>({...entity,version})),nativeIds=new Map<string,string>();
    for(const change of candidate.changes)if(change.kind==='created'){const id=await seedReferenceEntity(tx,control,prepared.source,change.entity.record,change.entity.fields,version);nativeIds.set(change.entity.id,id);eventEntities.push({...change.entity,id,version});}
    for(const entity of candidate.updates){const rows=await tx`update action_entity set fields=${encodeReferenceJson(entity.fields)},version=${encodeReferenceJson(version)} where store=${control.id} and id=${entity.id} returning id`;if(rows.length!==1)throw new UmfError('SELECTOR','Frozen entity no longer resolves');}
    const deleted=new Set(candidate.changes.filter(change=>change.kind==='deleted').map(change=>change.entity.id)),updated=new Set(candidate.updates.map(entity=>entity.id));
    const touched=new Set(candidate.links.flatMap(change=>[change.link.sourceEntity,change.link.targetEntity]));for(const id of touched)if(!deleted.has(id)&&!nativeIds.has(id)&&!updated.has(id)){const entity=entities.get(id)!;const rows=await tx`update action_entity set version=${encodeReferenceJson(version)} where store=${control.id} and id=${id} returning id`;if(rows.length!==1)throw new UmfError('SELECTOR','Relationship endpoint no longer resolves');eventEntities.push({...entity,version});}
    const resolvedLinks=candidate.links.map(change=>({...change,link:{...change.link,sourceEntity:nativeIds.get(change.link.sourceEntity)??change.link.sourceEntity,targetEntity:nativeIds.get(change.link.targetEntity)??change.link.targetEntity}}));
    for(const change of resolvedLinks)if(change.kind==='linked'){const link=change.link;await tx`insert into action_link(store,identity,relationship,source_entity,target_entity) values (${control.id},${encodeReferenceIdentity([link.relationship,link.sourceEntity,link.targetEntity])},${encodeReferenceIdentity(link.relationship)},${link.sourceEntity},${link.targetEntity})`;}
    if(changes.length){await tx`update action_store set business_sequence=${sequence.toString()} where id=${control.id}`;await tx`insert into action_outbox(store,identity,epoch,sequence,facts) values (${control.id},${encodeReferenceIdentity([control.epoch,sequence.toString()])},${encodeReferenceJson(control.epoch)},${sequence.toString()},${encodeReferenceJson({profile:{id:'umf.actions.native-facts',version:'1'},changes,entities:eventEntities,deleted:[...deleted],links:resolvedLinks.filter(change=>change.kind==='linked').map(change=>change.link),unlinked:resolvedLinks.filter(change=>change.kind==='unlinked').map(change=>change.link)})})`;}
    await retainReferenceReceipt(tx,control,sequence);
    result={status:'committed',revision:prepared.target,outputs,changes,version,receipt:{store:control.store,epoch:control.epoch,version},noOp:changes.length===0,verification:'effects' in candidate?{kind:'recipe',effects:candidate.effects,postconditions,frames:'enforced',constraints:'verified'}:{kind:'handler',deployment:prepared.deployment!,postconditions,frames:'enforced',constraints:'verified',outputs:'verified'}};
   }
   if(request.key){const identity=encodeReferenceIdentity([session!.tenant,control.store,session!.principal,request.target.module,request.target.action,request.key]),fingerprint=referenceIntent(prepared.source,prepared.action,request);await tx`insert into action_outcome(store,identity,revision,fingerprint,original_intent,result) values (${control.id},${identity},${revision.id},${fingerprint},${encodeReferenceJson(request)},${encodeReferenceJson(result)})`;}
   await tx`insert into action_audit(store,expires_at,header,family,identity,revision,actor,deployment,policy_version,decision,correlation,details) values (${control.id},clock_timestamp()+make_interval(secs=>coalesce((select seconds from action_audit_retention where store=${control.id} and lookup=action_identity_lookup(${encodeReferenceIdentity([prepared.target.module,prepared.target.action])}) and identity=${encodeReferenceIdentity([prepared.target.module,prepared.target.action])}),2592000)),${encodeReferenceJson({attemptId,profile:{id:'umf.actions.tx',version:'1'},target:prepared.target})},${encodeReferenceIdentity([prepared.target.module,prepared.target.action])},${encodeReferenceIdentity(attemptId)},${revision.id},${encodeReferenceJson({principal:session!.principal,service:session!.service})},${encodeReferenceJson(prepared.deployment??null)},${control.policy_version.toString()},${result.status},${request.correlation?encodeReferenceJson(request.correlation):null},${encodeReferenceJson({attemptId,profile:{id:'umf.actions.tx',version:'1'},target:prepared.target,result})})`;
   return result;
  });}catch(error){
   if(referenceKnownAbort(error)){await observe('observed','rolled-back','TRANSIENT_ABORT',context);if(attempt<3)continue;return {status:'failed',code:'TRANSIENT_ABORT'};}
   if(error instanceof ReferenceCommitUncertain){await observe('observed','indeterminate',undefined,context);return {status:'indeterminate'};}
   // These callback failures are classified only after begin() has rolled back.
   // Other unexpected SQL and host failures remain visible; do not invent outcomes.
   const failure=referenceFailure(error,stage);if(failure){await observe('observed',failure.status,failure.code,context);return failure;}
   await observe('observed','host-error',undefined,context);throw error;
  }
  await observe('observed',result.status,'code' in result?result.code:undefined,context);return result;
  }
  throw Error('Unreachable attempt bound');
 }
}
