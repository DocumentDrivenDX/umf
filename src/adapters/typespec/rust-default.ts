// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Diagnostic,Document,Json} from '../../model/types';
import type {Registry} from '../../registry/registry';
import type {TypeSpecCompilerReport,TypeSpecGraphReport,TypeSpecJsonSchemaEmission} from './report-types';
import {TYPESPEC_EXTENSION,typespecPackage} from './package';

export type TypeSpecSourceInput={entrypoint:string;files:Record<string,string>;libraries?:Record<string,string>};
export type TypeSpecImportOptions={id:string};
type Guard=(value:unknown)=>boolean;
export type TypeSpecValidation={valid:boolean;complete:boolean;diagnostics:Diagnostic[]};
export type TypeSpecOperations={
 inspectTypeSpec(document:Document):TypeSpecValidation;
 importTypeSpecSources(input:TypeSpecSourceInput,options:TypeSpecImportOptions):Document;
 exportTypeSpecSources(document:Document):TypeSpecSourceInput;
 proposeTypeSpecSourceEdit(document:Document,path:string,text:string):{document:Document;validation:TypeSpecValidation};
 getTypeSpecSyntax(document:Document,path:string):Array<{kind:string;start:number;end:number}>;
 inspectTypeSpecPayload(payload:unknown):TypeSpecValidation;
 compileTypeSpecDocument(document:Document):Promise<TypeSpecCompilerReport>;
 getTypeSpecSemanticGraph(document:Document,input:{roots:string[]}):Promise<TypeSpecGraphReport>;
 emitTypeSpecJsonSchema(document:Document,input:{options:Record<string,unknown>}):Promise<TypeSpecJsonSchemaEmission>;
};

const CONTROLS=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function publicFailure(value:unknown,isNative:Guard):never{
 if(!isNative(value))throw value;
 const e=value as {code?:unknown;message?:unknown;path?:unknown};
 if(typeof e.code==='string'&&!CONTROLS.has(e.code)&&(e.code.startsWith('TYPESPEC_')||e.code==='REQUEST'||e.code==='LIMIT'))throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 throw value;
}
function sync<T>(isNative:Guard,fn:()=>T):T{try{return fn();}catch(error){return publicFailure(error,isNative);}}
function asyncResult<T>(isNative:Guard,fn:()=>Promise<T>):Promise<T>{try{return fn().catch(error=>publicFailure(error,isNative));}catch(error){return Promise.reject().catch(()=>publicFailure(error,isNative));}}

/** Public TypeSpec API over Rust-owned source validation and a pinned host compiler. */
export function createTypeSpecRustDefault(operations:TypeSpecOperations,isNative:Guard,makeRegistry:()=>Registry){
 const inspectTypeSpec=(document:Document)=>sync(isNative,()=>operations.inspectTypeSpec(document));
 const typespecRegistry=()=>sync(isNative,()=>makeRegistry().register(typespecPackage,(payload:Json):Diagnostic[]=>sync(isNative,()=>operations.inspectTypeSpecPayload(payload)).diagnostics));
 return Object.freeze({
  TYPESPEC_EXTENSION,typespecPackage,typespecRegistry,inspectTypeSpec,
  importTypeSpecSources:(input:TypeSpecSourceInput,options:TypeSpecImportOptions)=>sync(isNative,()=>operations.importTypeSpecSources(input,options)),
  exportTypeSpecSources:(document:Document)=>sync(isNative,()=>operations.exportTypeSpecSources(document)),
  proposeTypeSpecSourceEdit:(document:Document,path:string,text:string)=>sync(isNative,()=>operations.proposeTypeSpecSourceEdit(document,path,text)),
  getTypeSpecSyntax:(document:Document,path:string)=>sync(isNative,()=>operations.getTypeSpecSyntax(document,path)),
  compileTypeSpecDocument:(document:Document)=>asyncResult(isNative,()=>operations.compileTypeSpecDocument(document)),
  getTypeSpecSemanticGraph:(document:Document,input:{roots:string[]})=>asyncResult(isNative,()=>operations.getTypeSpecSemanticGraph(document,input)),
  emitTypeSpecJsonSchema:(document:Document,input:{options:Record<string,unknown>})=>asyncResult(isNative,()=>operations.emitTypeSpecJsonSchema(document,input)),
 });
}
