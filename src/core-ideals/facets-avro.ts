import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {exportAvroBundle,getAvroNode} from '../adapters/avro';
import {inspectAvroFacetSelection,type AvroFacetSelection} from './avro-facet-selection';
import type {AvroTypeLocation} from './avro-cardinality-type';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import core from '../../spec/core/facet-document.schema.json';import authorSchema from '../../spec/core/facet-operation.schema.json';import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/avro-facet-classification.schema.json';
import manifest from '../../spec/extensions/avro-facets/package.json';
export const AVRO_FACETS_EXTENSION='umf.avro.facets';
export const avroFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as avroFacetClassificationSchema} from '../../spec/core/avro-facet-classification.schema.json';
export interface AvroFacetRequest {location:AvroTypeLocation;nativeSource:string;dependencies?:{id:string;schema:string}[];identity:{module:string;element:string};mode:'strict'|'report';profile:'declared-schema'|'apache-datum-writer'|'fastavro-schemaless-writer'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration;}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;location:AvroTypeLocation;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string;}
interface Branch {location:AvroTypeLocation;declarationLocation:AvroTypeLocation;nativeFragment:NativeJson;declarationFragment:NativeJson;family:'integer'|'float'|'decimal'|'string'|'binary'|'null'|'unsupported';facets:CoreFacetPatch;interpretation:'declared'|'unknown'|'unsupported';enforcement:'unverified';}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface AvroFacetClassification {
 operation:'classify-avro-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:AvroFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;location:AvroTypeLocation;nativeFragment:NativeJson;facets:CoreFacetPatch;branches:Branch[];observations:Observation[]};
 residuals:{path:string;location:AvroTypeLocation;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Add scoped facet observations to an explicit logical Field, preserving the
 * native bundle and source texts. Profiles never authenticate a writer or source. */
export function classifyAvroFacets(input:Document,options:AvroFacetRequest):AvroFacetClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroFacetRequest;
 if(!checkRequest(request))throw new UmfError('AVRO_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.5.0'||!validateDocument(source).valid)throw new UmfError('AVRO_FACET_SOURCE','Valid core 0.5.0 required; migrate explicitly');
 const exported=exportAvroBundle(source),dependencies=request.dependencies??[];
 if(exported.schema!==renderTree(parseNativeJson(request.nativeSource))+'\n'||exported.dependencies.length!==dependencies.length||exported.dependencies.some((d,i)=>d.id!==dependencies[i]!.id||d.schema!==renderTree(parseNativeJson(dependencies[i]!.schema))+'\n'))throw new UmfError('AVRO_FACET_ARCHIVE','Retained source texts differ from native bundle');
 const roots:{root:NativeJson;dependencyId?:string}[]=[...dependencies.map(d=>({root:getAvroNode(source,'',d.id),dependencyId:d.id})),{root:getAvroNode(source,'')}];
 const fragment=getAvroNode(source,request.location.path,request.location.dependencyId);
 const mi=source.modules.findIndex(m=>m.id===request.identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===request.identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('AVRO_FACET_FIELD','Explicit logical Field identity required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/facets`;
 const result:AvroFacetClassification={operation:'classify-avro-facets',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,mapping:{origin:'classified',idealPath,location:request.location,nativeFragment:fragment,facets:{},branches:[],observations:[]},residuals:[],diagnostics:[]};
 const sourcePath=(location:AvroTypeLocation)=>location.dependencyId===undefined?'/request/nativeSource':'/request/dependencies/'+dependencies.findIndex(d=>d.id===location.dependencyId)+'/schema';
 const loss=(location:AvroTypeLocation,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown',concept:Concept='native')=>{
  result.residuals.push({path:sourcePath(location),location,targetPath:idealPath,value:copyJson(value),reason,outcome,binding,recovery});
  result.mapping.observations.push({concept,idealPath,location,interpretation:outcome==='not-expressible'?'unsupported':'unknown',outcome,basis:reason});
 };
 let conflict=false;const block=(value:unknown,reason:string)=>{conflict=true;loss(request.location,value,reason);result.residuals.at(-1)!.path=idealPath;};
 if(['schema','avro.fields'].includes(request.identity.module)||element.kind!=='field'||element.cardinality!=='one'||element.references?.some(r=>r.role==='record-type'))block(element,'An explicitly scalar logical Field is required; native representation elements cannot be relabeled');
 if(Object.hasOwn(element.extensions,AVRO_FACETS_EXTENSION))block(element.extensions[AVRO_FACETS_EXTENSION],'Existing binding cannot be overwritten');
 if(source.vocabularies[AVRO_FACETS_EXTENSION]&&source.vocabularies[AVRO_FACETS_EXTENSION]!.version!=='1.0.0')block(source.vocabularies[AVRO_FACETS_EXTENSION],'Incompatible facet vocabulary');
 let selected:AvroFacetSelection|undefined;
 try{selected=inspectAvroFacetSelection(roots,request.location);}catch(error){if(!(error instanceof Error))throw error;loss(request.location,fragment,'Native type selection is unresolved: '+error.message,'not-expressible');}
 if(request.profile==='unresolved')loss(request.location,fragment,'An explicit native declaration or writer profile is required');
 if(selected){
  if(selected.shape!=='one')loss(request.location,fragment,'Select a scalar item/value type explicitly; containers or null-only types cannot carry these facets','not-expressible');
  for(const entry of selected.branches){
   const meaning=entry.inspection.meaning,isNull=entry.branch.shape==='null',facets:CoreFacetPatch={};
   if(meaning?.family==='integer')facets.integerWidth={bits:meaning.bits,signed:true};
   if(meaning?.family==='decimal'){facets.precision=meaning.precision;facets.scale=meaning.scale;}
   if(meaning?.family==='binary'&&meaning.exactBytes!==null)facets.length={max:meaning.exactBytes,unit:'byte'};
   result.mapping.branches.push({location:entry.branch.location,declarationLocation:entry.declaration.location,nativeFragment:entry.branch.native,declarationFragment:entry.declaration.native,family:isNull?'null':meaning?.family??'unsupported',facets,interpretation:isNull||meaning?'declared':'unsupported',enforcement:'unverified'});
   if(isNull)continue;
   if(!meaning){loss(entry.declaration.location,entry.declaration.native,entry.inspection.reason??'Unsupported declaration','not-expressible');continue;}
   for(const group of Object.keys(facets))if(group!=='scale')result.mapping.observations.push({concept:group==='precision'?'decimal':group as Concept,idealPath,location:entry.declaration.location,interpretation:'declared',outcome:'exact',basis:'Declared present non-null schema domain; codec enforcement and input conversion are separate'});
   if(meaning.family==='binary'&&meaning.exactBytes!==null&&meaning.exactBytes>0)loss(entry.declaration.location,entry.declaration.native,'Fixed exact length includes a lower bound that a maximum-length ideal does not represent','not-expressible','length');
   if(request.profile!=='declared-schema'&&request.profile!=='unresolved'){
    if(meaning.family==='decimal')loss(entry.declaration.location,entry.declaration.native,request.profile==='apache-datum-writer'?'Apache Decimal validation does not enforce coefficient precision and conversion may rescale or round values':'Physical bytes/fixed inputs can bypass fastavro Decimal checks; annotation alone does not establish the writer output domain','unknown','decimal');
    if(meaning.family==='integer'&&meaning.bits===32&&request.profile==='fastavro-schemaless-writer')loss(entry.declaration.location,entry.declaration.native,'The pinned fastavro writer accepts int 2147483648 outside the declared signed-32 domain','approximated','integerWidth');
   }
   if(request.obligation==='exact-input')loss(entry.declaration.location,entry.declaration.native,meaning.family==='float'&&meaning.bits===32?'Binary64 1.0000000000000002 narrows to binary32 1.0':meaning.family==='decimal'?'Decimal writer/reader conversion and physical-byte bypass do not establish arbitrary input exactness':'Declared value domains do not prove exact conversion of arbitrary host inputs',meaning.family==='float'&&meaning.bits===32||meaning.family==='decimal'?'approximated':'unknown','conversion');
  }
  const branches=result.mapping.branches.filter(b=>b.family!=='null');
  if(branches.length&&branches.every(b=>b.family!=='unsupported')){
   const family=branches[0]!.family;
   if(branches.some(b=>b.family!==family))loss(request.location,fragment,'Different scalar families remain separate union branches','not-expressible');
   else if(element.scalarType!==family)block(element,'Logical scalar family differs from selected native declaration');
   else if(request.profile!=='unresolved'&&selected.shape==='one'){
    if(family==='integer')result.mapping.facets.integerWidth={bits:Math.max(...branches.map(b=>b.facets.integerWidth!.bits)),signed:true};
    else if(branches.every(b=>canonical(copyJson(b.facets))===canonical(copyJson(branches[0]!.facets))))result.mapping.facets=copyJson(branches[0]!.facets) as CoreFacetPatch;
    else loss(request.location,fragment,'Distinct branch facet domains cannot be silently normalized to one ideal','not-expressible');
   }
  }
 }
 // Visit type syntax and field metadata only. Defaults/docs/aliases stay native;
 // custom members anywhere in the bundle remain explicit unknown obligations.
 const escape=(v:string)=>v.replaceAll('~','~0').replaceAll('/','~1');
 function unknown(node:NativeJson,location:AvroTypeLocation,field=false):void {
  if(node.kind==='array'){node.items.forEach((n,i)=>unknown(n,{...location,path:location.path+'/'+i}));return;}
  if(node.kind!=='object')return;
  const type=node.members.type?.kind==='string'?node.members.type.value:undefined;
  const decimal=node.members.logicalType?.kind==='string'&&node.members.logicalType.value==='decimal';
  const known=field?['name','type','doc','default','order','aliases']:['type','logicalType',...(type==='record'||type==='error'?['name','namespace','aliases','doc','fields']:type==='fixed'?['name','namespace','aliases','doc','size']:type==='enum'?['name','namespace','aliases','doc','symbols','default']:type==='array'?['items']:type==='map'?['values']:[]),...(decimal&&(type==='bytes'||type==='fixed')?['precision','scale']:[])];
  for(const [key,value] of Object.entries(node.members)){
   const at={...location,path:location.path+'/'+escape(key)};
   if(!known.includes(key))loss(at,value,'Unknown native schema metadata remains attached without enforcement interpretation');
   else if(key==='fields'&&value.kind==='array')value.items.forEach((n,i)=>unknown(n,{...at,path:at.path+'/'+i},true));
   else if(key==='items'||key==='values'||key==='type'&&value.kind!=='string')unknown(value,at);
  }
 }
 for(const root of roots)unknown(root.root,{path:'',...(root.dependencyId!==undefined?{dependencyId:root.dependencyId}:{})});
 if(request.author){
  try{
   const author=verifyCoreFacetDeclaration(request.author,source);
   if(author.identity.module!==request.identity.module||author.identity.element!==request.identity.element)block(author.identity,'Author receipt identifies a different Field');
   else{
    const meaning=inspectCoreFacets(source,author.identity).meaning;
    if(meaning.state==='known'||meaning.state==='partial'){
     for(const key of ['length','precision','scale','integerWidth'] as const){const declared=meaning.interpreted[key],observed=result.mapping.facets[key];
      if(declared!==undefined&&observed!==undefined&&canonical(copyJson(declared))!==canonical(copyJson(observed)))block({declared,observed},'Authored '+key+' conflicts with native declaration');
      else if(declared!==undefined&&observed===undefined){loss(request.location,declared,'Authored bound is retained but not established by this native profile');result.residuals.at(-1)!.path=idealPath+'/'+key;}
     }
     if(meaning.state==='partial'){loss(request.location,meaning.facets,'Unknown authored facet qualifiers remain attached');result.residuals.at(-1)!.path=idealPath;}
    }
   }
  }catch(error){if(!(error instanceof UmfError))throw error;block(null,'Author provenance is invalid or stale: '+error.code);}
 }else if(Object.hasOwn(element,'facets'))block(element.facets,'Existing facets require verified author provenance');
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='unknown')?'unknown':result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'approximated';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document,field=target.modules[mi]!.elements[ei]!;
  if(!request.author&&Object.keys(result.mapping.facets).length)field.facets=copyJson(result.mapping.facets);
  target.vocabularies[AVRO_FACETS_EXTENSION]??={version:'1.0.0'};
  field.extensions[AVRO_FACETS_EXTENSION]=copyJson({origin:'classified',location:request.location,binding:{id:binding.id,version:binding.version},profile:request.profile,obligation:request.obligation,outcome:result.outcome,observations:result.mapping.observations});
  if(!validateDocument(target).valid)throw new UmfError('AVRO_FACET_TARGET','Classification would violate core constraints');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:conflict?'AVRO_FACET_CONFLICT':'AVRO_FACET_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('AVRO_FACET_RESULT',JSON.stringify(check.errors));return copied as unknown as AvroFacetClassification;
}
/** Verify retained receipt consistency, not source authenticity. */
export function verifyAvroFacetClassification(input:AvroFacetClassification,current:Document):AvroFacetClassification {
 const receipt=copyJson(input) as unknown as AvroFacetClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('AVRO_FACET_RECEIPT','Complete classified receipt required');
 if(canonical(copyJson(receipt))!==canonical(copyJson(classifyAvroFacets(receipt.source,receipt.request))))throw new UmfError('AVRO_FACET_RECEIPT','Receipt disagrees with source and profile');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('AVRO_FACET_STALE','Target changed after classification');return receipt;
}
export function recoverAvroFacetSource(input:AvroFacetClassification,current:Document){const r=verifyAvroFacetClassification(input,current);return {schema:r.request.nativeSource,dependencies:copyJson(r.request.dependencies??[]) as {id:string;schema:string}[]};}
