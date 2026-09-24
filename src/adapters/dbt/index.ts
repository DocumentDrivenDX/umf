import manifest from '../../../spec/extensions/dbt-manifest/package.json';
import grammar from '../../../spec/extensions/dbt-manifest/native-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DBT_MANIFEST_EXTENSION='umf.dbt.manifest';
export const dbtManifestPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'dbt-manifest-json';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'DBT_MANIFEST_CONTEXT',path:'',severity:'warning',message:'Native schema shapes do not establish graph/SQL/Jinja validity, format constraints or exact-number constraints beyond JS precision'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('DBT_MANIFEST_REPRESENTATION','','Unknown representation fields remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('DBT_MANIFEST_REPRESENTATION',path,'Unknown tagged-tree fields remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');
 const metadata=p.root.kind==='object'?p.root.members.metadata:undefined,version=metadata?.kind==='object'?metadata.members.dbt_schema_version:undefined;
 if(version?.kind!=='string'){add('DBT_MANIFEST_STRUCTURE','/metadata/dbt_schema_version','Expected manifest object with metadata object and schema version string','error');return ds;}
 if(version.value!=='https://schemas.getdbt.com/dbt/manifest/v12.json'){add('DBT_MANIFEST_VERSION','/metadata/dbt_schema_version','Unknown artifact version preserved without interpretation');return ds;}
 check??=createValidator(false).compile(grammar);if(!check(JSON.parse(renderTree(p.root))))for(const e of (check.errors??[]).slice(0,100))add('DBT_MANIFEST_NATIVE_SCHEMA',e.instancePath,e.message??'Native grammar mismatch');
 if((check.errors?.length??0)>100)add('DBT_MANIFEST_DIAGNOSTICS_TRUNCATED','','More than 100 native schema diagnostics; first 100 retained');
 return ds;
}
export function dbtManifestRegistry(){return new Registry().register(dbtManifestPackage,inspect);}
export function inspectDbtManifest(document:Document){return validateDocument(document,dbtManifestRegistry());}
function payload(document:Document):Payload{
 const checked=inspectDbtManifest(document);if(!checked.valid)throw new UmfError('DBT_MANIFEST_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='manifest')?.elements.find(e=>e.id==='manifest')?.extensions[DBT_MANIFEST_EXTENSION];if(!value||document.vocabularies[DBT_MANIFEST_EXTENSION]?.version!=='0.1.0')throw new UmfError('DBT_MANIFEST_PAYLOAD','Expected pinned dbt manifest payload');return copyJson(value) as unknown as Payload;
}
export function importDbtManifest(text:string,options:{id:string}):Document{const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[DBT_MANIFEST_EXTENSION]:{version:'0.1.0'}},modules:[{id:'manifest',namespace:'',elements:[{id:'manifest',extensions:{[DBT_MANIFEST_EXTENSION]:{profile:'dbt-manifest-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(d);return d;}
export function exportDbtManifest(document:Document){const p=payload(document);if(inspectDbtManifest(document).diagnostics.some(d=>d.code==='DBT_MANIFEST_REPRESENTATION'))throw new UmfError('DBT_MANIFEST_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getDbtManifestNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeDbtManifestNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('DBT_MANIFEST_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='manifest')!.elements.find(e=>e.id==='manifest')!.extensions[DBT_MANIFEST_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectDbtManifest(next)};}
