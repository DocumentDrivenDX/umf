import manifest from '../../../spec/extensions/dbt-artifact/package.json';
import runResultsGrammar from '../../../spec/extensions/dbt-artifact/run-results-v6-schema.json';
import freshnessGrammar from '../../../spec/extensions/dbt-artifact/sources-v3-schema.json';
import catalogGrammar from '../../../spec/extensions/dbt-artifact/catalog-v1-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DBT_ARTIFACT_EXTENSION='umf.dbt.artifact';
export const dbtArtifactPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'dbt-artifact-json';root:NativeJson};
const checks=new Map<string,ReturnType<ReturnType<typeof createValidator>['compile']>>();
const grammars:Record<string,object>={'https://schemas.getdbt.com/dbt/run-results/v6.json':runResultsGrammar,'https://schemas.getdbt.com/dbt/catalog/v1.json':catalogGrammar,'https://schemas.getdbt.com/dbt/sources/v3.json':freshnessGrammar};
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'DBT_ARTIFACT_CONTEXT',path:'',severity:'warning',message:'Native shapes do not establish execution outcomes, warehouse state, artifact correlation, format constraints or exact-number constraints beyond JS precision'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('DBT_ARTIFACT_REPRESENTATION','','Unknown representation fields remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('DBT_ARTIFACT_REPRESENTATION',path,'Unknown tagged-tree fields remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'');
 const metadata=p.root.kind==='object'?p.root.members.metadata:undefined,version=metadata?.kind==='object'?metadata.members.dbt_schema_version:undefined;
 if(version?.kind!=='string'){add('DBT_ARTIFACT_STRUCTURE','/metadata/dbt_schema_version','Expected artifact object with metadata object and schema version string','error');return ds;}
 if(!Object.hasOwn(grammars,version.value)){add('DBT_ARTIFACT_VERSION','/metadata/dbt_schema_version','Unknown artifact version preserved without interpretation');return ds;}
 let check=checks.get(version.value);if(!check){check=createValidator(false).compile(grammars[version.value]!);checks.set(version.value,check);}if(!check(JSON.parse(renderTree(p.root))))for(const e of (check.errors??[]).slice(0,100))add('DBT_ARTIFACT_NATIVE_SCHEMA',e.instancePath,e.message??'Native grammar mismatch');
 if((check.errors?.length??0)>100)add('DBT_ARTIFACT_DIAGNOSTICS_TRUNCATED','','More than 100 native schema diagnostics; first 100 retained');
 return ds;
}
export function dbtArtifactRegistry(){return new Registry().register(dbtArtifactPackage,inspect);}
export function inspectDbtArtifact(document:Document){return validateDocument(document,dbtArtifactRegistry());}
function payload(document:Document):Payload{
 const checked=inspectDbtArtifact(document);if(!checked.valid)throw new UmfError('DBT_ARTIFACT_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='artifact')?.elements.find(e=>e.id==='artifact')?.extensions[DBT_ARTIFACT_EXTENSION];if(!value||document.vocabularies[DBT_ARTIFACT_EXTENSION]?.version!=='0.1.0')throw new UmfError('DBT_ARTIFACT_PAYLOAD','Expected pinned dbt artifact payload');return copyJson(value) as unknown as Payload;
}
export function importDbtArtifact(text:string,options:{id:string}):Document{const d:Document={umf:'0.1.0',id:options.id,vocabularies:{[DBT_ARTIFACT_EXTENSION]:{version:'0.1.0'}},modules:[{id:'artifact',namespace:'',elements:[{id:'artifact',extensions:{[DBT_ARTIFACT_EXTENSION]:{profile:'dbt-artifact-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(d);return d;}
export function exportDbtArtifact(document:Document){const p=payload(document);if(inspectDbtArtifact(document).diagnostics.some(d=>d.code==='DBT_ARTIFACT_REPRESENTATION'))throw new UmfError('DBT_ARTIFACT_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getDbtArtifactNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeDbtArtifactNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('DBT_ARTIFACT_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='artifact')!.elements.find(e=>e.id==='artifact')!.extensions[DBT_ARTIFACT_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectDbtArtifact(next)};}
