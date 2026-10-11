import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {admitAction,checkActionLiteral} from './structure';
import {knownActionModel} from './known-model';
import {checkSchemaLiteral,canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../model/key-tuple';
import type {Document,Element} from '../../model/types';
import type {CoreKeyDefinition} from '../../validation/keys';
import type {Action,ActionFrame,ActionKeyReference} from './types';
import {actionExpressionError,actionExpressionText,exactActionObject,exactActionReferences,actionModelField,sameActionReference} from './expression';
export interface ActionEntityInput {key:ActionKeyReference;components:CoreLiteral[]}
export type ActionInputs=Record<string,CoreLiteral|ActionEntityInput>;
export interface CompiledActionSelector {language:'umf.actions.keys';version:'1';expression:string;frame:string;ast:{entity:string}|{key:string;components:({input:string}|{literal:CoreLiteral})[]}}
export interface SelectedActionIdentity {entity:ActionEntityInput;tupleHex:string}
function selectedKey(document:Document,reference:ActionKeyReference):{record:Element;key:CoreKeyDefinition} {
 exactActionObject(reference,['module','element','key']);
 const record=knownActionModel(document,reference,'record');
 const key=(record?.keys as CoreKeyDefinition[]|undefined)?.find(k=>k.id===reference.key);
 if(!record||!key)return actionExpressionError('ACTION_REFERENCE','Exact Record and stable Key must resolve');return {record,key};
}
/** Typed admission, without store lookup or entity existence checks. */
export function admitActionInputs(documentInput:Document,actionInput:Action,inputsInput:ActionInputs,outputs=false):ActionInputs {
 const document=copyJson(documentInput) as unknown as Document,action=admitAction(actionInput);
 if(document.umf!=='0.8.0'||!validateDocument(document).valid)actionExpressionError('ACTION_PARAMETER','Expected valid exact core 0.8.0 document');
 exactActionReferences(action);
 const inputs=copyJson(inputsInput) as unknown as ActionInputs,parameters=outputs?action.outputs:action.parameters;
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))return actionExpressionError('ACTION_PARAMETER','Inputs must be an exact parameter map');
 if(new Set(parameters.map(p=>p.id)).size!==parameters.length)actionExpressionError('ACTION_PARAMETER','Duplicate parameter identity is ambiguous');
 if(Object.keys(inputs).some(k=>!parameters.some(p=>p.id===k)))actionExpressionError('ACTION_PARAMETER','Unknown input/output identity');
 for(const parameter of parameters){
  if(!Object.hasOwn(inputs,parameter.id)){if(parameter.required)actionExpressionError('ACTION_PARAMETER','Required value is absent','/inputs/'+parameter.id);continue;}
  const supplied=inputs[parameter.id]!;
  if(parameter.kind==='value'){
   if(!checkActionLiteral(supplied))actionExpressionError('ACTION_PARAMETER','Expected exact typed literal');
   exactActionObject(parameter.field,['module','element']);const field=actionModelField(document,parameter.field);
   if(!['boolean','integer','decimal','string','binary'].includes(field.scalarType??'')||field.cardinality!=='one'||!['required','absent-allowed'].includes(field.nullability as string))actionExpressionError('ACTION_PARAMETER','Input value domain is not qualified');
   checkSchemaLiteral(document,field,supplied as CoreLiteral);
  }else{
   exactActionObject(parameter.target,['module','element','key']);const entity=exactActionObject(supplied,['key','components']) as unknown as ActionEntityInput;
   exactActionObject(entity.key,['module','element','key']);
   if(canonicalSchemaJson(entity.key)!==canonicalSchemaJson(parameter.target))actionExpressionError('ACTION_PARAMETER','Entity input must carry the declared exact Key');
   selectedKey(document,entity.key);
   encodeCoreKeyTuple(document,entity.key,entity.components as CoreKeyTupleValue[]);
  }
 }
 return inputs;
}
export function compileActionSelector(documentInput:Document,actionInput:Action,frameInput:ActionFrame):CompiledActionSelector {
 const document=copyJson(documentInput) as unknown as Document,action=copyJson(actionInput) as unknown as Action,frame=copyJson(frameInput) as unknown as ActionFrame;
 admitAction(action);exactActionReferences(action);if(document.umf!=='0.8.0'||!validateDocument(document).valid)actionExpressionError('ACTION_SELECTOR_SOURCE','Expected valid exact core 0.8.0 document');
 if(new Set(action.parameters.map(p=>p.id)).size!==action.parameters.length||new Set([...action.reads,...action.writes].map(f=>f.id)).size!==action.reads.length+action.writes.length)actionExpressionError('ACTION_SELECTOR_SYNTAX','Duplicate input/frame identity is ambiguous');
 if(![...action.reads,...action.writes].some(f=>canonicalSchemaJson(f)===canonicalSchemaJson(frame)))actionExpressionError('ACTION_SELECTOR_FRAME','Selector must retain an exact declared frame');
 exactActionObject(frame.record,['module','element']);
 const selector=frame.selector;exactActionObject(selector,['language','version','expression','references']);
 if(selector.language!=='umf.actions.keys'||selector.version!=='1')actionExpressionError('ACTION_SELECTOR_PROFILE','Unsupported exact selector language/version');
 if(frame.maxEntities!==1)actionExpressionError('ACTION_SELECTOR_BOUND','keys/1 selects exactly one identity');
 if(!Array.isArray(selector.references))actionExpressionError('ACTION_SELECTOR_SYNTAX','Expected dependency array');
 const dependency=(id:string)=>{if(!selector.references.some(r=>canonicalSchemaJson(r)===canonicalSchemaJson({parameter:id})))actionExpressionError('ACTION_SELECTOR_DEPENDENCY','Selector parameter dependency is undeclared');};
 if(selector.references.some(r=>'output'in r||'record'in r||'relationship'in r))actionExpressionError('ACTION_SELECTOR_DEPENDENCY','keys/1 cannot consult outputs or business state');
 for(const r of selector.references){exactActionObject(r,['parameter']);if(!action.parameters.some(p=>p.id===r.parameter))actionExpressionError('ACTION_REFERENCE','Selector dependency must resolve a parameter');}
 const x=actionExpressionText(selector.expression) as Record<string,unknown>;
 if(x&&Object.hasOwn(x,'entity')){
  exactActionObject(x,['entity']);const parameter=action.parameters.find(p=>p.id===x.entity);
  if(parameter?.kind!=='entity'||!sameActionReference(parameter.target,frame.record))actionExpressionError('ACTION_SELECTOR_TYPE','Entity selector must reference the frame Record');
  dependency(parameter.id);selectedKey(document,parameter.target);
  return {language:'umf.actions.keys',version:'1',expression:selector.expression,frame:frame.id,ast:{entity:parameter.id}};
 }
 exactActionObject(x,['key','components']);
 if(typeof x.key!=='string'||!x.key||!Array.isArray(x.components))actionExpressionError('ACTION_SELECTOR_SYNTAX','Expected exact Key and ordered components');
 const {key}=selectedKey(document,{module:frame.record.module,element:frame.record.element,key:x.key as string});
 if((x.components as unknown[]).length!==key.fields.length)actionExpressionError('ACTION_SELECTOR_ARITY','Components must match declared Key order/count');
 const components=(x.components as unknown[]).map((input,i)=>{
  const node=exactActionObject(input,['input','literal'],[]),field=key.fields[i]!;
  if(Object.keys(node).length!==1)actionExpressionError('ACTION_SELECTOR_SYNTAX','Expected exactly one component binding');
  if(Object.hasOwn(node,'input')){
   const parameter=action.parameters.find(p=>p.id===node.input);
   if(parameter?.kind!=='value'||!parameter.required||!sameActionReference(parameter.field,field))actionExpressionError('ACTION_SELECTOR_TYPE','Key component needs a required input of the exact Field');
   dependency(parameter.id);return {input:parameter.id};
  }
  if(!checkActionLiteral(node.literal))actionExpressionError('ACTION_SELECTOR_TYPE','Key component needs an exact typed literal wrapper');
  checkSchemaLiteral(document,actionModelField(document,field),node.literal as CoreLiteral);if(node.literal===null)actionExpressionError('ACTION_SELECTOR_TYPE','Key components cannot be null');return {literal:node.literal as CoreLiteral};
 });
 return {language:'umf.actions.keys',version:'1',expression:selector.expression,frame:frame.id,ast:{key:x.key as string,components}};
}
export function selectActionIdentity(document:Document,action:Action,frame:ActionFrame,inputsInput:ActionInputs):SelectedActionIdentity {
 const compiled=compileActionSelector(document,action,frame),inputs=admitActionInputs(document,action,inputsInput);let entity:ActionEntityInput;
 if('entity'in compiled.ast)entity=inputs[compiled.ast.entity] as ActionEntityInput;
 else entity={key:{module:frame.record.module,element:frame.record.element,key:compiled.ast.key},components:compiled.ast.components.map(c=>'input'in c?inputs[c.input] as CoreLiteral:c.literal)};
 const tuple=encodeCoreKeyTuple(document,entity.key,entity.components as CoreKeyTupleValue[]);
 return copyJson({entity,tupleHex:tuple.bytesHex}) as unknown as SelectedActionIdentity;
}
