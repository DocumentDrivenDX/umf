// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Registry} from '../../registry/registry';
import type {Diagnostic} from '../../model/types';
import {jsonSchemaPackage} from './package';

type PublicMethods=Pick<typeof import('./index'),'importJsonSchema'|'inspectJsonSchema'|'exportJsonSchema'|'exportJsonSchemaResources'|'exportJsonSchemaBundle'|'getJsonSchemaNode'|'walkJsonSchema'|'editJsonSchemaNode'> & Pick<typeof import('../../model/native-json'),'parseNativeJson'|'parseNativeYaml'>;
type NativeMethods={[K in keyof PublicMethods]:(...args:Parameters<PublicMethods[K]>)=>unknown};
export interface JsonSchemaRustEngine extends NativeMethods {inspectJsonSchemaPayload(payload:unknown,path:string):Diagnostic[]}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
/** Adapt public signatures and Registry callbacks to the existing Rust adapter. */
export function createJsonSchemaRustDefault(engine:JsonSchemaRustEngine,isNativeError:(error:unknown)=>boolean,createRegistry:()=>Registry):PublicMethods & {jsonSchemaRegistry():Registry}{
 const call=<T>(operation:()=>unknown):T=>{try{return operation() as T;}catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}};
 const methods={} as PublicMethods;
 const names=['importJsonSchema','inspectJsonSchema','exportJsonSchema','exportJsonSchemaResources','exportJsonSchemaBundle','getJsonSchemaNode','walkJsonSchema','editJsonSchemaNode','parseNativeJson','parseNativeYaml'] as const;
 for(const name of names)Object.defineProperty(methods,name,{enumerable:true,value:(...args:unknown[])=>call(()=>Reflect.apply(engine[name],engine,args))});
 return Object.freeze(Object.assign(methods,{jsonSchemaRegistry():Registry{return createRegistry().register(jsonSchemaPackage,(payload,context)=>call(()=>engine.inspectJsonSchemaPayload(payload,context.path)));}}));
}
