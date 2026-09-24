import manifest from '../../../spec/extensions/iceberg/package.json';
import grammar from '../../../spec/extensions/iceberg/datatype-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const ICEBERG_EXTENSION='umf.iceberg';
export const icebergPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'iceberg-schema-json';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'ICEBERG_CONTEXT_UNVERIFIED',path:'',severity:'warning',message:'Standalone schema does not establish table format-version, evolution legality, default execution or data-reader support'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('ICEBERG_REPRESENTATION','','Unknown representation fields must remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('ICEBERG_REPRESENTATION',path,'Unknown tagged-tree fields must remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'/root');const view=JSON.parse(renderTree(p.root));check??=createValidator().compile(grammar);if(!check(view)){for(const e of check.errors??[])add('ICEBERG_STRUCTURE',e.instancePath,e.message??'Invalid shape','error');return ds;}
 const atomic=new Set(['unknown','boolean','int','long','float','double','date','time','timestamp','timestamptz','timestamp_ns','timestamptz_ns','string','uuid','binary','variant']);
 const ids=new Map<number,{type:any;eligible:boolean;path:string}>();
 const register=(id:number,type:any,eligible:boolean,path:string)=>{if(ids.has(id))add('ICEBERG_DUPLICATE_ID',path,'Field IDs must be unique across fields and list/map components','error');else ids.set(id,{type,eligible,path});if(id<=0)add('ICEBERG_ID_CONTEXT',path,'Nonpositive ID retained; allocation legality requires table context');if(id>2147483447)add('ICEBERG_RESERVED_ID',path,'Reserved metadata-column range requires table context');};
 const unknown=(v:any,keys:string[],path:string)=>{for(const k of Object.keys(v))if(!keys.includes(k))add('ICEBERG_UNKNOWN',path+'/'+pointer(k),'Unknown native property preserved without interpretation');};
 function visit(v:any,path:string,requiredChain:boolean,insideCollection:boolean,root=false){
  if(typeof v==='string'){if(atomic.has(v))return;const d=/^decimal\((\d+),\s*(\d+)\)$/.exec(v),f=/^fixed\[(\d+)\]$/.exec(v);if(d){if(+d[1]!<1||+d[1]!>38||+d[2]!>+d[1]!)add('ICEBERG_TYPE_PARAMETERS',path,'Decimal requires 1..38 precision and 0..precision scale','error');return;}if(f){if(BigInt(f[1]!)<1n||BigInt(f[1]!)>2147483647n)add('ICEBERG_TYPE_PARAMETERS',path,'Fixed length must be a positive int32','error');return;}add('ICEBERG_UNKNOWN_TYPE',path,'Uninterpreted native type spelling; geospatial and future type parameters require separate checks');return;}
  if(v.type==='struct'){unknown(v,root?['type','fields','schema-id','identifier-field-ids']:['type','fields'],path);const names=new Set<string>();for(const [i,f] of v.fields.entries()){const at=path+'/fields/'+i;if(names.has(f.name))add('ICEBERG_DUPLICATE_NAME',at,'Sibling names must be unique','error');names.add(f.name);register(f.id,f.type,requiredChain&&f.required&&!insideCollection,at+'/id');unknown(f,['id','name','type','required','doc','initial-default','write-default'],at);for(const k of ['initial-default','write-default'])if(Object.hasOwn(f,k))add('ICEBERG_DEFAULT_UNVERIFIED',at+'/'+k,'Default retained exactly; type encoding and historical execution require separate checks');visit(f.type,at+'/type',requiredChain&&f.required,insideCollection);}}
  else if(v.type==='list'){unknown(v,['type','element-id','element-required','element'],path);register(v['element-id'],v.element,false,path+'/element-id');visit(v.element,path+'/element',false,true);}
  else if(v.type==='map'){unknown(v,['type','key-id','key','value-id','value-required','value'],path);register(v['key-id'],v.key,false,path+'/key-id');register(v['value-id'],v.value,false,path+'/value-id');visit(v.key,path+'/key',false,true);visit(v.value,path+'/value',false,true);}
  else add('ICEBERG_UNKNOWN_TYPE',path,'Unknown object-form type preserved without interpretation');
 }
 visit(view,'',true,false,true);for(const [i,id] of (view['identifier-field-ids']??[]).entries()){const f=ids.get(id);if(!f||!f.eligible||typeof f.type!=='string'||['float','double'].includes(f.type))add('ICEBERG_IDENTIFIER','/identifier-field-ids/'+i,'Identifier requires a required primitive field under required structs, outside collections','error');else if(!atomic.has(f.type)&&!/^decimal\(|^fixed\[/.test(f.type))add('ICEBERG_IDENTIFIER_UNVERIFIED','/identifier-field-ids/'+i,'Unknown primitive meaning cannot establish identifier eligibility');}
 if(view['schema-id']===undefined)add('ICEBERG_SCHEMA_ID_CONTEXT','','Missing schema-id is retained; table format version determines whether it is required');return ds;
}
export function icebergRegistry(){return new Registry().register(icebergPackage,inspect);}
export function inspectIceberg(document:Document){return validateDocument(document,icebergRegistry());}
function payload(document:Document):Payload{
 const checked=inspectIceberg(document);if(!checked.valid)throw new UmfError('ICEBERG_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[ICEBERG_EXTENSION];if(!value||document.vocabularies[ICEBERG_EXTENSION]?.version!=='0.1.0')throw new UmfError('ICEBERG_PAYLOAD','Expected pinned Iceberg schema payload');return copyJson(value) as unknown as Payload;
}
export function importIcebergSchema(text:string,options:{id:string}):Document{const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[ICEBERG_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[ICEBERG_EXTENSION]:{profile:'iceberg-schema-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;}
export function exportIcebergSchema(document:Document){const p=payload(document);if(inspectIceberg(document).diagnostics.some(d=>d.code==='ICEBERG_REPRESENTATION'))throw new UmfError('ICEBERG_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getIcebergNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeIcebergNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('ICEBERG_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[ICEBERG_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectIceberg(next)};}
