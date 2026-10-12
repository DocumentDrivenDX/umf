import manifest from '../../../spec/extensions/delta/package.json';
import grammar from '../../../spec/extensions/delta/datatype-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DELTA_EXTENSION='umf.delta';
export const deltaPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'delta-schema-json';root:NativeJson};
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
const atomic=new Set(['string','long','integer','short','byte','float','double','boolean','binary','date','timestamp','timestamp_ntz','void','variant']);
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload,ds:Diagnostic[]=[{code:'DELTA_CONTEXT_UNVERIFIED',path:'',severity:'warning',message:'Schema alone cannot establish Delta protocol/features, table configuration or read/write validity'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('DELTA_REPRESENTATION','','Unknown representation fields must remain in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('DELTA_REPRESENTATION',path,'Unknown tagged-tree fields must remain in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'/root');const view=JSON.parse(renderTree(p.root));check??=createValidator().compile(grammar);
 if(!check(view)){for(const e of check.errors??[])add('DELTA_STRUCTURE',e.instancePath,e.message??'Invalid Delta schema shape','error');return ds;}
 const unknown=(v:any,keys:string[],path:string)=>{for(const k of Object.keys(v))if(!keys.includes(k))add('DELTA_UNKNOWN',path+'/'+pointer(k),'Unknown native property preserved; native normalization may discard it');};
 function type(v:any,path:string){
  if(typeof v==='string'){
   const decimal=/^decimal\((\d+),\s*(-?\d+)\)$/.exec(v);
   if(decimal){const p=Number(decimal[1]),s=Number(decimal[2]);if(p<1||p>38||s<0||s>p)add('DELTA_DECIMAL_RANGE',path,'Decimal parameters require native and protocol validation');}
   else if(!atomic.has(v))add('DELTA_UNKNOWN_TYPE',path,'Type spelling is outside the declared protocol vocabulary; native parser acceptance is insufficient');
   if(['timestamp_ntz','variant'].includes(v))add('DELTA_FEATURE_REQUIRED',path,'Type requires matching table protocol/features; schema-only import cannot verify them');
   if(v==='void')add('DELTA_VOID_WRITE_CONTEXT',path,'Void storage omission and write restrictions require the surrounding table schema');return;
  }
  if(v.type==='struct'){unknown(v,['type','fields'],path);const names=new Set<string>();v.fields.forEach((f:any,i:number)=>{const at=path+'/fields/'+i;unknown(f,['name','type','nullable','metadata'],at);const name=f.name.toLowerCase();if(names.has(name))add('DELTA_DUPLICATE_NAME',at+'/name','Case-insensitive duplicate name; preserved source is not a valid Delta table schema');names.add(name);type(f.type,at+'/type');for(const k of Object.keys(f.metadata))add('DELTA_METADATA_UNVERIFIED',at+'/metadata/'+pointer(k),'Column metadata retained exactly; constraints, identity, mapping and defaults are not executed or validated against table context');});}
  else if(v.type==='array'){unknown(v,['type','elementType','containsNull'],path);type(v.elementType,path+'/elementType');}
  else if(v.type==='map'){unknown(v,['type','keyType','valueType','valueContainsNull'],path);type(v.keyType,path+'/keyType');type(v.valueType,path+'/valueType');if(v.valueContainsNull===undefined)add('DELTA_DEFAULT_NULLABILITY',path,'Native parser may insert valueContainsNull=true; source absence is retained');}
  else add('DELTA_UNKNOWN_TYPE',path,'Unknown object-form type retained without interpreting or executing it');
 }
 type(view,'');return ds;
}
export function deltaRegistry(){return new Registry().register(deltaPackage,inspect);}
export function inspectDelta(document:Document){return validateDocument(document,deltaRegistry());}
function payload(document:Document):Payload{
 const checked=inspectDelta(document);if(!checked.valid)throw new UmfError('DELTA_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[DELTA_EXTENSION];if(!value||document.vocabularies[DELTA_EXTENSION]?.version!=='0.1.0')throw new UmfError('DELTA_PAYLOAD','Expected pinned Delta schema payload');return copyJson(value) as unknown as Payload;
}
export function importDeltaSchema(text:string,options:{id:string}):Document{const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[DELTA_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[DELTA_EXTENSION]:{profile:'delta-schema-json',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;}
export function exportDeltaSchema(document:Document){const p=payload(document);if(inspectDelta(document).diagnostics.some(d=>d.code==='DELTA_REPRESENTATION'))throw new UmfError('DELTA_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getDeltaNode(document:Document,path:string){let n=payload(document).root;for(const key of nativePointer(path))n=treeChild(n,key);return copyJson(n) as unknown as NativeJson;}
export function proposeDeltaNodeEdit(document:Document,path:string,text:string){const p=payload(document),parts=nativePointer(path),replacement=parseNativeJson(text);if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('DELTA_EDIT','Expected existing node');}const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[DELTA_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectDelta(next)};}
