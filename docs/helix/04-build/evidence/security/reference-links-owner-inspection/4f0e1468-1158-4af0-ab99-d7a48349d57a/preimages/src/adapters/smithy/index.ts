import {inspectSmithySourcesPayload} from './source-profile';
import manifest from '../../../spec/extensions/smithy/package.json';
import nativeStructure from '../../../spec/extensions/smithy/native-structure.schema.json';
import {createValidator} from '../../validation/schema';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,cloneTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const SMITHY_EXTENSION='umf.smithy';
export const smithyPackage=manifest as unknown as ExtensionPackage;
const check=createValidator(false).compile(nativeStructure);
type Payload={profile:'smithy-json-ast';root:NativeJson;dependencies?:{id:string;root:NativeJson}[]};
const knownTypes=new Set('blob boolean document string byte short integer long float double bigInteger bigDecimal timestamp list map structure union enum intEnum service resource operation apply'.split(' '));
function inspect(value:Json):Diagnostic[]{
 if((value as any).profile==='smithy-idl-sources')return inspectSmithySourcesPayload(value);
 const p=value as unknown as Payload;const out:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>out.push({code,path,message,severity});
 for(const key of Object.keys(p))if(!['profile','root','dependencies'].includes(key))add('SMITHY_REPRESENTATION','/'+pointer(key),'Unknown representation field cannot be exported');
 function representation(n:NativeJson,path:string){
  const keys=n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'];
  for(const key of Object.keys(n))if(!keys.includes(key))add('SMITHY_REPRESENTATION',path+'/'+pointer(key),'Unknown tagged-tree field cannot be exported');
  if(n.kind==='object')for(const[k,v]of Object.entries(n.members))representation(v,path+'/members/'+pointer(k));
  if(n.kind==='array')n.items.forEach((v,i)=>representation(v,path+'/items/'+i));
 }
 const ids=new Set<string>();
 for(const [i,dep]of (p.dependencies??[]).entries()){
  if(ids.has(dep.id))add('SMITHY_DEPENDENCY_ID','/dependencies/'+i+'/id','Duplicate dependency ID','error');ids.add(dep.id);
  for(const key of Object.keys(dep))if(!['id','root'].includes(key))add('SMITHY_REPRESENTATION','/dependencies/'+i+'/'+pointer(key),'Unknown dependency representation field cannot be exported');
 }
 for(const {root,path}of [{root:p.root,path:'/root'},...(p.dependencies??[]).map((d,i)=>({root:d.root,path:'/dependencies/'+i+'/root'}))]){
  representation(root,path);
  // Numeric trait/metadata tokens are opaque here; host conversion is never persisted.
  const native=JSON.parse(renderTree(root));
  if(!check(native))add('SMITHY_STRUCTURE',path,JSON.stringify(check.errors),'error');
  if(root.kind!=='object')continue;
  const m=root.members;
  if(m.smithy?.kind==='string'&&!['2','2.0'].includes(m.smithy.value))add('SMITHY_VERSION',path+'/smithy','Uninterpreted Smithy version retained');
  for(const k of Object.keys(m))if(!['smithy','shapes','metadata'].includes(k))add('SMITHY_NATIVE_FIELD',path+'/'+pointer(k),'Unknown native content retained');
  if(m.shapes?.kind==='object')for(const[id,shape]of Object.entries(m.shapes.members))if(shape.kind==='object'){
   const type=shape.members.type;
   if(type?.kind==='string'&&!knownTypes.has(type.value))add('SMITHY_SHAPE_TYPE',path+'/shapes/'+pointer(id)+'/type','Unknown shape type retained');
  }
 }
 add('SMITHY_ASSEMBLY_REQUIRED','/root','Browser checks AST structure only. Native assembly, references, mixins, trait selectors and semantic validation require a separate Smithy model oracle');
 return out;
}
export function smithyRegistry(){return new Registry().register(smithyPackage,inspect);}
export function inspectSmithy(document:Document){return validateDocument(document,smithyRegistry());}
function payload(document:Document):Payload{
 const checked=inspectSmithy(document);if(!checked.valid)throw new UmfError('SMITHY_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[SMITHY_EXTENSION];
 if(!value||document.vocabularies[SMITHY_EXTENSION]?.version!=='0.1.0')throw new UmfError('SMITHY_PAYLOAD','Missing Smithy payload');
 if((value as any).profile!=='smithy-json-ast')throw new UmfError('SMITHY_PROFILE','This operation requires a JSON AST profile');
 return copyJson(value) as unknown as Payload;
}
export function importSmithyJson(text:string,options:{id:string;dependencies?:{id:string;schema:string}[]}):Document{
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[SMITHY_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[SMITHY_EXTENSION]:{profile:'smithy-json-ast',root:parseNativeJson(text),...(options.dependencies?{dependencies:options.dependencies.map(d=>({id:d.id,root:parseNativeJson(d.schema)}))}:{})} as unknown as Json}}]}]};payload(doc);return doc;
}
function exportable(document:Document):Payload{
 const p=payload(document);if(inspectSmithy(document).diagnostics.some(d=>d.code==='SMITHY_REPRESENTATION'))throw new UmfError('SMITHY_REPRESENTATION','Unknown representation content cannot be discarded');
 return p;
}
export function exportSmithyJson(document:Document):string{
 const p=exportable(document);if(p.dependencies?.length)throw new UmfError('SMITHY_DEPENDENCIES_REQUIRED','Use exportSmithyBundle to retain supplied dependencies');return renderTree(p.root)+'\n';
}
export function exportSmithyBundle(document:Document){
 const p=exportable(document);return {schema:renderTree(p.root)+'\n',dependencies:(p.dependencies??[]).map(d=>({id:d.id,schema:renderTree(d.root)+'\n'})),source:copyJson(document) as unknown as Document,diagnostics:inspectSmithy(document).diagnostics};
}
function selectedRoot(p:Payload,dependencyId?:string):NativeJson{
 if(dependencyId===undefined)return p.root;const dep=p.dependencies?.find(d=>d.id===dependencyId);if(!dep)throw new UmfError('SMITHY_DEPENDENCY_ID','Unknown dependency '+dependencyId);return dep.root;
}
export function getSmithyNode(document:Document,path:string,dependencyId?:string):NativeJson{let node=selectedRoot(payload(document),dependencyId);for(const key of nativePointer(path))node=treeChild(node,key);return cloneTree(node);}
/** Candidate only: native semantic validation remains required. */
export function proposeSmithyNodeEdit(document:Document,path:string,text:string,dependencyId?:string){
 const keys=nativePointer(path);const replacement=parseNativeJson(text);const p=payload(document);
 const root=selectedRoot(p,dependencyId);
 if(!keys.length){if(dependencyId===undefined)p.root=replacement;else p.dependencies!.find(d=>d.id===dependencyId)!.root=replacement;}
 else{let node=root;for(const key of keys.slice(0,-1))node=treeChild(node,key);const key=keys.at(-1)!;treeChild(node,key);if(node.kind==='object')node.members[key]=replacement;else if(node.kind==='array')node.items[Number(key)]=replacement;}
 const next=copyJson(document) as unknown as Document;
 next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[SMITHY_EXTENSION]=p as unknown as Json;
 payload(next);return {document:next,validation:inspectSmithy(next)};
}
