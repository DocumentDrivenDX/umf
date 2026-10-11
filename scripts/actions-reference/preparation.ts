import {ReferenceHandlerRegistry,type ReferenceHandlerDeployment} from './handlers';
import {referenceCreationRelationships} from './creation-relationships';
import {admitReferenceInputs} from './inputs';
import {copyJson} from '../../src/model/json';
import {actionReferencePositions} from '../../src/extensions/actions/references';
import {UmfError,type Document} from '../../src/model/types';
import {inspectActions,registerActions,type Action} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {compileActionRule} from '../../src/extensions/actions/expression';
import {admitActionInputs,compileActionSelector,selectActionIdentity,type ActionInputs,type SelectedActionIdentity} from '../../src/extensions/actions/selector';
import {knownActionModel,knownActionRelationship} from '../../src/extensions/actions/known-model';
import {admitReferenceRequest,canonicalReferenceVersions,type ReferenceInvokeRequest,type RevisionReference} from './protocol';
import type {RetainedActionRevision} from './revisions';
export interface PreparedReferenceAction {target:RevisionReference;source:Document;action:Action;inputs:ActionInputs;frames:{id:string;access:'read'|'write';identity:SelectedActionIdentity}[];expectedVersions:ReturnType<typeof canonicalReferenceVersions>;deployment?:ReferenceHandlerDeployment}
const preparedHandlers=new WeakMap<PreparedReferenceAction,ReferenceHandlerRegistry>();
/** Host-only admitted capability, deliberately absent from copied/serialized metadata. */
export function referencePreparedHandlers(prepared:PreparedReferenceAction,fallback?:ReferenceHandlerRegistry):ReferenceHandlerRegistry|undefined{return preparedHandlers.get(prepared)??fallback;}
const refuse=(code:string,message:string):never=>{throw new UmfError(code,message);};
/** Whole selected declaration admission precedes narrow compilers and typed input handling. No native execution claim. */
export function prepareReferenceAction(revisionInput:RetainedActionRevision,requestInput:ReferenceInvokeRequest,handlers?:ReferenceHandlerRegistry,freshDeployment=true):PreparedReferenceAction {
 const revision=copyJson(revisionInput) as unknown as RetainedActionRevision;
 const request=admitReferenceRequest(requestInput,'invoke');
 if(revision.lifecycle!=='active')refuse('REVISION','Fresh admission requires active retained revision');
 if(request.target.module!==revision.target.module||request.target.action!==revision.target.action||request.target.revision!==revision.target.revision)refuse('REVISION','Exact retained revision required');
 const inspection=inspectActions(revision.source,registerActions(new Registry())),selected=inspection.actions.find(item=>item.module===request.target.module&&item.action.id===request.target.action);
 if(!inspection.validation.valid||!selected)return refuse('PARAMETER','Invalid retained declaration');
 const handler=selected.action.binding.kind==='handler'?handlers?.resolve(selected.action,revision.deployment,freshDeployment):undefined;
 if(selected.action.binding.kind==='handler'&&!handler)refuse('ACTION_HANDLER_PROFILE','Handler deployment qualification is not installed');
 if(selected.obligations.some(obligation=>obligation.status!=='checked'&&!(handler&&obligation.kind==='handler'&&obligation.path===selected.path+'/binding/handler')))refuse('ACTION_UNCHECKED','Entire selected declaration must have understood meaning');
 const source=inspection.source,action=selected.action;
 const reservedCodes=new Set(['PARAMETER','RULE_TYPE','RULE_PHASE','RULE_DEPENDENCY','RULE_EVALUATION','SELECTOR','FRAME_ACCESS','LIMIT','REVISION','AUTHORIZATION','TOKEN_REUSE','TOKEN_EXPIRED','EXPECTED_VERSION','POSTCONDITION','TRANSIENT_ABORT','RECEIPT_SCOPE','ENTITY_MISSING','CONSTRAINT']);
 const protocolIdentity=(value:unknown)=>{if(typeof value!=='string'||!value||value.length>256)refuse('PARAMETER','Protocol identity/code exceeds qualified bound');};
 for(const item of [...action.parameters,...action.outputs,...action.reads,...action.writes,...action.preconditions,...action.postconditions])protocolIdentity(item.id);
 for(const failure of [...action.failures,...action.preconditions.map(condition=>condition.failure),...action.postconditions.map(condition=>condition.failure)]){protocolIdentity(failure.code);if(reservedCodes.has(failure.code))refuse('PARAMETER','Declaration cannot reuse reserved profile failure code');}
 for(const position of actionReferencePositions(action))for(const value of Object.values(position.value as Record<string,unknown>))protocolIdentity(value);

 const effects=action.binding.kind==='recipe'?action.binding.effects:[];
 for(const effect of effects)protocolIdentity(effect.id);
 const fields=new Set<string>();
 const field=(reference:{module:string;element:string})=>{const identity=JSON.stringify([reference.module,reference.element]);if(fields.has(identity))return;fields.add(identity);const node=knownActionModel(source,reference,'field');if(!['boolean','integer','string'].includes(node.scalarType??'')||node.cardinality!=='one'||!['required','absent-allowed'].includes(node.nullability as string)||node.references?.length||node.itemType)refuse('ACTION_NATIVE_DOMAIN','Field is outside qualified native reference domain');};
 const record=(reference:{module:string;element:string})=>{const node=knownActionModel(source,reference,'record');for(const member of (node.members as {module:string;element:string}[]|undefined)??[])field(member as {module:string;element:string});};
 const relationship=(reference:{module:string;relationship:string})=>{const relation=knownActionRelationship(source,reference);if(!relation.directed||relation.targetLifecycle!=='independent'||relation.associationRecord)refuse('ACTION_NATIVE_RELATIONSHIP','Relationship arrangement is unqualified');for(const endpoint of [...relation.source,...relation.target])record(endpoint);};
 for(const obligation of selected.obligations.filter(item=>item.kind==='model')){
  const match=/^\/modules\/(\d+)\/(elements|relationships)\/(\d+)$/.exec(obligation.path);
  if(!match)return refuse('ACTION_NATIVE_DOMAIN','Unknown model inventory path');
  const module=source.modules[Number(match[1])]!;protocolIdentity(module.id);
  if(match[2]==='relationships'){const relation=(module.relationships as {id:string}[])[Number(match[3])]!;protocolIdentity(relation.id);relationship({module:module.id,relationship:relation.id});continue;}
  const node=module.elements[Number(match[3])]!;protocolIdentity(node.id);
  if(node.kind==='field')field({module:module.id,element:node.id});
  else if(node.kind==='record'){for(const key of (node.keys??[]) as {id:string}[])protocolIdentity(key.id);record({module:module.id,element:node.id});}
  else return refuse('ACTION_NATIVE_DOMAIN','Model kind is outside qualified native reference domain');
 }
 for(const position of actionReferencePositions(action)){const reference=position.value as {module:string;element?:string;relationship?:string};if(reference.relationship)relationship(reference as {module:string;relationship:string});if(reference.element){const node=knownActionModel(source,reference as {module:string;element:string});if(node.kind==='field')field(reference as {module:string;element:string});else if(node.kind==='record')record(reference as {module:string;element:string});}}
 for(const parameter of [...action.parameters,...action.outputs]){if(parameter.kind==='value')field(parameter.field);else record(parameter.target);}
 for(const frame of [...action.reads,...action.writes]){record(frame.record);if(frame.create||frame.delete||handler)for(const incident of referenceCreationRelationships(source,frame.record))relationship(incident.reference);for(const reference of frame.fields)field(reference);for(const reference of frame.relationships)relationship(reference);compileActionSelector(source,action,frame);}
 const bindingRecord=(binding:unknown):{module:string;element:string}=>{const value=binding as {parameter?:string;created?:string};if(value.parameter){const parameter=action.parameters.find(parameter=>parameter.id===value.parameter);if(parameter?.kind==='entity')return parameter.target;}if(value.created){const created=action.binding.kind==='recipe'?action.binding.effects.find(effect=>effect.id===value.created&&effect.kind==='create'):undefined;if(created)return created.record as {module:string;element:string};}return refuse('PARAMETER','Resolved entity binding required');};
 for(const effect of effects)if(effect.kind==='link'||effect.kind==='unlink')for(const binding of [effect.source,effect.target]){const endpoint=bindingRecord(binding);record(endpoint);for(const incident of referenceCreationRelationships(source,endpoint))relationship(incident.reference);}
 for(const effect of effects){if(effect.kind==='create'){const reference=effect.record as {module:string;element:string};record(reference);for(const incident of referenceCreationRelationships(source,reference))relationship(incident.reference);}}
 for(const condition of action.preconditions)compileActionRule(source,action,condition.rule,'pre');
 for(const condition of action.postconditions)compileActionRule(source,action,condition.rule,'post');
 const inputs=admitReferenceInputs(source,action,request.inputs),expectedVersions=canonicalReferenceVersions(action,request);
 const frames=[...action.reads.map(frame=>({frame,access:'read' as const})),...action.writes.map(frame=>({frame,access:'write' as const}))].map(({frame,access})=>({id:frame.id,access,identity:selectActionIdentity(source,action,frame,inputs)}));
 const prepared={target:request.target,source,action,inputs,frames,expectedVersions,...(handler?{deployment:{id:handler.id,version:handler.version,build:handler.build}}:{})};if(handler){const pinned=new ReferenceHandlerRegistry();pinned.install(handler);preparedHandlers.set(prepared,pinned);}return prepared;
}
