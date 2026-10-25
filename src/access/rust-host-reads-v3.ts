// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PythonClientRequest} from './rust-candidate';

export const PYTHON_CLIENT_HOST_READ_V3_PROFILE='umf.python-client-host-read/3';

/** Closed synchronous callback protocol for the opt-in legacy-read V3 engine. */
export type PythonClientHostReadV3 = (
 event:PythonClientHostReadEventV3,
 argument?:string,
)=>unknown;

export interface PythonClientHostReadSessionV3 {
 readonly read:PythonClientHostReadV3;
 isAborted():boolean;
 rethrowIfAborted():void;
}

/** Serialized by Rust as its immediate-stop outcome; original error stays host-local. */
export const PYTHON_CLIENT_HOST_ABORT_V3=Object.freeze({kind:'umf.host-abort/3'} as const);

export type PythonClientHostReadEventV3=
 |'InitialPackage'
 |'ParseText'
 |'ParseFormat'
 |'DigestText'
 |'SelectRecords'
 |'NativeFormat'
 |'SelectActions'
 |'OutputPackageSuffix'
 |'OutputSourceText';

const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
const shadowedPackageModules=new Set('uuid decimal typing dataclasses datetime base64 re json enum collections'.split(' '));
const packagePattern=/^[a-z][a-z0-9_]*$/;

/**
 * Make one call-scoped callback over the original request. The event switch is
 * deliberately closed: Rust chooses each legacy semantic checkpoint, while
 * JavaScript performs only the property reads and expressions that require
 * JavaScript's own accessor, coercion, Map/Set, and exception semantics.
 */
export function createPythonClientHostReadV3(request:PythonClientRequest):PythonClientHostReadSessionV3 {
 let aborted=false,thrownValue:unknown;
 const read:PythonClientHostReadV3=(event,argument)=>{
  if(aborted)return PYTHON_CLIENT_HOST_ABORT_V3;
  try{
   switch(event){
    case 'InitialPackage':
     // Keep this as one short-circuit expression in legacy source order.
     return !request||typeof request.text!=='string'||!request.package||!packagePattern.test(request.package)||keywords.has(request.package)||shadowedPackageModules.has(request.package);
    case 'ParseText':return request.text;
    case 'ParseFormat':{
     const format=request.format;
     return format==null||format==='json'?'json':'yaml';
    }
    case 'DigestText':return request.text;
    case 'SelectRecords':{
     if(!request.records)return null;
     const selected=new Set(request.records.map(ref=>ref.module+'.'+ref.element));
     return Array.from(selected);
    }
    case 'NativeFormat':return (request.format??'json')==='json';
    case 'SelectActions':{
     if(!request.actions)return null;
     const selected=new Set(request.actions.map(ref=>ref.module+'.'+ref.action));
     return Array.from(selected);
    }
    case 'OutputPackageSuffix':return request.package+(argument??'');
    case 'OutputSourceText':return request.text;
    default:return assertNever(event);
   }
  }catch(error){
   // Do not inspect, stringify, wrap, or transport this value. Rust receives
   // only the closed marker and must stop immediately; the facade rethrows the
   // exact host value once control returns synchronously.
   aborted=true;
   thrownValue=error;
   return PYTHON_CLIENT_HOST_ABORT_V3;
  }
 };
 return Object.freeze({
  read,
  isAborted:()=>aborted,
  rethrowIfAborted(){if(aborted)throw thrownValue;},
 });
}

function assertNever(value:never):never {
 throw new TypeError(`Unknown V3 host-read event: ${String(value)}`);
}
