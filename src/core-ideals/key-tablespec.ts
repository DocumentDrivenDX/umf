import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import type {NativeJson} from '../model/native-json';
import {exportTableSpec,exportTableSpecBundle,getTableSpecTable,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import nullability from '../../spec/core/nullability-document.schema.json';
import cardinality from '../../spec/core/cardinality-document.schema.json';
import facets from '../../spec/core/facet-document.schema.json';
import keys from '../../spec/core/key-document.schema.json';
import schema from '../../spec/core/tablespec-key-classification.schema.json';
import manifest from '../../spec/extensions/tablespec-keys/package.json';
export const TABLESPEC_KEYS_EXTENSION='umf.tablespec.keys';
export const tableSpecKeysPackage=manifest as unknown as ExtensionPackage;
export {default as tableSpecKeyClassificationSchema} from '../../spec/core/tablespec-key-classification.schema.json';
export interface TableSpecKeyRequest {mode:'strict'|'report';profile:'declared-metadata'}
export interface TableSpecKeyObservation {
 nativePath:string;kind:'primary'|'alternate';state:'absent'|'empty'|'declared'|'invalid';interpretation:'declared'|'unknown'|'unsupported';
 columns:string[];resolvedFields:{module:string;element:string}[];enforcement:'unknown';authorIntent:'unknown';basis:string;
}
const binding=schema.properties.binding.const;
const recovery='Original native archive retained; no authored key inferred' as const;
export interface TableSpecKeyClassification {
 operation:'classify-tablespec-keys';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';
 source:Document;target?:Document;request:TableSpecKeyRequest;binding:typeof binding;observations:TableSpecKeyObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);
for(const s of [legacy,fields,nullability,cardinality,facets,keys])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
function canonical(value:Json):string {
 if(Array.isArray(value))return 'a['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return 'o{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}';
 return JSON.stringify(value);
}
function archive(source:Document):string|Record<string,string>{
 const p=source.extensions?.[TABLESPEC_EXTENSION];
 return p&&typeof p==='object'&&!Array.isArray(p)&&Object.hasOwn(p,'splitFiles')?exportTableSpecBundle(source):exportTableSpec(source);
}
/** Observe native declarations without upgrading the envelope or creating author keys. */
export function classifyTableSpecKeys(input:Document,options:TableSpecKeyRequest):TableSpecKeyClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecKeyRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_KEY_REQUEST',JSON.stringify(checkRequest.errors));
 archive(source);const table=getTableSpecTable(source);
 if(table.kind!=='object')throw new UmfError('TABLESPEC_KEY_SOURCE','Expected native table object');
 const result:TableSpecKeyClassification={operation:'classify-tablespec-keys',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),outcome,reason,recovery});
 let conflict=false;
 if(source.extensions&&Object.hasOwn(source.extensions,TABLESPEC_KEYS_EXTENSION)){
  conflict=true;loss('/extensions/'+TABLESPEC_KEYS_EXTENSION,source.extensions[TABLESPEC_KEYS_EXTENSION],'Existing observations must not be overwritten; reclassify the retained original source');
 }
 const vocabulary=source.vocabularies[TABLESPEC_KEYS_EXTENSION];
 if(vocabulary&&vocabulary.version!=='1.0.0'){
  conflict=true;loss('/vocabularies/'+TABLESPEC_KEYS_EXTENSION,vocabulary,'Incompatible existing vocabulary version');
 }
 const module=source.modules.find(m=>m.id==='table')!;
 const root='/extensions/umf.tablespec/root/members/';
 function tuple(node:NativeJson|undefined,path:string,kind:'primary'|'alternate') {
  const observation:TableSpecKeyObservation={nativePath:path,kind,state:'absent',interpretation:'unknown',columns:[],resolvedFields:[],enforcement:'unknown',authorIntent:'unknown',basis:'No native tuple declaration; effective merge defaults are not authored identity'};
  if(kind==='alternate'||node&&node.kind!=='null'){
   if(!node||node.kind!=='array'||node.items.some(n=>n.kind!=='string')){
    observation.state='invalid';observation.interpretation='unsupported';observation.basis='Native tuple is not an array of column names';
    loss(path,node??null,observation.basis,'not-expressible');
   }else{
    observation.columns=node.items.map(n=>(n as Extract<NativeJson,{kind:'string'}>).value);
    observation.state=observation.columns.length?'declared':'empty';observation.interpretation='declared';
    observation.basis=observation.columns.length?'Native tuple declaration only; comparator, requiredness, enforcement and author intent are not established':'Empty native tuple is retained; no ideal key or implicit merge default is inferred';
    for(const name of observation.columns){
     const field=module.elements.find(e=>e.name===name);
     if(field)observation.resolvedFields.push({module:module.id,element:field.id});
     else loss(path,node,'Unresolved native column '+JSON.stringify(name)+'; implicit meta_* columns remain native','not-expressible');
    }
    if(new Set(observation.columns).size!==observation.columns.length)loss(path,node,'Repeated native tuple components cannot define an ideal key','not-expressible');
    if(observation.columns.length)loss(path,node,'Native declaration cannot establish authored stable identity or exact scoped enforcement');
    else loss(path,node,'An empty tuple is not a nonempty ideal key','not-expressible');
   }
  }
  result.observations.push(observation);
 }
 tuple(table.members.primary_key,root+'primary_key','primary');
 const alternates=table.members.unique_constraints;
 if(alternates&&alternates.kind!=='null'){
  if(alternates.kind==='array')alternates.items.forEach((n,i)=>tuple(n,root+'unique_constraints/items/'+i,'alternate'));
  else tuple(alternates,root+'unique_constraints','alternate');
 }
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;
  target.vocabularies[TABLESPEC_KEYS_EXTENSION]??={version:'1.0.0'};
  target.extensions??={};target.extensions[TABLESPEC_KEYS_EXTENSION]=copyJson({origin:'classified',binding,profile:request.profile,observations:result.observations});
  if(!validateDocument(target).valid)throw new UmfError('TABLESPEC_KEY_TARGET','Invalid classification target');
  result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:'TABLESPEC_KEY_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('TABLESPEC_KEY_RESULT',JSON.stringify(check.errors));return copied as unknown as TableSpecKeyClassification;
}
/** Check retained input consistency, not authenticity or runtime enforcement. */
export function verifyTableSpecKeyClassification(input:TableSpecKeyClassification,current:Document):TableSpecKeyClassification {
 const receipt=copyJson(input) as unknown as TableSpecKeyClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_KEY_RECEIPT','Expected classified receipt');
 const expected=classifyTableSpecKeys(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_KEY_RECEIPT','Receipt differs from retained source classification');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_KEY_STALE','Classification target changed');return receipt;
}
export function recoverTableSpecKeySource(input:TableSpecKeyClassification,current:Document):string|Record<string,string>{return archive(verifyTableSpecKeyClassification(input,current).source);}
