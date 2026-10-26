// SPDX-License-Identifier: MIT OR Apache-2.0
// Browser-only parity body; the WASM module is injected by the harness.
import {securityNot} from '../../../src/extensions/security/logic.ts';
import {createSecurityNotRustAdapter} from '../../../src/extensions/security/rust-not-adapter.ts';
import {createSecurityLogicEngine} from '../../../bindings/core/wasm/index.js';

const cases=['T','F','U','null','number','boolean','unknown-string','array','object','null-prototype','accessor','proxy-ownKeys','proxy-getPrototype','proxy-get'];
function input(name:string,trace:string[]):unknown {
  switch(name){
    case 'T':return 'T'; case 'F':return 'F'; case 'U':return 'U'; case 'null':return null;
    case 'number':return 1; case 'boolean':return true; case 'unknown-string':return 'X';
    case 'array':return []; case 'object':return {};
    case 'null-prototype':return Object.create(null);
    case 'accessor':return Object.defineProperty({},'member',{enumerable:true,get(){trace.push('getter');return 'T';}});
    case 'proxy-ownKeys':return new Proxy({}, {ownKeys(){trace.push('ownKeys');throw new Error('ownKeys trap');}});
    case 'proxy-getPrototype':return new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');throw new Error('prototype trap');}});
    case 'proxy-get':return new Proxy({}, {get(){trace.push('get');return 'T';}});
    default:throw new Error(`unknown case: ${name}`);
  }
}
function outcome(fn:(value:any)=>unknown,value:unknown,trace:string[]){
  try{return {kind:'return',value:fn(value),trace};}
  catch(error:any){return {kind:'throw',name:error.name,constructor:error.constructor?.name??null,code:error.code??null,message:String(error.message),path:error.path??null,trace};}
}
export function runSecurityNotBrowserCases(module:Record<string,any>){
  const raw=createSecurityLogicEngine(module);
  const guarded=createSecurityNotRustAdapter(raw);
  const rows=Object.fromEntries(cases.map(name=>{
    const referenceTrace:string[]=[],rawTrace:string[]=[],guardedTrace:string[]=[];
    const reference=outcome(securityNot,input(name,referenceTrace),referenceTrace);
    const rawOutcome=outcome(raw.securityNot,input(name,rawTrace),rawTrace);
    const guardedOutcome=outcome(guarded,input(name,guardedTrace),guardedTrace);
    return [name,{reference,raw:rawOutcome,rawEqual:JSON.stringify(reference)===JSON.stringify(rawOutcome),guarded:guardedOutcome,guardedEqual:JSON.stringify(reference)===JSON.stringify(guardedOutcome)}];
  }));
  return {cases,rows};
}
