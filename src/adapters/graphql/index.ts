import {parse,print,buildASTSchema,validateSchema,type DocumentNode} from 'graphql';
import manifest from '../../../spec/extensions/graphql/package.json';
import {createValidator} from '../../validation/schema';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson,LIMITS} from '../../model/json';
import {editExtension} from '../../model/document';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const GRAPHQL_EXTENSION='umf.graphql';
export const graphqlPackage=manifest as unknown as ExtensionPackage;
export interface GraphqlPayload {profile:'graphql-js-17.0.2-sdl';mode?:'schema'|'fragment';ast:DocumentNode;originalSource:string;}
const structure=createValidator().compile(manifest.schema);
const fields=new Map<string,string[]>();
for(const def of Object.values(manifest.schema.$defs) as any[])if(def.properties?.kind?.const)fields.set(def.properties.kind.const,Object.keys(def.properties));
function ast(text:string):DocumentNode {
 if(typeof text!=='string'||text.length>LIMITS.maxTextLength)throw new UmfError('GRAPHQL_LIMIT','Source exceeds text limit');
 const parsed=parse(text,{noLocation:true,maxTokens:LIMITS.maxValues});
 // GraphQL.js AST optional properties use undefined, which is not a JSON value.
 return copyJson(JSON.parse(JSON.stringify(parsed, (key,value)=>key==='tokenCount'?undefined:value))) as unknown as DocumentNode;
}
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as GraphqlPayload;const out:Diagnostic[]=[];
 const warn=(code:string,path:string,message:string)=>out.push({code,path,message,severity:'warning'});
 for(const key of Object.keys(p))if(!['profile','mode','ast','originalSource'].includes(key))warn('GRAPHQL_REPRESENTATION','/'+pointer(key),'Unknown payload field has no SDL destination');
 function walk(node:any,path:string){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach((v,i)=>walk(v,path+'/'+i));return;}
  const allowed=fields.get(node.kind);
  for(const key of Object.keys(node))if(!allowed?.includes(key))warn('GRAPHQL_REPRESENTATION',path+'/'+pointer(key),'Unknown AST field has no SDL destination');
  if(node.kind==='ScalarTypeDefinition')warn('GRAPHQL_SCALAR',path,'Custom scalar coercion/serialization is external to SDL');
  if(node.kind==='Directive'&&!['deprecated','specifiedBy','oneOf'].includes(node.name?.value))warn('GRAPHQL_DIRECTIVE',path,'Custom directive behavior is retained but not implemented by this adapter');
  if(node.kind==='DirectiveExtension'||node.kind==='DirectiveDefinition'&&node.directives?.length)warn('GRAPHQL_PROFILE_EXTENSION',path,'GraphQL.js grammar addition beyond the September 2025 SDL profile');
  for(const [key,item]of Object.entries(node))if(key!=='kind')walk(item,path+'/'+pointer(key));
 }
 walk(p.ast,'/ast');
 try{
  // Printer/parser agreement detects malformed edited names, literals and AST combinations.
  const native=print(p.ast);const reparsed=ast(native);
  if(JSON.stringify(reparsed)!==JSON.stringify(p.ast)){
   // Property insertion order is immaterial; compare canonical JSON below.
   if(canonical(reparsed)!==canonical(p.ast))warn('GRAPHQL_PRINT_CHANGE','/ast','Printing changes AST content; conservative export is blocked');
  }
  if(p.mode==='fragment')warn('GRAPHQL_FRAGMENT','/ast','Syntax-only SDL fragment: references, roots and composed-schema semantics require an explicit schema context');
  const errors=p.mode==='fragment'?[]:validateSchema(buildASTSchema(p.ast));
  for(const error of errors)out.push({code:'GRAPHQL_SCHEMA',path:'/ast',severity:'error',message:error.message});
 }catch(error){out.push({code:'GRAPHQL_SCHEMA',path:'/ast',severity:'error',message:String(error)});}
 try{ast(p.originalSource);}catch(error){out.push({code:'GRAPHQL_SOURCE_ARCHIVE',path:'/originalSource',severity:'error',message:String(error)});}
 return out;
}
function canonical(value:any):string{return JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);}
export function graphqlRegistry(){return new Registry().register(graphqlPackage,inspect);}
export function inspectGraphql(document:Document){return validateDocument(document,graphqlRegistry());}
function payload(document:Document):GraphqlPayload {
 const result=inspectGraphql(document);if(!result.valid)throw new UmfError('GRAPHQL_DOCUMENT',JSON.stringify(result.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[GRAPHQL_EXTENSION];
 if(document.vocabularies[GRAPHQL_EXTENSION]?.version!=='0.1.0'||!structure(value))throw new UmfError('GRAPHQL_PAYLOAD','Missing or invalid GraphQL payload');
 return copyJson(value) as unknown as GraphqlPayload;
}
export function importGraphqlSchema(text:string,options:{id:string;mode?:'schema'|'fragment'}):Document {
 const value:GraphqlPayload={profile:'graphql-js-17.0.2-sdl',ast:ast(text),originalSource:text,...(options.mode?{mode:options.mode}:{})};
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[GRAPHQL_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[GRAPHQL_EXTENSION]:value as unknown as Json}}]}]};payload(doc);return doc;
}
export function exportGraphqlSchema(document:Document):string {
 const p=payload(document);if(inspectGraphql(document).diagnostics.some(d=>['GRAPHQL_REPRESENTATION','GRAPHQL_PRINT_CHANGE'].includes(d.code)))throw new UmfError('GRAPHQL_REPRESENTATION','Native export would discard AST content');
 return canonical(ast(p.originalSource))===canonical(p.ast)?p.originalSource:print(p.ast)+'\n';
}
export function getGraphqlAst(document:Document):DocumentNode{return payload(document).ast;}
export function editGraphqlAst(document:Document,edit:(ast:DocumentNode)=>DocumentNode):Document {
 return editExtension(document,graphqlRegistry(),'schema','schema',GRAPHQL_EXTENSION,value=>{
  const p=value as unknown as GraphqlPayload;p.ast=copyJson(edit(p.ast)) as unknown as DocumentNode;return p as unknown as Json;
 });
}
export function exportGraphqlBundle(document:Document){
 const p=payload(document);const changed=canonical(ast(p.originalSource))!==canonical(p.ast);
 return {schema:exportGraphqlSchema(document),source:copyJson(document) as unknown as Document,diagnostics:[...inspectGraphql(document).diagnostics,...(changed?[{code:'GRAPHQL_SOURCE_LAYOUT',path:'',severity:'warning' as const,message:'Edited SDL is printed; comments and original formatting remain only in retained originalSource'}]:[]),{code:'SOURCE_ARTIFACT_REQUIRED',path:'',severity:'warning' as const,message:'Native SDL cannot preserve unrelated UMF metadata; retain source bundle'}]};
}
