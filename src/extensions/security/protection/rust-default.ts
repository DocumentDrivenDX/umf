// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../../model/errors';
import type {ProtectionFunctionInspector,ProtectionValueEvaluator} from './functions';
import type {ProtectionQueryPropertyInspector} from './queries';
import {configureCandidateLiteralPreparation,configureCandidateLiteralOperation,configureCoreCandidateLiteralOperation,type CandidateLiteralOperation} from '../candidate-literal-runtime';

export interface ProtectionNativeEngine {
 inspectProtectionFunction(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):unknown;
 evaluateProtectionValue(policy:unknown,catalog:unknown,closure:unknown,selection:unknown):unknown;
 inspectProtectionQueryProperties(policy:unknown,catalog:unknown,closure:unknown,use:unknown):unknown;
 prepareCandidateLiteralSource?:(source:Parameters<CandidateLiteralOperation>[0])=>{inspectCandidateLiteral(field:Parameters<CandidateLiteralOperation>[1],value:Parameters<CandidateLiteralOperation>[2],limits:Parameters<CandidateLiteralOperation>[3]):ReturnType<CandidateLiteralOperation>};
 inspectCandidateLiteral?:CandidateLiteralOperation;
 inspectCoreCandidateLiteral?:CandidateLiteralOperation;
}

function freezeReport(value:unknown):unknown{
 if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freezeReport(child);
  Object.freeze(value);
 }
 return value;
}

/** Present Rust's protection reports through the existing public API. */
export function createProtectionRustDefault(engine:ProtectionNativeEngine,isNativeError:(error:unknown)=>boolean){
 const call=<T>(operation:()=>unknown,candidateLiteral=false):T=>{
  try{return freezeReport(operation()) as T;}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(candidateLiteral||native.code.startsWith('PROTECTION_')||native.code==='REQUEST'))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 const candidateLiteral=(operation:CandidateLiteralOperation):CandidateLiteralOperation=>(...args)=>call(()=>operation(...args),true);
 if(engine.prepareCandidateLiteralSource)configureCandidateLiteralPreparation(source=>{
  const prepared=call(()=>engine.prepareCandidateLiteralSource!(source)) as ReturnType<NonNullable<ProtectionNativeEngine['prepareCandidateLiteralSource']>>;
  return (current,field,value,limits)=>{if(current!==source)throw new UmfError('PROTECTION_LITERAL_FIELD','Prepared literal source mismatch');return call(()=>prepared.inspectCandidateLiteral(field,value,limits),true);};
 });
 if(engine.inspectCandidateLiteral)configureCandidateLiteralOperation(candidateLiteral(engine.inspectCandidateLiteral));
 if(engine.inspectCoreCandidateLiteral)configureCoreCandidateLiteralOperation(candidateLiteral(engine.inspectCoreCandidateLiteral));
 return Object.freeze({
  inspectProtectionFunction(...args:Parameters<ProtectionFunctionInspector>):ReturnType<ProtectionFunctionInspector>{return call(()=>engine.inspectProtectionFunction(...args));},
  evaluateProtectionValue(...args:Parameters<ProtectionValueEvaluator>):ReturnType<ProtectionValueEvaluator>{return call(()=>engine.evaluateProtectionValue(...args));},
  inspectProtectionQueryProperties(...args:Parameters<ProtectionQueryPropertyInspector>):ReturnType<ProtectionQueryPropertyInspector>{return call(()=>engine.inspectProtectionQueryProperties(...args));},
 });
}
