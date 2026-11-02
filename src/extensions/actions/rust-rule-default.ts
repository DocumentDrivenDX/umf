// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {evaluateActionRule} from './evaluation';
interface NativeActionRuleEngine {
 evaluateActionRule(...args:Parameters<typeof evaluateActionRule>):boolean;
}
/** Host presentation only: the Rust evaluator compiles and evaluates the rule. */
export function createActionRuleRustDefault(createEngine:()=>NativeActionRuleEngine,isNativeError:(error:unknown)=>boolean){
 let engine:NativeActionRuleEngine|undefined;
 return function evaluate(...args:Parameters<typeof evaluateActionRule>):boolean{
  try{return (engine??=createEngine()).evaluateActionRule(...args);}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code!=='string'||!native.code.startsWith('ACTION_')&&native.code!=='LIMIT'&&native.code!=='CORE_SCHEMA_PROPERTIES')throw error;
   throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  }
 };
}
