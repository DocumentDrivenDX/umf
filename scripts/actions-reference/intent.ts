// SPDX-License-Identifier: MIT OR Apache-2.0
import {admitReferenceInputs} from './inputs';
import type {Document} from '../../src/model/types';
import {createUmfRegistry,inspectActions,type Action,admitActionInputs,type ActionEntityInput} from '../../src/index-node-v4';
import {knownActionModel} from '../../src/extensions/actions/known-model';
import {canonicalSchemaJson,literalIdentity,type CoreLiteral} from '../../src/model/schema-literals';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../src/model/key-tuple';
import {encodeReferenceIdentity} from './codec';
import {admitReferenceRequest,canonicalReferenceVersions,type ReferenceInvokeRequest} from './protocol';
/** Exact retained typed intent, not a digest: collisions cannot establish retry equality. */
export function referenceIntent(document:Document,action:Action,requestInput:ReferenceInvokeRequest):string {
 const request=admitReferenceRequest(requestInput,'invoke'),inspection=inspectActions(document,createUmfRegistry());
 if(!inspection.validation.valid||!inspection.actions.some(candidate=>candidate.module===request.target.module&&candidate.action.id===request.target.action&&canonicalSchemaJson(candidate.action)===canonicalSchemaJson(action)))throw Error('Original revision action does not resolve');
 document=inspection.source;
 const inputs=admitReferenceInputs(document,action,request.inputs);
 const parameters=action.parameters.map(parameter=>{
  if(!Object.hasOwn(inputs,parameter.id))return {id:parameter.id,present:false};
  const value=inputs[parameter.id]!;
  if(parameter.kind==='entity'){
   const entity=value as ActionEntityInput;
   return {id:parameter.id,present:true,key:entity.key,tuple:encodeCoreKeyTuple(document,entity.key,entity.components as CoreKeyTupleValue[]).bytesHex};
  }
  return {id:parameter.id,present:true,value:value===null?null:literalIdentity(knownActionModel(document,parameter.field,'field'),value as CoreLiteral)};
 });
 return encodeReferenceIdentity({protocol:request.protocol,target:request.target,parameters,expectedVersions:canonicalReferenceVersions(action,request)});
}
