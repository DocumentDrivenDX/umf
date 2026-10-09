import {UmfError} from '../../src/model/types';
import {knownActionModel} from '../../src/extensions/actions/known-model';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import type {ActionEntityInput,ActionInputs} from '../../src/extensions/actions/selector';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {referenceEntityAliases} from './aliases';
import {referenceAliasIdentity,type FrozenReferenceState} from './state';
import type {PreparedReferenceAction} from './preparation';
import type {CandidateRecipeEffectsResult} from './recipe';
/** Output verification must not turn arbitrary returned Keys into private SQL existence probes. */
export function verifyReferenceEntityOutputs(prepared:PreparedReferenceAction,state:FrozenReferenceState,candidate:Pick<Extract<CandidateRecipeEffectsResult,{kind:'candidate'}>,'changes'>,outputs:ActionInputs):void{
 const identity=(value:ActionEntityInput)=>referenceAliasIdentity(value,encodeCoreKeyTuple(prepared.source,value.key,value.components as CoreKeyTupleValue[]).bytesHex);
 const deleted=new Set(candidate.changes.filter(change=>change.kind==='deleted').map(change=>change.entity.id));
 for(const output of prepared.action.outputs)if(output.kind==='entity'&&Object.hasOwn(outputs,output.id)){
  const value=outputs[output.id] as ActionEntityInput,wanted=identity(value);
  let permitted=candidate.changes.some(change=>change.kind==='created'&&referenceEntityAliases(prepared.source,change.entity).some(alias=>alias.identity===wanted));
  if(!permitted)permitted=prepared.action.parameters.some(parameter=>parameter.kind==='entity'&&state.parameters.get(parameter.id)&&!deleted.has(state.parameters.get(parameter.id)!.id)&&identity(prepared.inputs[parameter.id] as ActionEntityInput)===wanted);
  if(!permitted)permitted=state.frames.some(frame=>{
   if(frame.access!=='read'||!frame.entity||deleted.has(frame.entity.id))return false;
   if(identity(frame.identity)===wanted)return true;
   if(frame.entity.record.module!==value.key.module||frame.entity.record.element!==value.key.element)return false;
   const record=knownActionModel(prepared.source,frame.entity.record,'record'),key=((record.keys??[]) as {id:string;fields:{module:string;element:string}[]}[]).find(key=>key.id===value.key.key);
   const fields=new Set(state.frames.filter(alias=>alias.access==='read'&&alias.canonical===frame.canonical).flatMap(alias=>alias.fields));
   return !!key&&key.fields.every(field=>fields.has(actionFieldValueKey(field)))&&referenceEntityAliases(prepared.source,frame.entity).some(alias=>alias.identity===wanted);
  });
  if(!permitted)throw new UmfError('PARAMETER','Entity output is not a surviving admitted input, authorized read identity or created entity');
 }
}
