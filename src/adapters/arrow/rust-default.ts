// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import {UmfError} from '../../model/errors';
import type {
 exportArrowSchema, getArrowNode, importArrowSchema, inspectArrow, proposeArrowNodeEdit,
} from './index';
export {UmfError};

/** The common five-operation surface exposed by the Node and WASM bindings. */
export interface ArrowSchemaRustEngine {
 importSchema(source:string,id:string):unknown;
 exportSchema(document:unknown):unknown;
 inspect(document:unknown):unknown;
 getNode(document:unknown,pointer:string):unknown;
 proposeNodeEdit(document:unknown,pointer:string,replacementJson:string):unknown;
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;

function rustCall<T>(operation:()=>T,isNativeUmfCoreError:NativeCoreErrorGuard):T {
 try{return operation();}
 catch(error){
  if(!isNativeUmfCoreError(error))throw error;
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate?.name==='UmfCoreError'&&typeof candidate.code==='string'&&
   (candidate.code.startsWith('ARROW_')||candidate.code==='JSON_SCHEMA_SYNTAX'||candidate.code==='JSON_SCHEMA_POINTER'))
   throw new UmfError(candidate.code,String(candidate.message??''),typeof candidate.path==='string'?candidate.path:'');
  throw error;
 }
}

/** Select the Rust Arrow schema JSON operations for a V4 Node or browser root. */
export function bindArrowSchemaRust(engine:ArrowSchemaRustEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false){
 const call=<T>(operation:()=>T)=>rustCall(operation,isNativeUmfCoreError);
 return Object.freeze({
  importArrowSchema(text:string,options:{id:string}):ReturnType<typeof importArrowSchema>{
   // Keep the predecessor's single read of options.id before crossing the host boundary.
   const id=options.id;
   return call(()=>engine.importSchema(text,id)) as ReturnType<typeof importArrowSchema>;
  },
  inspectArrow(document:Document):ReturnType<typeof inspectArrow>{
   return call(()=>engine.inspect(document)) as ReturnType<typeof inspectArrow>;
  },
  exportArrowSchema(document:Document):ReturnType<typeof exportArrowSchema>{
   return call(()=>engine.exportSchema(document)) as ReturnType<typeof exportArrowSchema>;
  },
  getArrowNode(document:Document,path:string):ReturnType<typeof getArrowNode>{
   return call(()=>engine.getNode(document,path)) as ReturnType<typeof getArrowNode>;
  },
  proposeArrowNodeEdit(document:Document,path:string,text:string):ReturnType<typeof proposeArrowNodeEdit>{
   return call(()=>engine.proposeNodeEdit(document,path,text)) as ReturnType<typeof proposeArrowNodeEdit>;
  },
 });
}
