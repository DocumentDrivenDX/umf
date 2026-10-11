import {referenceEntityAliases} from './aliases';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {checkReferencePreconditions} from './preconditions';
import {copyJson} from '../../src/model/json';
import {UmfError} from '../../src/model/types';
import {qualifyReferenceCandidateRecipe} from './recipe-profile';
import {evaluateActionRule,type ActionBusinessState} from '../../src/extensions/actions/evaluation';
import type {ActionInputs} from '../../src/extensions/actions/selector';
import type {ActionAssignment,ActionEntityBinding} from '../../src/extensions/actions/types';
import type {CoreLiteral} from '../../src/model/schema-literals';
import type {PreparedReferenceAction} from './preparation';
import type {FrozenReferenceState,NativeReferenceEntity} from './state';
import {ReferenceMutationGateway} from './gateway';
export type CandidateRecipeEffectsResult={kind:'rejected'|'conflict';code:string;subject:string}|{kind:'candidate';updates:NativeReferenceEntity[];changes:{kind:'created'|'updated'|'deleted';entity:NativeReferenceEntity}[];links:ReturnType<ReferenceMutationGateway['linkChanges']>;orderedChanges:ReturnType<ReferenceMutationGateway['candidateChanges']>;effects:{effect:string;status:'verified';outcome:'changed'|'no-op'}[];pre:ActionBusinessState;post:ActionBusinessState};
export type CandidateRecipeResult=Exclude<CandidateRecipeEffectsResult,{kind:'candidate'}>|(Omit<Extract<CandidateRecipeEffectsResult,{kind:'candidate'}>,'pre'|'post'>&{postconditions:{condition:string;status:'satisfied'}[]});
/** Trusted executor composition only: no authentication, persistence or commit certificate. */
export function executeCandidateRecipeEffects(preparedInput:PreparedReferenceAction,stateInput:FrozenReferenceState):CandidateRecipeEffectsResult{
 const prepared=copyJson(preparedInput) as unknown as PreparedReferenceAction;
 // Parameters are a trusted Map from native freeze; copy values before execution.
 const state:FrozenReferenceState={links:copyJson(stateInput.links??[]) as unknown as NonNullable<FrozenReferenceState['links']>,frames:copyJson(stateInput.frames) as unknown as FrozenReferenceState['frames'],missingInputs:[...stateInput.missingInputs],parameters:new Map([...stateInput.parameters].map(([id,entity])=>[id,entity?copyJson(entity) as unknown as NativeReferenceEntity:null]))};
 const {source,action,inputs}=prepared;
 qualifyReferenceCandidateRecipe(source,action);
 const checked=checkReferencePreconditions(prepared,state);if(checked.kind!=='ready')return {kind:checked.kind,code:checked.code,subject:checked.subject};
 const gateway=new ReferenceMutationGateway(source,state),pre=checked.pre;
 const createdFrames=new Map<string,string>();
 const frameFor=(binding:ActionEntityBinding,targetReference=false):string=>{if('created' in binding){const frame=createdFrames.get(binding.created as string);if(!frame)throw new UmfError('FRAME_ACCESS','Earlier created binding required');return frame;}const entity=state.parameters.get(binding.parameter as string);if(!entity)throw new UmfError('ENTITY_MISSING','Recipe entity input absent');const input=inputs[binding.parameter as string] as {key:{module:string;element:string;key:string}};const frame=state.frames.find(frame=>(targetReference||frame.access==='write')&&frame.entity?.id===entity.id&&(!targetReference||frame.identity.key.module===input.key.module&&frame.identity.key.element===input.key.element&&frame.identity.key.key===input.key.key));if(!frame)throw new UmfError('FRAME_ACCESS','Recipe entity has no matching frozen permission/Key');return frame.id;};
 const effects:{effect:string;status:'verified';outcome:'changed'|'no-op'}[]=[];
 for(const effect of action.binding.effects){if(effect.kind==='link'||effect.kind==='unlink'){effects.push({effect:effect.id,status:'verified',outcome:gateway[effect.kind](effect.relationship as {module:string;relationship:string},frameFor(effect.source as ActionEntityBinding),frameFor(effect.target as ActionEntityBinding,true))});continue;}if(effect.kind==='delete'){effects.push({effect:effect.id,status:'verified',outcome:gateway.delete(frameFor(effect.entity as ActionEntityBinding))});continue;}const values=(effect.values as ActionAssignment[]).map(assignment=>{const binding=assignment.value,value='literal' in binding?binding.literal:inputs[binding.parameter];if(value===undefined||value!==null&&typeof value==='object'&&'key' in value)throw new UmfError('PARAMETER','Recipe assignment requires present typed value');return {field:assignment.field,value:value as CoreLiteral};});let outcome:'changed'|'no-op';if(effect.kind==='create'){const record=effect.record as {module:string;element:string},fields=Object.fromEntries(values.map(value=>[JSON.stringify([value.field.module,value.field.element]),value.value])),identity=referenceEntityAliases(source,{record,fields}).find(alias=>alias.entity.key.key===effect.key);if(!identity)throw new UmfError('FRAME_ACCESS','Qualified primary creation Key required');const frame=state.frames.find(frame=>frame.access==='write'&&frame.create&&frame.identity.key.module===record.module&&frame.identity.key.element===record.element&&frame.identity.key.key===effect.key&&encodeCoreKeyTuple(source,frame.identity.key,frame.identity.components as CoreKeyTupleValue[]).bytesHex===identity.tupleHex);if(!frame)throw new UmfError('FRAME_ACCESS','Created identity has no frozen primary create frame');outcome=gateway.create(frame.id,values);createdFrames.set(effect.id,frame.id);}else outcome=gateway.set(frameFor(effect.entity as ActionEntityBinding),values);effects.push({effect:effect.id,status:'verified',outcome});}
 const post=gateway.ruleState('post');
 return {kind:'candidate',updates:gateway.updates(),changes:gateway.changes(),links:gateway.linkChanges(),orderedChanges:gateway.candidateChanges(),effects,pre,post};
}
/** Native caller validates final storage invariants before this ordered rule stage. */
export function verifyReferencePostconditions(prepared:PreparedReferenceAction,pre:ActionBusinessState,post:ActionBusinessState,outputs:ActionInputs={}):{condition:string;status:'satisfied'}[]{
 for(const condition of prepared.action.postconditions)if(!evaluateActionRule(prepared.source,prepared.action,condition.rule,'post',{inputs:prepared.inputs,outputs,pre,post}))throw new UmfError('POSTCONDITION','Declared postcondition failed');
 return prepared.action.postconditions.map(condition=>({condition:condition.id,status:'satisfied'}));
}
/** Pure candidate convenience; native execution uses the split final-invariant/rule stages. */
export function executeCandidateRecipe(prepared:PreparedReferenceAction,state:FrozenReferenceState):CandidateRecipeResult{
 const candidate=executeCandidateRecipeEffects(prepared,state);if(candidate.kind!=='candidate')return candidate;
 const {pre,post,...result}=candidate;return {...result,postconditions:verifyReferencePostconditions(prepared,pre,post)};
}
