import {checkActionLiteral} from './structure';
import {copyJson,LIMITS} from '../../model/json';
import {schemaCoefficient,checkSchemaLiteral,type CoreLiteral} from '../../model/schema-literals';
import type {Document} from '../../model/types';
import type {Action,ActionRule,ActionReference} from './types';
import {compileActionRule,actionExpressionError,actionModelField,type ActionExpression,type ActionRulePhase} from './expression';
import {admitActionInputs,type ActionInputs} from './selector';
export interface ActionFrameState {exists:boolean;values:Record<string,CoreLiteral>}
export interface ActionBusinessState {frames:Record<string,ActionFrameState>;links:{relationship:{module:string;relationship:string};sourceFrame:string;targetFrame:string}[]}
export interface ActionRuleState {inputs:ActionInputs;outputs?:ActionInputs;pre:ActionBusinessState;post?:ActionBusinessState}
export const actionFieldValueKey=(reference:ActionReference)=>JSON.stringify([reference.module,reference.element]);
const absent=Symbol('absent');type Value=CoreLiteral|typeof absent;
/** Recompiles from declaration text before evaluation; callers cannot forge a compiled-plan certificate. */
export function evaluateActionRule(document:Document,action:Action,rule:ActionRule,phase:ActionRulePhase,stateInput:ActionRuleState):boolean {
 const compiled=compileActionRule(document,action,rule,phase),state=copyJson(stateInput) as unknown as ActionRuleState;
 const inputs=admitActionInputs(document,action,state.inputs),outputs=state.outputs?admitActionInputs(document,action,state.outputs,true):{};
 const requireValue=(v:Value):CoreLiteral=>v===absent?actionExpressionError('ACTION_RULE_EVALUATION','Absent operand must be guarded with present/exists'):v;
 const bool=(v:Value):boolean=>{const x=requireValue(v);if(x===null||!Object.hasOwn(x,'boolean')||typeof (x as {boolean:unknown}).boolean!=='boolean')return actionExpressionError('ACTION_RULE_EVALUATION','Expected non-null boolean operand');return (x as {boolean:boolean}).boolean;};
 const integer=(v:Value):bigint=>{const x=requireValue(v);if(x===null||!Object.hasOwn(x,'integerToken'))return actionExpressionError('ACTION_RULE_EVALUATION','Expected non-null integer operand');return schemaCoefficient((x as {integerToken:string}).integerToken,0);};
 const frameState=(phase:ActionRulePhase,id:string):ActionFrameState=>{
  const f=state[phase]?.frames[id];if(!f||typeof f.exists!=='boolean'||!f.values||typeof f.values!=='object'||Array.isArray(f.values))return actionExpressionError('ACTION_RULE_EVALUATION','Frozen frame state is unavailable');return f;
 };
 const evaluate=(ast:ActionExpression):Value=>{
  if('literal'in ast)return ast.literal;
  if('input'in ast)return Object.hasOwn(inputs,ast.input)?inputs[ast.input] as CoreLiteral:absent;
  if('output'in ast)return Object.hasOwn(outputs,ast.output)?outputs[ast.output] as CoreLiteral:absent;
  if('state'in ast){const f=frameState(ast.state,ast.frame),key=actionFieldValueKey(ast.field);if(!f.exists)return actionExpressionError('ACTION_RULE_EVALUATION','Absent entity field reads must be guarded with exists');if(!Object.hasOwn(f.values,key))return absent;const v=f.values[key]!;if(!checkActionLiteral(v))actionExpressionError('ACTION_RULE_EVALUATION','Expected exact typed field literal');checkSchemaLiteral(document,actionModelField(document,ast.field),v);return v;}
  if('exists'in ast)return {boolean:frameState(ast.exists.state,ast.exists.frame).exists};
  if('linked'in ast){const x=ast.linked;if(!Array.isArray(state[x.state]?.links))return actionExpressionError('ACTION_RULE_EVALUATION','Relationship snapshot is unavailable');for(const link of state[x.state]!.links){if(!link||typeof link!=='object'||Object.keys(link).some(k=>!['relationship','sourceFrame','targetFrame'].includes(k))||typeof link.sourceFrame!=='string'||typeof link.targetFrame!=='string'||!link.relationship||typeof link.relationship!=='object'||Object.keys(link.relationship).some(k=>!['module','relationship'].includes(k))||typeof link.relationship.module!=='string'||typeof link.relationship.relationship!=='string')return actionExpressionError('ACTION_RULE_EVALUATION','Malformed relationship snapshot');}const s=frameState(x.state,x.sourceFrame),t=frameState(x.state,x.targetFrame);return {boolean:s.exists&&t.exists&&state[x.state]!.links.some(l=>l.sourceFrame===x.sourceFrame&&l.targetFrame===x.targetFrame&&l.relationship.module===x.relationship.module&&l.relationship.relationship===x.relationship.relationship)};}
  const first=evaluate(ast.args[0]!);
  if(ast.op==='present')return {boolean:first!==absent};
  if(ast.op==='not')return {boolean:!bool(first)};
  if(ast.op==='and')return {boolean:bool(first)&&bool(evaluate(ast.args[1]!))};
  if(ast.op==='or')return {boolean:bool(first)||bool(evaluate(ast.args[1]!))};
  const second=evaluate(ast.args[1]!);
  if(ast.op==='eq'){
   const a=requireValue(first),b=requireValue(second);if(a===null||b===null)return {boolean:a===null&&b===null};
   if(Object.hasOwn(a,'integerToken'))return {boolean:integer(a)===integer(b)};
   if(Object.hasOwn(a,'boolean'))return {boolean:bool(a)===bool(b)};
   if(Object.hasOwn(a,'string')&&Object.hasOwn(b,'string'))return {boolean:(a as {string:string}).string===(b as {string:string}).string};
   return actionExpressionError('ACTION_RULE_EVALUATION','No admitted scalar equality');
  }
  const a=integer(first),b=integer(second);
  if(ast.op==='lt')return {boolean:a<b};if(ast.op==='le')return {boolean:a<=b};if(ast.op==='gt')return {boolean:a>b};if(ast.op==='ge')return {boolean:a>=b};
  const token=(ast.op==='add'?a+b:a-b).toString();if(token.length>LIMITS.maxTextLength)actionExpressionError('LIMIT','Expanded arithmetic result exceeds core numeric bound');return {integerToken:token};
 };
 return bool(evaluate(compiled.ast));
}
