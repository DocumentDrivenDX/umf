import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {admitAction,checkActionLiteral} from './structure';
import {actionReferencePositions} from './references';
import {knownActionModel,knownActionRelationship} from './known-model';
import {readJsonValue} from '../../model/serialization';
import {UmfError,type Document,type Element,pointer} from '../../model/types';
import {checkSchemaLiteral,type CoreLiteral,schemaCoefficient} from '../../model/schema-literals';
import type {Action,ActionFrame,ActionReference,ActionRule,ActionParameter} from './types';
export type ActionRulePhase='pre'|'post';
export type ActionExpression = {literal:CoreLiteral}|{input:string}|{output:string}|{state:ActionRulePhase;frame:string;field:ActionReference}|{exists:{state:ActionRulePhase;frame:string}}|{linked:{state:ActionRulePhase;relationship:{module:string;relationship:string};sourceFrame:string;targetFrame:string}}|{op:'present'|'eq'|'lt'|'le'|'gt'|'ge'|'add'|'sub'|'and'|'or'|'not';args:ActionExpression[]};
export interface CompiledActionRule {language:'umf.actions.rules';version:'1';phase:ActionRulePhase;expression:string;ast:ActionExpression;type:'boolean';dependencies:ActionRule['references']}
export interface ActionExpressionType {family:'boolean'|'integer'|'string'|'null';nullable:boolean}
export const actionExpressionLimits={depth:32,nodes:512,text:65536} as const;
export function actionExpressionError(code:string,message:string,path=''):never {throw new UmfError(code,message,path);}
export const sameActionReference=(a:ActionReference,b:ActionReference)=>a.module===b.module&&a.element===b.element;
export function actionModelField(document:Document,reference:ActionReference):Element {
 exactActionObject(reference,['module','element']);
 return knownActionModel(document,reference,'field');
}
export function actionFieldType(document:Document,reference:ActionReference):ActionExpressionType {
 const field=actionModelField(document,reference);
 if(!['boolean','integer','string'].includes(field.scalarType??'')||field.cardinality!=='one'||!['required','absent-allowed'].includes(field.nullability as string)||field.references?.some(r=>r.role==='record-type'))actionExpressionError('ACTION_RULE_TYPE','Field is outside rules/1 scalar subset');
 return {family:field.scalarType as 'boolean'|'integer'|'string',nullable:field.nullability==='absent-allowed'};
}
export function exactActionObject(value:unknown,keys:string[],required=keys,path=''):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return actionExpressionError('ACTION_RULE_SYNTAX','Expected object',path);
 const object=value as Record<string,unknown>;
 if(Object.keys(object).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(object,k)))actionExpressionError('ACTION_RULE_SYNTAX','Unknown or missing expression member',path);
 return object;
}
/** Strict consumers never drop qualifiers on any declared local model reference. */
export function exactActionReferences(action:Action):void {
 for(const reference of actionReferencePositions(action))exactActionObject(reference.value,reference.keys,reference.keys,reference.path);
}
export function actionExpressionText(text:string):unknown {
 if(typeof text!=='string'||!text||text.length>actionExpressionLimits.text)actionExpressionError('LIMIT','Expression text exceeds bounded profile');
 return readJsonValue(text,'json');
}
function identifier(value:unknown,path:string):string {
 if(typeof value!=='string'||!value)actionExpressionError('ACTION_RULE_SYNTAX','Expected exact nonempty identity',path);return value as string;
}
export function compileActionRule(documentInput:Document,actionInput:Action,ruleInput:ActionRule,phase:ActionRulePhase):CompiledActionRule {
 const document=copyJson(documentInput) as unknown as Document,action=copyJson(actionInput) as unknown as Action,rule=copyJson(ruleInput) as unknown as ActionRule;
 admitAction(action);exactActionReferences(action);if(document.umf!=='0.8.0'||!validateDocument(document).valid)actionExpressionError('ACTION_RULE_SOURCE','Expected valid exact core 0.8.0 document');
 for(const list of [action.parameters,action.outputs,[...action.reads,...action.writes]])if(new Set(list.map(entry=>entry.id)).size!==list.length)actionExpressionError('ACTION_RULE_SYNTAX','Duplicate declaration identity is ambiguous');
 if(phase!=='pre'&&phase!=='post')actionExpressionError('ACTION_RULE_PHASE','Expected pre/post phase');
 if(rule.language!=='umf.actions.rules'||rule.version!=='1')actionExpressionError('ACTION_RULE_PROFILE','Unsupported exact rule language/version');
 exactActionObject(rule,['language','version','expression','references']);
 if(!Array.isArray(rule.references))actionExpressionError('ACTION_RULE_SYNTAX','Rule references must be an array');
 for(const reference of rule.references){
  const keys=Object.keys(reference);if(keys.length!==1||!['parameter','output','record','relationship'].includes(keys[0]!))actionExpressionError('ACTION_RULE_DEPENDENCY','Unknown dependency annotation');
  if('parameter'in reference&&!action.parameters.some(p=>p.id===reference.parameter))actionExpressionError('ACTION_RULE_DEPENDENCY','Parameter dependency does not resolve');
  if('output'in reference&&(phase!=='post'||!action.outputs.some(p=>p.id===reference.output)))actionExpressionError('ACTION_RULE_DEPENDENCY','Output dependency is forbidden or missing');
  if('record'in reference){const r=exactActionObject(reference.record,['module','element']);if(!document.modules.find(m=>m.id===r.module)?.elements.some(e=>e.id===r.element&&e.kind==='record'))actionExpressionError('ACTION_RULE_DEPENDENCY','Record dependency does not resolve');}
  if('relationship'in reference){const r=exactActionObject(reference.relationship,['module','relationship']);if(!((document.modules.find(m=>m.id===r.module)?.relationships??[]) as {id:string}[]).some(e=>e.id===r.relationship))actionExpressionError('ACTION_RULE_DEPENDENCY','Relationship dependency does not resolve');}
 }
 const dependencies:ActionRule['references']=[],readFrames=new Map(action.reads.map(f=>[f.id,f]));let nodes=0;
 const dependency=(ref:ActionRule['references'][number])=>{
  if(!rule.references.some(r=>JSON.stringify(r)===JSON.stringify(ref)||equalReference(r,ref)))actionExpressionError('ACTION_RULE_DEPENDENCY','Expression dependency must be explicitly declared');
  if(!dependencies.some(r=>equalReference(r,ref)))dependencies.push(ref);
 };
 const scalar=(parameter:ActionParameter|undefined,path:string):ActionExpressionType=>{
  if(!parameter||parameter.kind!=='value')return actionExpressionError('ACTION_RULE_TYPE','Scalar expression must reference a declared value parameter',path);
  return actionFieldType(document,parameter.field);
 };
 const frame=(id:unknown,state:unknown,path:string):ActionFrame=>{
  if(state!=='pre'&&state!=='post')actionExpressionError('ACTION_RULE_PHASE','State must be pre/post',path);
  if(state==='post'&&phase!=='post')actionExpressionError('ACTION_RULE_PHASE','Post-state is forbidden in preconditions',path);
  const f=readFrames.get(identifier(id,path));if(!f)return actionExpressionError('ACTION_RULE_FRAME','Business reads require a declared read frame',path);
  const record=knownActionModel(document,f.record,'record');
  if(!record||f.create||f.delete||f.fields.some(field=>!((record.members??[]) as ActionReference[]).some(member=>sameActionReference(member,field))))actionExpressionError('ACTION_RULE_FRAME','Read frame must have exact Record membership and no write permissions',path);
  if(f.maxEntities!==1)actionExpressionError('ACTION_RULE_FRAME','rules/1 requires exactly one frozen identity per read frame',path);
  dependency({record:{module:f.record.module,element:f.record.element}});return f;
 };
 const parse=(input:unknown,depth=1,path=''): {ast:ActionExpression;type:ActionExpressionType}=>{
  if(depth>actionExpressionLimits.depth||++nodes>actionExpressionLimits.nodes)actionExpressionError('LIMIT','Expression depth/node bound exceeded',path);
  if(!input||typeof input!=='object'||Array.isArray(input))return actionExpressionError('ACTION_RULE_SYNTAX','Expression must be an object',path);
  const x=input as Record<string,unknown>,at=(k:string)=>path+'/'+pointer(k);
  if(Object.hasOwn(x,'literal')){
   exactActionObject(x,['literal'],['literal'],path);const literal=x.literal as CoreLiteral;
   if(literal===null)return {ast:{literal:null},type:{family:'null',nullable:true}};
   if(!checkActionLiteral(literal))actionExpressionError('ACTION_RULE_TYPE','Expected exact typed literal',path);
   exactActionObject(literal,['boolean','integerToken','string'],[],at('literal'));
   if(Object.keys(literal).length!==1)actionExpressionError('ACTION_RULE_TYPE','Expected one supported scalar literal wrapper',path);
   const family=Object.hasOwn(literal,'boolean')?'boolean':Object.hasOwn(literal,'integerToken')?'integer':'string';
   checkSchemaLiteral(document,{id:'literal',kind:'field',scalarType:family,cardinality:'one',nullability:'required',extensions:{}},literal);
   return {ast:{literal},type:{family,nullable:false}};
  }
  if(Object.hasOwn(x,'input')||Object.hasOwn(x,'output')){
   const output=Object.hasOwn(x,'output'),key=output?'output':'input';exactActionObject(x,[key],[key],path);
   const id=identifier(x[key],at(key));if(output&&phase!=='post')actionExpressionError('ACTION_RULE_PHASE','Outputs are forbidden in preconditions',path);
   dependency(output?{output:id}:{parameter:id});const type=scalar((output?action.outputs:action.parameters).find(p=>p.id===id),path);
   return {ast:output?{output:id}:{input:id},type};
  }
  if(Object.hasOwn(x,'state')){
   exactActionObject(x,['state','frame','field'],['state','frame','field'],path);const f=frame(x.frame,x.state,path),reference=exactActionObject(x.field,['module','element']) as unknown as ActionReference;
   identifier(reference.module,path);identifier(reference.element,path);
   if(!f.fields.some(r=>sameActionReference(r,reference)))actionExpressionError('ACTION_RULE_FRAME','Field is outside declared read access',path);
   return {ast:{state:x.state as ActionRulePhase,frame:f.id,field:reference},type:actionFieldType(document,reference)};
  }
  if(Object.hasOwn(x,'exists')){
   exactActionObject(x,['exists'],['exists'],path);const e=exactActionObject(x.exists,['state','frame']),f=frame(e.frame,e.state,path);
   return {ast:{exists:{state:e.state as ActionRulePhase,frame:f.id}},type:{family:'boolean',nullable:false}};
  }
  if(Object.hasOwn(x,'linked')){
   exactActionObject(x,['linked'],['linked'],path);const e=exactActionObject(x.linked,['state','relationship','sourceFrame','targetFrame']),source=frame(e.sourceFrame,e.state,path),target=frame(e.targetFrame,e.state,path);
   const reference=exactActionObject(e.relationship,['module','relationship']) as unknown as {module:string;relationship:string};identifier(reference.module,path);identifier(reference.relationship,path);
   dependency({relationship:reference});
   const relationship=knownActionRelationship(document,reference);
   if(!relationship||relationship.directed!==true||!['independent','unspecified'].includes(relationship.targetLifecycle)||relationship.associationRecord)actionExpressionError('ACTION_RULE_RELATIONSHIP','linked requires a supported independent directed set relationship',path);
   if(!relationship.source.some((r:ActionReference)=>sameActionReference(r,source.record))||!relationship.target.some((r:ActionReference)=>sameActionReference(r,target.record))||!source.relationships.some(r=>r.module===reference.module&&r.relationship===reference.relationship))actionExpressionError('ACTION_RULE_FRAME','linked endpoints/orientation/read relationship access disagree',path);
   return {ast:{linked:{state:e.state as ActionRulePhase,relationship:reference,sourceFrame:source.id,targetFrame:target.id}},type:{family:'boolean',nullable:false}};
  }
  exactActionObject(x,['op','args'],['op','args'],path);const op=identifier(x.op,at('op'));
  if(!['present','eq','lt','le','gt','ge','add','sub','and','or','not'].includes(op)||!Array.isArray(x.args)||x.args.length!==(['present','not'].includes(op)?1:2))actionExpressionError('ACTION_RULE_SYNTAX','Unknown operator or wrong arity',path);
  const parts=(x.args as unknown[]).map((a,i)=>parse(a,depth+1,path+'/args/'+i)),families=parts.map(p=>p.type.family);
  if(op==='eq'){
   const [a,b]=parts.map(p=>p.type);if(!a||!b||a.family!==b.family&&!(a.family==='null'&&b.nullable||b.family==='null'&&a.nullable))actionExpressionError('ACTION_RULE_TYPE','Equality needs the same scalar family or compatible explicit nullable null',path);
  }else if(['lt','le','gt','ge','add','sub'].includes(op)){if(families.some(f=>f!=='integer'))actionExpressionError('ACTION_RULE_TYPE','Integer operator requires integer operands',path);}
  else if(op!=='present'&&families.some(f=>f!=='boolean'))actionExpressionError('ACTION_RULE_TYPE','Boolean operator requires boolean operands',path);
  return {ast:{op:op as Extract<ActionExpression,{op:string}>['op'],args:parts.map(p=>p.ast)},type:{family:['add','sub'].includes(op)?'integer':'boolean',nullable:false}};
 };
 const result=parse(actionExpressionText(rule.expression));if(result.type.family!=='boolean')actionExpressionError('ACTION_RULE_TYPE','Conditions require a boolean result');
 return {language:'umf.actions.rules',version:'1',phase,expression:rule.expression,ast:result.ast,type:'boolean',dependencies};
}
function equalReference(a:ActionRule['references'][number],b:ActionRule['references'][number]):boolean {
 const keys=Object.keys(a);if(keys.length!==1||keys[0]!==Object.keys(b)[0])return false;
 if('parameter'in a&&'parameter'in b)return a.parameter===b.parameter;
 if('output'in a&&'output'in b)return a.output===b.output;
 if('record'in a&&'record'in b)return sameActionReference(a.record as ActionReference,b.record as ActionReference)&&Object.keys(a.record as object).length===2;
 if('relationship'in a&&'relationship'in b){const x=a.relationship as {module:string;relationship:string},y=b.relationship as typeof x;return x.module===y.module&&x.relationship===y.relationship&&Object.keys(x).length===2;}
 return false;
}
