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
import relationships from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/tablespec-relationship-classification.schema.json';
import manifest from '../../spec/extensions/tablespec-relationships/package.json';
export const TABLESPEC_RELATIONSHIPS_EXTENSION='umf.tablespec.relationships';
export const tableSpecRelationshipsPackage=manifest as unknown as ExtensionPackage;
export {default as tableSpecRelationshipClassificationSchema} from '../../spec/core/tablespec-relationship-classification.schema.json';
export interface TableSpecRelationshipRequest {mode:'strict'|'report';profile:'declared-metadata'}
export interface TableSpecRelationshipObservation {
 nativePath:string;carrier:'foreign_keys'|'outgoing'|'referenced_by'|'incoming'|'unknown';state:'declared'|'invalid'|'unknown';
 native:NativeJson;sourceColumn:string|null;targetTable:string|null;targetColumn:string|null;
 resolvedSource:{module:string;element:string}|null;enforcement:'unknown';authorIntent:'unknown';basis:string;
}
const binding=schema.properties.binding.const;
const recovery='Original native archive retained; no authored relationship inferred' as const;
export interface TableSpecRelationshipClassification {
 operation:'classify-tablespec-relationships';version:'1.0.0';status:'classified'|'blocked';outcome:'exact'|'unknown'|'not-expressible';
 source:Document;target?:Document;request:TableSpecRelationshipRequest;binding:typeof binding;observations:TableSpecRelationshipObservation[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);
for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships])validator.addSchema(s);
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
/** Observe native declarations without upgrading the envelope or creating authored relationships. */
export function classifyTableSpecRelationships(input:Document,options:TableSpecRelationshipRequest):TableSpecRelationshipClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecRelationshipRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_RELATIONSHIP_REQUEST',JSON.stringify(checkRequest.errors));
 archive(source);const table=getTableSpecTable(source);
 if(table.kind!=='object')throw new UmfError('TABLESPEC_RELATIONSHIP_SOURCE','Expected native table object');
 const result:TableSpecRelationshipClassification={operation:'classify-tablespec-relationships',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),outcome,reason,recovery});
 let conflict=false;
 if(source.extensions&&Object.hasOwn(source.extensions,TABLESPEC_RELATIONSHIPS_EXTENSION)){
  conflict=true;loss('/extensions/'+TABLESPEC_RELATIONSHIPS_EXTENSION,source.extensions[TABLESPEC_RELATIONSHIPS_EXTENSION],'Existing observations must not be overwritten; reclassify the retained original source');
 }
 const vocabulary=source.vocabularies[TABLESPEC_RELATIONSHIPS_EXTENSION];
 if(vocabulary&&vocabulary.version!=='1.0.0'){
  conflict=true;loss('/vocabularies/'+TABLESPEC_RELATIONSHIPS_EXTENSION,vocabulary,'Incompatible existing vocabulary version');
 }
 const module=source.modules.find(m=>m.id==='table')!;
 const root='/extensions/umf.tablespec/root/members/relationships';
 const relations=table.members.relationships;
 const pointer=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
 const string=(node:NativeJson|undefined):string|null=>node?.kind==='string'?node.value:null;
 const carriers=['foreign_keys','outgoing','referenced_by','incoming'] as const;
 function observe(node:NativeJson,path:string,carrier:TableSpecRelationshipObservation['carrier']) {
  const fields=node.kind==='object'?node.members:{};
  const outward=carrier==='foreign_keys'||carrier==='outgoing';
  const sourceColumn=outward?string(fields[carrier==='foreign_keys'?'column':'source_column']):null;
  const targetTable=outward?string(fields[carrier==='foreign_keys'?'references_table':'target_table']):null;
  const targetColumn=outward?string(fields[carrier==='foreign_keys'?'references_column':'target_column']):null;
  const field=sourceColumn===null?undefined:module.elements.find(e=>e.name===sourceColumn);
  const invalid=node.kind!=='object'||outward&&(!sourceColumn||!targetTable||!targetColumn);
  const basis=invalid?'Malformed native endpoint metadata is retained without interpretation':
   carrier==='unknown'?'Unrecognized relationship metadata remains uninterpreted':
   'Native metadata only; target Key identity, coherent participation, lifecycle, enforcement and authored intent are not established';
  result.observations.push({nativePath:path,carrier,state:invalid?'invalid':carrier==='unknown'?'unknown':'declared',native:node,
   sourceColumn,targetTable,targetColumn,resolvedSource:field?{module:module.id,element:field.id}:null,enforcement:'unknown',authorIntent:'unknown',basis});
  loss(path,node,basis,invalid?'not-expressible':'unknown');
  if(outward&&sourceColumn!==null&&!field)loss(path,node,'Native source column does not resolve to this table; no implicit or cross-table field is invented','not-expressible');
 }
 if(relations&&relations.kind!=='null'){
  if(relations.kind!=='object')observe(relations,root,'unknown');
  else for(const [name,node] of Object.entries(relations.members)){
   const path=root+'/members/'+pointer(name);
   if(carriers.includes(name as typeof carriers[number])){
    const carrier=name as typeof carriers[number];
    if(node.kind==='null')continue;
    if(node.kind!=='array'){observe(node,path,carrier);loss(path,node,'Native relationship carrier must be an array or null','not-expressible');}
    else node.items.forEach((item,i)=>observe(item,path+'/items/'+i,carrier));
   }else observe(node,path,'unknown');
  }
 }
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;
  target.vocabularies[TABLESPEC_RELATIONSHIPS_EXTENSION]??={version:'1.0.0'};
  target.extensions??={};target.extensions[TABLESPEC_RELATIONSHIPS_EXTENSION]=copyJson({origin:'classified',binding,profile:request.profile,observations:result.observations});
  if(!validateDocument(target).valid)throw new UmfError('TABLESPEC_RELATIONSHIP_TARGET','Invalid classification target');
  result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:'TABLESPEC_RELATIONSHIP_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('TABLESPEC_RELATIONSHIP_RESULT',JSON.stringify(check.errors));return copied as unknown as TableSpecRelationshipClassification;
}
/** Check retained input consistency, not authenticity or runtime enforcement. */
export function verifyTableSpecRelationshipClassification(input:TableSpecRelationshipClassification,current:Document):TableSpecRelationshipClassification {
 const receipt=copyJson(input) as unknown as TableSpecRelationshipClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_RELATIONSHIP_RECEIPT','Expected classified receipt');
 const expected=classifyTableSpecRelationships(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_RELATIONSHIP_RECEIPT','Receipt differs from retained source classification');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_RELATIONSHIP_STALE','Classification target changed');return receipt;
}
export function recoverTableSpecRelationshipSource(input:TableSpecRelationshipClassification,current:Document):string|Record<string,string>{return archive(verifyTableSpecRelationshipClassification(input,current).source);}
