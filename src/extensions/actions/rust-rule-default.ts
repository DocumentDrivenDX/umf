// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ActionRuleState, ActionRulePhase} from './runtime-types';
import type {Action,ActionRule} from './types';
interface NativeActionRuleEngine {
 evaluateActionRule(document:unknown,action:unknown,rule:unknown,phase:unknown,state:unknown):boolean;
}
/** Host presentation only: the Rust evaluator compiles and evaluates the rule. */
export function createActionRuleRustDefault(createEngine:()=>NativeActionRuleEngine,isNativeError:(error:unknown)=>boolean){
 let engine:NativeActionRuleEngine|undefined;
 return function evaluate(document:unknown,action:Action,rule:ActionRule,phase:ActionRulePhase,state:ActionRuleState):boolean{
  try{return (engine??=createEngine()).evaluateActionRule(document,action,rule,phase,state);}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code!=='string'||!native.code.startsWith('ACTION_')&&native.code!=='LIMIT'&&native.code!=='CORE_SCHEMA_PROPERTIES')throw error;
   throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  }
 };
}
