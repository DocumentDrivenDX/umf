// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import type {PythonClientRequest,PythonClientResult} from './rust-candidate';
import {createPythonClientHostReadV3,type PythonClientHostReadV3} from './rust-host-reads-v3';
import {createPythonClientHostReadV4} from './rust-host-reads-v4';

// Bundlers may disambiguate duplicate internal class identifiers (for example
// UmfError2). The direct API exposes constructor.name, so keep its observable
// error constructor name stable in the opt-in candidate bundle.
Object.defineProperty(UmfError,'name',{value:'UmfError',configurable:true});

export interface PythonClientEngine {
 generatePythonClient(request:PythonClientRequest):unknown;
}

export interface PythonClientHostEngineV3 {
 generatePythonClientWithHost(readHost:PythonClientHostReadV3):unknown;
}

export interface PythonClientHostEngineV4 {
 generatePythonClientWithHost(readHost:PythonClientHostReadV3,profile:'umf.python-client-host-read/4'):unknown;
}

/** Build an opt-in V3 generator that lets Rust request legacy JavaScript reads. */
export function createPythonClientRustGeneratorV3(engine:PythonClientHostEngineV3):(request:PythonClientRequest)=>PythonClientResult {
 if(!engine||typeof engine.generatePythonClientWithHost!=='function')throw new UmfError('RUST_CODEGEN_UNAVAILABLE','Rust codegen binding does not expose the V3 host-read operation');
 return request=>{
  // Both callback and any host-owned selection state are scoped to this call.
  // In particular, no generator-wide lock is held while Rust calls into JS.
  const host=createPythonClientHostReadV3(request);
  let result:unknown;
  try{result=engine.generatePythonClientWithHost(host.read);}
  catch(error){
   if(host.isAborted())host.rethrowIfAborted();
   if(error instanceof UmfError)throw error;
   if(error&&typeof error==='object'){
    const value=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
    if(value.code==='INPUT'&&value.message==='Source contains an unpaired UTF-16 surrogate')throw new Error('INPUT');
    if(value.code==='LIMIT'&&value.message==='Source text limit exceeded')
     throw new UmfError('LIMIT','Source text exceeds limit',typeof value.path==='string'?value.path:'');
    if(typeof value.code==='string'&&typeof value.message==='string')
     throw new UmfError(value.code,value.message,typeof value.path==='string'?value.path:typeof value.pointer==='string'?value.pointer:'');
   }
   throw error;
  }
  host.rethrowIfAborted();
  if(!result||typeof result!=='object'||Array.isArray(result))throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
  const value=result as Record<string,unknown>;
  if(typeof value.sourceDigest!=='string'||!value.description||typeof value.description!=='object'||Array.isArray(value.description)||!Array.isArray(value.files)||value.files.some(file=>!file||typeof file!=='object'||typeof (file as any).path!=='string'||typeof (file as any).text!=='string'||typeof (file as any).sha256!=='string'))
   throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
  return result as PythonClientResult;
 };
}

/** Build an opt-in V4 generator with bounded captured selection traversal. */
export function createPythonClientRustGeneratorV4(engine:PythonClientHostEngineV4):(request:PythonClientRequest)=>PythonClientResult {
 if(!engine||typeof engine.generatePythonClientWithHost!=='function')throw new UmfError('RUST_CODEGEN_UNAVAILABLE','Rust codegen binding does not expose the V4 host-read operation');
 return request=>{
  const host=createPythonClientHostReadV4(request);
  let result:unknown;
  try{result=engine.generatePythonClientWithHost(host.read,'umf.python-client-host-read/4');}
  catch(error){
   if(host.isAborted())host.rethrowIfAborted();
   if(error instanceof UmfError)throw error;
   if(error&&typeof error==='object'){
    const value=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
    if(value.code==='INPUT'&&value.message==='Source contains an unpaired UTF-16 surrogate')throw new Error('INPUT');
    if(value.code==='LIMIT'&&value.message==='Source text limit exceeded')
     throw new UmfError('LIMIT','Source text exceeds limit',typeof value.path==='string'?value.path:'');
    if(typeof value.code==='string'&&typeof value.message==='string')throw new UmfError(value.code,value.message,typeof value.path==='string'?value.path:typeof value.pointer==='string'?value.pointer:'');
   }
   throw error;
  }
  host.rethrowIfAborted();
  if(!result||typeof result!=='object'||Array.isArray(result))throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
  const value=result as Record<string,unknown>;
  if(typeof value.sourceDigest!=='string'||!value.description||typeof value.description!=='object'||Array.isArray(value.description)||!Array.isArray(value.files)||value.files.some(file=>!file||typeof file!=='object'||typeof (file as any).path!=='string'||typeof (file as any).text!=='string'||typeof (file as any).sha256!=='string'))
   throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
  return result as PythonClientResult;
 };
}

/** Build a synchronous generator around one already initialized host engine. */
export function createPythonClientRustGenerator(engine:PythonClientEngine):(request:PythonClientRequest)=>PythonClientResult {
 if(!engine||typeof engine.generatePythonClient!=='function')throw new UmfError('RUST_CODEGEN_UNAVAILABLE','Rust codegen binding does not expose generatePythonClient');
 return request=>{
  const snapshot=snapshotRequest(request);
  try{
   const result=engine.generatePythonClient(snapshot);
   if(!result||typeof result!=='object'||Array.isArray(result))throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
   const value=result as Record<string,unknown>;
   if(typeof value.sourceDigest!=='string'||!value.description||typeof value.description!=='object'||Array.isArray(value.description)||!Array.isArray(value.files)||value.files.some(file=>!file||typeof file!=='object'||typeof (file as any).path!=='string'||typeof (file as any).text!=='string'||typeof (file as any).sha256!=='string'))
    throw new UmfError('RUST_CODEGEN_INVALID_RESULT','Rust codegen returned an invalid Python client result');
   return result as PythonClientResult;
  }
  catch(error){
   if(error instanceof UmfError)throw error;
   if(error&&typeof error==='object'){
    const value=error as {code?:unknown;message?:unknown;path?:unknown;pointer?:unknown};
    if(value.code==='INPUT'&&value.message==='Source contains an unpaired UTF-16 surrogate')throw new Error('INPUT');
    if(value.code==='LIMIT'&&value.message==='Source text limit exceeded')
     throw new UmfError('LIMIT','Source text exceeds limit',typeof value.path==='string'?value.path:'');
    if(typeof value.code==='string'&&typeof value.message==='string')
     throw new UmfError(value.code,value.message,typeof value.path==='string'?value.path:typeof value.pointer==='string'?value.pointer:'');
   }
   throw error;
  }
 };
}

/**
 * V2 intentionally snapshots request properties before Rust validation. Reads
 * occur once in order: text, package, format, records, actions. This is an
 * explicit opt-in contract; accessor side effects and crossed failures can
 * therefore be observed in a different order than the legacy direct API.
 */
function snapshotRequest(request:PythonClientRequest):PythonClientRequest {
 if(!request||typeof request!=='object')throw new UmfError('ACCESS_UNSUPPORTED','Ordinary non-shadowing Python package required','/package');
 const source=request as PythonClientRequest;
 const text=source.text;
 if(typeof text!=='string')throw new UmfError('ACCESS_UNSUPPORTED','Ordinary non-shadowing Python package required','/package');
 const packageName=source.package;
 if(!packageName)throw new UmfError('ACCESS_UNSUPPORTED','Ordinary non-shadowing Python package required','/package');
 const format=source.format;
 const records=source.records;
 const actions=source.actions;
 return {
  text,package:packageName,
  ...(format===undefined?{}:{format}),
  ...(records===undefined?{}:{records:records.map(record=>({module:record.module,element:record.element}))}),
  ...(actions===undefined?{}:{actions:actions.map(action=>({module:action.module,action:action.action}))}),
 };
}
