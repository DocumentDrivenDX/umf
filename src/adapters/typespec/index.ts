import {typeSpecLibraries} from './libraries';
import {parse,visitChildren,SyntaxKind,type Node} from '@typespec/compiler/ast';
import manifest from '../../../spec/extensions/typespec/package.json';
import {createValidator} from '../../validation/schema';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson,LIMITS} from '../../model/json';
import {UmfError,pointer,type Document,type Diagnostic,type Json,type ExtensionPackage} from '../../model/types';
import {checkTypeSpecSources} from './compiler';
export const TYPESPEC_EXTENSION='umf.typespec';
export const typespecPackage=manifest as unknown as ExtensionPackage;
export interface TypeSpecPayload {profile:'typespec-1.16.0-sources';entrypoint:string;files:Record<string,string>;libraries?:Record<string,string>;}
const structure=createValidator().compile(manifest.schema);
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as TypeSpecPayload;const out:Diagnostic[]=[];
 for(const key of Object.keys(p))if(!['profile','entrypoint','files','libraries'].includes(key))out.push({code:'TYPESPEC_REPRESENTATION',path:'/'+pointer(key),severity:'warning',message:'Unknown source representation field cannot be emitted natively'});
 for(const [name,version]of Object.entries(p.libraries??{}))if(!Object.hasOwn(typeSpecLibraries,name)||typeSpecLibraries[name]!.version!==version)out.push({code:'TYPESPEC_LIBRARY_UNAVAILABLE',path:'/libraries/'+pointer(name),severity:'warning',message:'Unregistered library selection retained: '+name+'@'+version});
 if(!Object.hasOwn(p.files,p.entrypoint))out.push({code:'TYPESPEC_ENTRYPOINT',path:'/entrypoint',severity:'error',message:'Entrypoint must name a supplied file'});
 let size=0;
 for(const [path,text]of Object.entries(p.files)){
  if(!/^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.tsp$/.test(path)||path.split('/').some(x=>x==='.'||x==='..')){out.push({code:'TYPESPEC_PATH',path:'/files/'+pointer(path),severity:'error',message:'Source paths must be relative .tsp paths without traversal'});continue;}
  size+=text.length;if(size>LIMITS.maxTextLength){out.push({code:'LIMIT',path:'/files',severity:'error',message:'Source bundle exceeds text limit'});break;}
  try{for(const d of parse(text,{comments:true,docs:true}).parseDiagnostics)out.push({code:'TYPESPEC_'+d.code,path:'/files/'+pointer(path),severity:d.severity,message:d.message});}catch(error){out.push({code:'TYPESPEC_PARSE',path:'/files/'+pointer(path),severity:'error',message:String(error)});}
 }
 out.push({code:'TYPESPEC_COMPILATION_REQUIRED',path:'',severity:'warning',message:'Syntax preservation does not establish compiler validity; call compileTypeSpecDocument with supplied imports'});return out;
}
export function typespecRegistry(){return new Registry().register(typespecPackage,inspect);}
export function inspectTypeSpec(document:Document){return validateDocument(document,typespecRegistry());}
function payload(document:Document):TypeSpecPayload {
 const checked=inspectTypeSpec(document);if(!checked.valid)throw new UmfError('TYPESPEC_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[TYPESPEC_EXTENSION];
 if(document.vocabularies[TYPESPEC_EXTENSION]?.version!=='0.1.0'||!structure(value))throw new UmfError('TYPESPEC_PAYLOAD','Missing TypeSpec source bundle');return copyJson(value) as unknown as TypeSpecPayload;
}
export function importTypeSpecSources(input:{entrypoint:string;files:Record<string,string>;libraries?:Record<string,string>},options:{id:string}):Document {
 const supplied=copyJson(input) as unknown as typeof input;if(Object.keys(supplied).some(k=>!['entrypoint','files','libraries'].includes(k)))throw new UmfError('TYPESPEC_INPUT','Unknown source-bundle option');
 const value:TypeSpecPayload={profile:'typespec-1.16.0-sources',...supplied};
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[TYPESPEC_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[TYPESPEC_EXTENSION]:value as unknown as Json}}]}]};payload(doc);return doc;
}
export function exportTypeSpecSources(document:Document){const p=payload(document);if(inspectTypeSpec(document).diagnostics.some(d=>d.code==='TYPESPEC_REPRESENTATION'))throw new UmfError('TYPESPEC_REPRESENTATION','Native export would discard unknown content');return {entrypoint:p.entrypoint,files:p.files,...(p.libraries?{libraries:p.libraries}:{})};}
export function compileTypeSpecDocument(document:Document){const p=exportTypeSpecSources(document);return checkTypeSpecSources(p.files,p.entrypoint,p.libraries);}
export function proposeTypeSpecSourceEdit(document:Document,path:string,text:string){const p=payload(document);if(!Object.hasOwn(p.files,path)||typeof text!=='string')throw new UmfError('TYPESPEC_EDIT','Edit must replace a supplied source file');p.files[path]=text;const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[TYPESPEC_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectTypeSpec(next)};}
export function getTypeSpecSyntax(document:Document,path:string){
 const p=payload(document);if(!Object.hasOwn(p.files,path))throw new UmfError('TYPESPEC_FILE','No supplied source file');
 const out:{kind:string;start:number;end:number}[]=[];
 function walk(node:Node,depth:number){if(depth>LIMITS.maxDepth||out.length>=LIMITS.maxValues)throw new UmfError('LIMIT','Syntax traversal exceeds structural limit');out.push({kind:SyntaxKind[node.kind],start:node.pos,end:node.end});visitChildren(node,child=>{walk(child,depth+1);return undefined;});}
 walk(parse(p.files[path]!,{comments:true,docs:true}),0);return out;
}
