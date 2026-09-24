import manifest from '../../../spec/extensions/dbt-semantic/package.json';
import grammar from '../../../spec/extensions/dbt-semantic/native-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DBT_SEMANTIC_MANIFEST_EXTENSION='umf.dbt.semantic';
export const dbtSemanticManifestPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'dbt-semantic-json';root:NativeJson};
const checks=new Map<string,ReturnType<ReturnType<typeof createValidator>['compile']>>();
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'DBT_SEMANTIC_MANIFEST_CONTEXT',path:'',severity:'warning',message:'Derived nullable shapes do not establish semantic rule validity, metric execution, joins, SQL semantics, parser coercion/defaults or exact-number constraints beyond JS precision'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('DBT_SEMANTIC_MANIFEST_REPRESENTATION','','Unknown representation fields remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('DBT_SEMANTIC_MANIFEST_REPRESENTATION',path,'Unknown tagged-tree fields remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');
 if(p.root.kind!=='object'){add('DBT_SEMANTIC_MANIFEST_STRUCTURE','','Expected semantic manifest object','error');return ds;}
 const config=p.root.members.project_configuration,version=config?.kind==='object'?config.members.dsi_package_version:undefined;
 const known=version?.kind==='object'&&(['major_version','minor_version','patch_version'] as const).every((k,i)=>{const n=version.members[k];return n?.kind==='string'&&n.value===['0','8','5'][i];});
 if(!known){add('DBT_SEMANTIC_MANIFEST_VERSION','/project_configuration/dsi_package_version','Missing or unknown DSI version preserved without interpretation');return ds;}
 let check=checks.get('0.8.5');if(!check){check=createValidator(false).compile(grammar);checks.set('0.8.5',check);}if(!check(JSON.parse(renderTree(p.root))))for(const e of (check.errors??[]).slice(0,100))add('DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA',e.instancePath,e.message??'Derived serialized shape mismatch');
 if((check.errors?.length??0)>100)add('DBT_SEMANTIC_MANIFEST_DIAGNOSTICS_TRUNCATED','','More than 100 native schema diagnostics; first 100 retained');
 return ds;
}
export function dbtSemanticManifestRegistry(){return new Registry().register(dbtSemanticManifestPackage,inspect);}
export function inspectDbtSemanticManifest(document:Document){return validateDocument(document,dbtSemanticManifestRegistry());}
function payload(document:Document):Payload{
 const checked=inspectDbtSemanticManifest(document);if(!checked.valid)throw new UmfError('DBT_SEMANTIC_MANIFEST_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='semantic')?.elements.find(e=>e.id==='semantic')?.extensions[DBT_SEMANTIC_MANIFEST_EXTENSION];if(!value||document.vocabularies[DBT_SEMANTIC_MANIFEST_EXTENSION]?.version!=='0.1.0')throw new UmfError('DBT_SEMANTIC_MANIFEST_PAYLOAD','Expected pinned dbt semantic payload');return copyJson(value) as unknown as Payload;
}
export function importDbtSemanticManifest(text:string,options:{id:string}):Document{const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[DBT_SEMANTIC_MANIFEST_EXTENSION]:{version:'0.1.0'}},modules:[{id:'semantic',namespace:'',elements:[{id:'semantic',extensions:{[DBT_SEMANTIC_MANIFEST_EXTENSION]:{profile:'dbt-semantic-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(d);return d;}
export function exportDbtSemanticManifest(document:Document){const p=payload(document);if(inspectDbtSemanticManifest(document).diagnostics.some(d=>d.code==='DBT_SEMANTIC_MANIFEST_REPRESENTATION'))throw new UmfError('DBT_SEMANTIC_MANIFEST_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getDbtSemanticManifestNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeDbtSemanticManifestNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('DBT_SEMANTIC_MANIFEST_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='semantic')!.elements.find(e=>e.id==='semantic')!.extensions[DBT_SEMANTIC_MANIFEST_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectDbtSemanticManifest(next)};}
