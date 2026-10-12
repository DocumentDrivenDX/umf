import {copyJson,LIMITS} from '../../model/json';
import {UmfError,type Document,type Json} from '../../model/types';
import {importProtobufDescriptorSet,exportProtobufDescriptorSet,inspectProtobuf,PROTOBUF_EXTENSION} from './index';
export interface ProtobufSourceRequest {files:Record<string,string>;roots:string[];}
/** A trusted installed compiler. It must resolve only the explicit source bundle. */
export interface ProtobufSourceCompiler {compile(request:ProtobufSourceRequest):Promise<{descriptorSet:Uint8Array;compiler:string}>;}
export async function importProtobufSources(input:ProtobufSourceRequest,compiler:ProtobufSourceCompiler,options:{id:string}):Promise<Document>{
 const request=copyJson(input) as unknown as ProtobufSourceRequest;
 if(!request.files||typeof request.files!=='object'||Array.isArray(request.files)||!Array.isArray(request.roots)||!request.roots.length)throw new UmfError('PROTOBUF_SOURCE','Expected files and nonempty roots');
 if(Object.keys(request).some(key=>!['files','roots'].includes(key)))throw new UmfError('PROTOBUF_SOURCE','Unknown source request fields');
 for(const[name,text]of Object.entries(request.files))if(!name||typeof text!=='string')throw new UmfError('PROTOBUF_SOURCE','Source files require names and text');
 if(new Set(request.roots).size!==request.roots.length||request.roots.some(root=>typeof root!=='string'||!Object.hasOwn(request.files,root)))throw new UmfError('PROTOBUF_SOURCE','Roots must name distinct supplied source files');
 if(JSON.stringify(request).length>LIMITS.maxTextLength)throw new UmfError('LIMIT','Source request exceeds limit');
 // Compile a separate copy: the archived source must not be mutable by compiler code.
 const result=await compiler.compile(copyJson(request) as unknown as ProtobufSourceRequest);
 if(!result.compiler)throw new UmfError('PROTOBUF_SOURCE','Compiler identity is required');
 const doc=importProtobufDescriptorSet(result.descriptorSet,options);
 const payload=doc.modules[0]!.elements[0]!.extensions[PROTOBUF_EXTENSION] as Record<string,Json>;
 payload.sourceArchive={role:'original',compiler:result.compiler,files:request.files,roots:request.roots};
 const resultValidation=inspectProtobuf(doc);
 if(!resultValidation.valid)throw new UmfError('PROTOBUF_SOURCE',JSON.stringify(resultValidation.diagnostics));
 return copyJson(doc) as unknown as Document;
}

export interface ProtobufSourceEmitter {emit(descriptorSet:Uint8Array):Promise<{files:Record<string,string>;compiler:string;printer:string}>;}
/** Emit current descriptors; the original source archive is never replayed. */
export async function exportProtobufSources(document:Document,emitter:ProtobufSourceEmitter){
 const binary=exportProtobufDescriptorSet(document);
 const result=copyJson(await emitter.emit(binary)) as unknown as {files:Record<string,string>;compiler:string;printer:string};
 if(!result.files||typeof result.files!=='object'||Array.isArray(result.files)||!result.compiler||!result.printer)throw new UmfError('PROTOBUF_EMIT','Invalid emitter result');
 for(const[name,text]of Object.entries(result.files))if(!name||typeof text!=='string')throw new UmfError('PROTOBUF_EMIT','Emitted files require names and text');
 return {...result,source:copyJson(document) as unknown as Document,diagnostics:[...inspectProtobuf(document).diagnostics,{code:'PROTOBUF_SOURCE_LAYOUT',path:'',severity:'warning' as const,message:'Source layout, locations and comment attachment can change during emission; retain source UMF and its original archive.'}]};
}
