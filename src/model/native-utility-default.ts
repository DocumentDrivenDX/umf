// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document,type Json} from './types';
import type {Registry} from '../registry/registry';
import type {KindRegistration} from '../registry/kind-runtime';
import type {ExtensionKindInspection} from '../generated/core-model';
import type {SecurityRef} from '../extensions/security/types';
import type {EvaluatedSecurityRule,SecurityComposition} from '../extensions/security/logic';
interface NativeUtilities {
 copyJson(value:unknown):unknown;
 readJsonValue(text:string,format:'json'|'yaml'):unknown;
 writeJsonValue(value:unknown,format:'json'|'yaml'):string;
 inspectExtensionKinds(source:unknown,registrations?:KindRegistration[]):unknown;
 assertExactJsonNumber(token:string):void;
 composeSecurityRules(rules:readonly EvaluatedSecurityRule[],protectedFields?:readonly string[]):SecurityComposition;
 securityRefIdentity(ref:SecurityRef):string;
}
const CONTROLS=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED','HOST_CONTROL']);
/** Public data and security utility signatures over their existing Rust owners. */
export function createNativeUtilityDefaults(engine:NativeUtilities,isNative:(error:unknown)=>boolean,createRegistry:()=>Registry){
 const call=<T>(run:()=>unknown):T=>{try{return run() as T}catch(error){if(!isNative(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROLS.has(e.code))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}};
 return Object.freeze({
  copyJson:(value:unknown):Json=>call(()=>engine.copyJson(value)),
  readJsonValue:(text:string,format:'json'|'yaml'='yaml'):Json=>call(()=>engine.readJsonValue(text,format)),
  writeJsonValue:(value:unknown,format:'json'|'yaml'='yaml'):string=>call(()=>engine.writeJsonValue(value,format)),
  readProtectionSource:(text:string,format:'json'|'yaml'='json'):Json=>call(()=>engine.readJsonValue(text,format)),
  writeProtectionSource:(value:unknown,format:'json'|'yaml'='json'):string=>call(()=>engine.writeJsonValue(value,format)),
  inspectExtensionKinds:(source:Document,registry:Registry=createRegistry()):ExtensionKindInspection=>call(()=>engine.inspectExtensionKinds(source,registry.registrations())),
  assertExactJsonNumber:(token:string):void=>call(()=>engine.assertExactJsonNumber(token)),
  composeSecurityRules:(rules:readonly EvaluatedSecurityRule[],protectedFields:readonly string[]=[]):SecurityComposition=>call(()=>engine.composeSecurityRules(rules,protectedFields)),
  securityRefIdentity:(ref:SecurityRef):string=>call(()=>engine.securityRefIdentity(ref)),
 });
}
