import manifest from '../../../spec/extensions/linkml/package.json';
import Ajv2019 from 'ajv/dist/2019';
import {installJsonEquality} from '../../validation/schema';
import grammar from '../../../spec/extensions/linkml/native-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,parseNativeYaml,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const LINKML_EXTENSION='umf.linkml';
export const linkmlPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'linkml-json-yaml';metamodelVersion:string;root:NativeJson;originalSource:string;originalFormat:'json'|'yaml'};
const parse=(text:string,format:'json'|'yaml')=>format==='json'?parseNativeJson(text):parseNativeYaml(text,{version:'1.1',dateOnly:'string',booleanLexicon:'pyyaml'});
const checks=new Map<string,ReturnType<ReturnType<typeof createValidator>['compile']>>();
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'LINKML_CONTEXT',path:'',severity:'warning',message:'YAML 1.1 date-only scalars become lexical strings in the JSON tree; their original spelling remains archived. Metamodel shape checks do not resolve imports, induce classes/slots, normalize defaults, validate instances or run generators; JS numeric precision limits apply and edits regenerate layout with original source retained'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','metamodelVersion','root','originalSource','originalFormat'].includes(k)))add('LINKML_REPRESENTATION','','Unknown representation fields remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('LINKML_REPRESENTATION',path,'Unknown tagged-tree fields remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');
 if(p.root.kind!=='object'){add('LINKML_STRUCTURE','','Expected LINKML contract object','error');return ds;}
 try{parse(p.originalSource,p.originalFormat);}catch(error){add('LINKML_ARCHIVE','/originalSource',String(error),'error');return ds;}
 const declared=p.root.members.metamodel_version;
 if(p.metamodelVersion!=='1.11.0'||declared&&!(declared.kind==='string'&&declared.value===p.metamodelVersion)){add('LINKML_VERSION','/metamodel_version','Unrecognized or conflicting metamodel version preserved without interpretation');return ds;}
 let check=checks.get('1.11.0');if(!check){const ajv=new Ajv2019({allErrors:true,strict:false,validateFormats:false,ownProperties:true});installJsonEquality(ajv);check=ajv.compile(grammar);checks.set('1.11.0',check);}if(!check(JSON.parse(renderTree(p.root))))for(const e of (check.errors??[]).slice(0,100))add('LINKML_NATIVE_SCHEMA',e.instancePath,e.message??'Native metamodel shape mismatch');
 if((check.errors?.length??0)>100)add('LINKML_DIAGNOSTICS_TRUNCATED','','More than 100 native schema diagnostics; first 100 retained');
 return ds;
}
export function linkmlRegistry(){return new Registry().register(linkmlPackage,inspect);}
export function inspectLinkmlDocument(document:Document){return validateDocument(document,linkmlRegistry());}
function payload(document:Document):Payload{
 const checked=inspectLinkmlDocument(document);if(!checked.valid)throw new UmfError('LINKML_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[LINKML_EXTENSION];if(!value||document.vocabularies[LINKML_EXTENSION]?.version!=='0.1.0')throw new UmfError('LINKML_PAYLOAD','Expected pinned LINKML payload');return copyJson(value) as unknown as Payload;
}
export function importLinkmlDocument(text:string,options:{id:string;format:'json'|'yaml';metamodelVersion?:string}):Document{
 if(!['json','yaml'].includes(options.format))throw new UmfError('LINKML_FORMAT','Explicit JSON or YAML format required');
 const value:Payload={profile:'linkml-json-yaml',metamodelVersion:options.metamodelVersion===undefined?'1.11.0':options.metamodelVersion,root:parse(text,options.format),originalSource:text,originalFormat:options.format};
 const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[LINKML_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[LINKML_EXTENSION]:value as unknown as Json}}]}]};payload(d);return d;
}
export function exportLinkmlDocument(document:Document,format?:'json'|'yaml'){
 const p=payload(document);if(format!==undefined&&!['json','yaml'].includes(format))throw new UmfError('LINKML_FORMAT','Unsupported native format');
 if(inspectLinkmlDocument(document).diagnostics.some(d=>d.code==='LINKML_REPRESENTATION'))throw new UmfError('LINKML_EXPORT','Unknown representation fields cannot be discarded');
 if((format??p.originalFormat)===p.originalFormat&&renderTree(parse(p.originalSource,p.originalFormat))===renderTree(p.root))return p.originalSource;
 return renderTree(p.root)+'\n';
}
export function getLinkmlDocumentNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeLinkmlDocumentNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('LINKML_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[LINKML_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectLinkmlDocument(next)};}
