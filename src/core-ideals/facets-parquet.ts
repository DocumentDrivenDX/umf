import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {exportParquetCapture} from '../adapters/parquet';
import {inspectParquetMetadata} from '../adapters/parquet/metadata';
import {inspectParquetFacetType} from '../adapters/parquet/facet-type';
import {inspectParquetCardinalityShape} from './parquet-cardinality-shape';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import core from '../../spec/core/facet-document.schema.json';import authorSchema from '../../spec/core/facet-operation.schema.json';
import schema from '../../spec/core/parquet-facet-classification.schema.json';
import manifest from '../../spec/extensions/parquet-facets/package.json';
export const PARQUET_FACETS_EXTENSION='umf.parquet.facets';
export const parquetFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as parquetFacetClassificationSchema} from '../../spec/core/parquet-facet-classification.schema.json';
export interface ParquetFacetRequest {location:{index:number;scope:'present-non-null-leaf'};identity:{module:string;element:string};mode:'strict'|'report';profile:'declared-schema'|'pyarrow-safe-array-input'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration;}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;location:ParquetFacetRequest['location'];interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string;}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface ParquetFacetClassification {
 operation:'classify-parquet-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:ParquetFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;location:ParquetFacetRequest['location'];nativeFragment:Json;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;location:ParquetFacetRequest['location'];targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,core,authorSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Classify the declaration of one present non-null leaf value. Does not infer
 * row availability, container cardinality, authored provenance or file validity. */
export function classifyParquetFacets(input:Document,options:ParquetFacetRequest):ParquetFacetClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetFacetRequest;
 if(!checkRequest(request))throw new UmfError('PARQUET_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.5.0'||!validateDocument(source).valid)throw new UmfError('PARQUET_FACET_SOURCE','Valid core 0.5.0 required; migrate explicitly');
 exportParquetCapture(source);
 const shape=inspectParquetCardinalityShape(source,request.location.index),node=shape.nodes[0]!;
 const fragment=node.nativeFragment,mi=source.modules.findIndex(m=>m.id===request.identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===request.identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('PARQUET_FACET_FIELD','Explicit logical Field identity required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/facets`;
 const result:ParquetFacetClassification={operation:'classify-parquet-facets',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,mapping:{origin:'classified',idealPath,location:request.location,nativeFragment:fragment,facets:{},observations:[]},residuals:[],diagnostics:[]};
 const loss=(value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown',concept:Concept='native',path='/schema/'+request.location.index)=>{
  result.residuals.push({path,location:request.location,targetPath:idealPath,value:copyJson(value),reason,outcome,binding,recovery});
  result.mapping.observations.push({concept,idealPath,location:request.location,interpretation:outcome==='not-expressible'?'unsupported':'unknown',outcome,basis:reason});
 };
 let conflict=false;const block=(value:unknown,reason:string)=>{conflict=true;loss(value,reason,'unknown','native',idealPath);};
 if(['parquet','parquet.fields'].includes(request.identity.module)||element.kind!=='field'||element.cardinality!=='one'||element.references?.some(r=>r.role==='record-type'))block(element,'An explicitly scalar logical Field is required; native representation elements cannot be relabeled');
 if(Object.hasOwn(element.extensions,PARQUET_FACETS_EXTENSION))block(element.extensions[PARQUET_FACETS_EXTENSION],'Existing binding cannot be overwritten');
 if(source.vocabularies[PARQUET_FACETS_EXTENSION]&&source.vocabularies[PARQUET_FACETS_EXTENSION]!.version!=='1.0.0')block(source.vocabularies[PARQUET_FACETS_EXTENSION],'Incompatible facet vocabulary');
 const inspection=inspectParquetFacetType(fragment),meaning=inspection.meaning;
 if(node.shape!=='one'||node.role!=='scalar')loss(fragment,'Select a logical scalar leaf explicitly; a container, wrapper, record or ambiguous repetition is not a scalar','not-expressible');
 for(const residual of node.residuals)loss(fragment,residual.reason,'unknown','native',residual.path);
 if(request.profile==='unresolved')loss(fragment,'An explicit declaration or PyArrow input profile is required');
 if(!meaning)loss(fragment,inspection.reason??'Unsupported declaration','not-expressible');
 else if(node.shape==='one'&&node.role==='scalar'){
  if(element.scalarType!==meaning.family)block(element,'Logical scalar family differs from native declaration');
  else if(request.profile!=='unresolved'){
   const facets=result.mapping.facets;
   if(meaning.family==='integer')facets.integerWidth={bits:meaning.bits,signed:meaning.signed};
   if(meaning.family==='decimal'){facets.precision=meaning.precision;facets.scale=meaning.scale;}
   if(meaning.family==='binary'&&meaning.exactBytes!==null){facets.length={max:meaning.exactBytes,unit:'byte'};loss(fragment,'Fixed exact byte length includes a lower bound not represented by the maximum-length ideal','not-expressible','length');}
   for(const key of Object.keys(facets))if(key!=='scale')result.mapping.observations.push({concept:key==='precision'?'decimal':key as Concept,idealPath,location:request.location,interpretation:'declared',outcome:'exact',basis:'Declared present non-null leaf domain; does not verify stored rows, writer origin or runtime enforcement'});
  }
  if(request.profile==='pyarrow-safe-array-input')loss(fragment,'A retained file does not establish which Arrow construction path produced it; native declaration is separate from input acceptance','unknown','conversion');
  if(request.obligation==='exact-input')loss(fragment,meaning.family==='float'&&meaning.bits===32?'Binary64 1.0000000000000002 narrows to binary32 1.0':meaning.family==='integer'?'PyArrow safe array construction truncates fractional input 1.5 to integer 1':'Native declaration does not prove exact conversion of arbitrary host inputs',meaning.family==='integer'||meaning.family==='float'&&meaning.bits===32?'approximated':'unknown','conversion');
 }
 // Opaque key/value metadata (including embedded Arrow schemas) may carry
 // additional bounds. Retention never establishes enforcement or overrides.
 const metadata=inspectParquetMetadata(source).metadata as Record<string,Json>;
 if(Array.isArray(metadata.key_value_metadata))metadata.key_value_metadata.forEach((entry,i)=>loss(entry,'Native key/value metadata remains attached without facet enforcement interpretation','unknown','native','/key_value_metadata/'+i));
 for(const path of inspection.unclaimedPaths){
  if(['/name','/repetition_type','/field_id'].includes(path))continue;
  loss(fragment,'Unclaimed native field refinement remains attached','unknown','native','/schema/'+request.location.index+path);
 }
 if(request.author){
  try{
   const author=verifyCoreFacetDeclaration(request.author,source);
   if(author.identity.module!==request.identity.module||author.identity.element!==request.identity.element)block(author.identity,'Author receipt identifies a different Field');
   else{
    const observed=inspectCoreFacets(source,author.identity).meaning;
    if(observed.state==='known'||observed.state==='partial'){
     for(const key of ['length','precision','scale','integerWidth'] as const){const declared=observed.interpreted[key],native=result.mapping.facets[key];
      if(declared!==undefined&&native!==undefined&&canonical(copyJson(declared))!==canonical(copyJson(native)))block({declared,native},'Authored '+key+' conflicts with native declaration');
      else if(declared!==undefined&&native===undefined)loss(declared,'Authored bound is retained but not established by the selected native declaration','unknown',key==='precision'||key==='scale'?'decimal':key,idealPath+'/'+key);
     }
     if(observed.state==='partial')loss(observed.facets,'Unknown authored facet qualifiers remain attached','unknown','native',idealPath);
    }
   }
  }catch(error){if(!(error instanceof UmfError))throw error;block(null,'Author provenance is invalid or stale: '+error.code);}
 }else if(Object.hasOwn(element,'facets'))block(element.facets,'Existing facets require verified author provenance');
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='unknown')?'unknown':result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'approximated';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document,field=target.modules[mi]!.elements[ei]!;
  if(!request.author&&Object.keys(result.mapping.facets).length)field.facets=copyJson(result.mapping.facets);
  target.vocabularies[PARQUET_FACETS_EXTENSION]??={version:'1.0.0'};
  field.extensions[PARQUET_FACETS_EXTENSION]=copyJson({origin:'classified',location:request.location,binding:{id:binding.id,version:binding.version},profile:request.profile,obligation:request.obligation,outcome:result.outcome,observations:result.mapping.observations});
  if(!validateDocument(target).valid)throw new UmfError('PARQUET_FACET_TARGET','Classification would violate core constraints');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:conflict?'PARQUET_FACET_CONFLICT':'PARQUET_FACET_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('PARQUET_FACET_RESULT',JSON.stringify(check.errors));return copied as unknown as ParquetFacetClassification;
}
export function verifyParquetFacetClassification(input:ParquetFacetClassification,current:Document):ParquetFacetClassification {
 const receipt=copyJson(input) as unknown as ParquetFacetClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('PARQUET_FACET_RECEIPT','Complete classified receipt required');
 if(canonical(copyJson(receipt))!==canonical(copyJson(classifyParquetFacets(receipt.source,receipt.request))))throw new UmfError('PARQUET_FACET_RECEIPT','Receipt disagrees with source and profile');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('PARQUET_FACET_STALE','Target changed after classification');return receipt;
}
export function recoverParquetFacetSource(input:ParquetFacetClassification,current:Document):Uint8Array {return exportParquetCapture(verifyParquetFacetClassification(input,current).source);}
