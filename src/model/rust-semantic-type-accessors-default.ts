// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './errors';
import type {Document} from './types';
import type {SemanticTypeAnnotation} from '../extensions/semantic-types';

type HostJsonResponseErrorGuard=(error:unknown)=>boolean;

export interface SemanticTypeAccessorRustEngine {
 getSemanticTypes(document:unknown,module:string,element:string):unknown;
 setSemanticTypes(document:unknown,module:string,element:string,annotation:unknown):unknown;
}

function invoke<T>(operation:()=>T,isHostJsonResponseError:HostJsonResponseErrorGuard):T {
 try{return operation();}
 catch(error){
  if(!isHostJsonResponseError(error))throw error;
  const candidate=error as {name?:unknown;code?:unknown;message?:unknown;path?:unknown};
  if(candidate.code==='TYPE_ERROR')throw error;
  if(typeof candidate.code==='string'&&candidate.code!=='RESOURCE_LIMIT')
   throw new UmfError(candidate.code,String(candidate.message??candidate.code),typeof candidate.path==='string'?candidate.path:'');
  throw error;
 }
}

/** Bind the retained prototype extension accessors to the shared Rust core. */
export function bindSemanticTypeAccessorsRust(engine:SemanticTypeAccessorRustEngine,isHostJsonResponseError:HostJsonResponseErrorGuard=()=>false){
 return Object.freeze({
  getSemanticTypes(document:Document,module:string,element:string):SemanticTypeAnnotation {
   return invoke(()=>engine.getSemanticTypes(document,module,element),isHostJsonResponseError) as SemanticTypeAnnotation;
  },
  setSemanticTypes(document:Document,module:string,element:string,annotation:SemanticTypeAnnotation):Document {
   return invoke(()=>engine.setSemanticTypes(document,module,element,annotation),isHostJsonResponseError) as Document;
  },
 });
}
