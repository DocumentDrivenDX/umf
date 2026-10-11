import manifest from '../../../spec/extensions/odcs/package.json';
import Ajv2019 from 'ajv/dist/2019';
import {installJsonEquality} from '../../validation/schema';
import grammar0 from '../../../spec/extensions/odcs/native-3.0.0.json';
import grammar1 from '../../../spec/extensions/odcs/native-3.0.1.json';
import grammar2 from '../../../spec/extensions/odcs/native-3.0.2.json';
import grammar3 from '../../../spec/extensions/odcs/native-3.1.0.json';
import grammar4 from '../../../spec/extensions/odcs/native-3.2.0.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,parseNativeYaml,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const ODCS_EXTENSION='umf.odcs';
export const odcsPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'odcs-json-yaml';root:NativeJson;originalSource:string;originalFormat:'json'|'yaml'};
const parse=(text:string,format:'json'|'yaml')=>format==='json'?parseNativeJson(text):parseNativeYaml(text);
const grammars:Record<string,object>={'v3.0.0':grammar0,'v3.0.1':grammar1,'v3.0.2':grammar2,'v3.1.0':grammar3,'v3.2.0':grammar4};
const checks=new Map<string,ReturnType<ReturnType<typeof createValidator>['compile']>>();
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'ODCS_CONTEXT',path:'',severity:'warning',message:'Contract shape checks do not enforce data quality/SLA rules, resolve references, map physical types or prove exact-number constraints beyond JS precision; edits regenerate layout while retaining original source'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root','originalSource','originalFormat'].includes(k)))add('ODCS_REPRESENTATION','','Unknown representation fields remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('ODCS_REPRESENTATION',path,'Unknown tagged-tree fields remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');
 if(p.root.kind!=='object'){add('ODCS_STRUCTURE','','Expected ODCS contract object','error');return ds;}
 try{parse(p.originalSource,p.originalFormat);}catch(error){add('ODCS_ARCHIVE','/originalSource',String(error),'error');return ds;}
 const version=p.root.members.apiVersion;
 if(version?.kind!=='string'||!Object.hasOwn(grammars,version.value)){add('ODCS_VERSION','/apiVersion','Missing or unknown ODCS version preserved without interpretation');return ds;}
 let check=checks.get(version.value);if(!check){const ajv=new Ajv2019({allErrors:true,strict:false,validateFormats:false,ownProperties:true});installJsonEquality(ajv);check=ajv.compile(grammars[version.value]!);checks.set(version.value,check);}if(!check(JSON.parse(renderTree(p.root))))for(const e of (check.errors??[]).slice(0,100))add('ODCS_NATIVE_SCHEMA',e.instancePath,e.message??'Native contract shape mismatch');
 if((check.errors?.length??0)>100)add('ODCS_DIAGNOSTICS_TRUNCATED','','More than 100 native schema diagnostics; first 100 retained');
 return ds;
}
export function odcsRegistry(){return new Registry().register(odcsPackage,inspect);}
export function inspectOdcsDocument(document:Document){return validateDocument(document,odcsRegistry());}
function payload(document:Document):Payload{
 const checked=inspectOdcsDocument(document);if(!checked.valid)throw new UmfError('ODCS_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='contract')?.elements.find(e=>e.id==='contract')?.extensions[ODCS_EXTENSION];if(!value||document.vocabularies[ODCS_EXTENSION]?.version!=='0.1.0')throw new UmfError('ODCS_PAYLOAD','Expected pinned ODCS payload');return copyJson(value) as unknown as Payload;
}
export function importOdcsDocument(text:string,options:{id:string;format:'json'|'yaml'}):Document{
 if(!['json','yaml'].includes(options.format))throw new UmfError('ODCS_FORMAT','Explicit JSON or YAML format required');
 const value:Payload={profile:'odcs-json-yaml',root:parse(text,options.format),originalSource:text,originalFormat:options.format};
 const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[ODCS_EXTENSION]:{version:'0.1.0'}},modules:[{id:'contract',namespace:'',elements:[{id:'contract',extensions:{[ODCS_EXTENSION]:value as unknown as Json}}]}]};payload(d);return d;
}
export function exportOdcsDocument(document:Document,format?:'json'|'yaml'){
 const p=payload(document);if(format!==undefined&&!['json','yaml'].includes(format))throw new UmfError('ODCS_FORMAT','Unsupported native format');
 if(inspectOdcsDocument(document).diagnostics.some(d=>d.code==='ODCS_REPRESENTATION'))throw new UmfError('ODCS_EXPORT','Unknown representation fields cannot be discarded');
 if((format??p.originalFormat)===p.originalFormat&&renderTree(parse(p.originalSource,p.originalFormat))===renderTree(p.root))return p.originalSource;
 return renderTree(p.root)+'\n';
}
export function getOdcsDocumentNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeOdcsDocumentNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('ODCS_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='contract')!.elements.find(e=>e.id==='contract')!.extensions[ODCS_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectOdcsDocument(next)};}
