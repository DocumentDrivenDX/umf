import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Cardinality,type ExtensionPackage,type Element} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {exportAvroBundle,getAvroFieldMetadata,getAvroNode} from '../adapters/avro';
import {deriveAvroFields} from '../adapters/avro/metadata';
import {inspectAvroTypeShape,type AvroTypeLocation,type AvroTypeShape} from './avro-cardinality-type';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/avro-cardinality-classification.schema.json';
import manifest from '../../spec/extensions/avro-cardinality/package.json';
export const AVRO_CARDINALITY_EXTENSION='umf.avro.cardinality';
export const avroCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as avroCardinalityClassificationSchema} from '../../spec/core/avro-cardinality-classification.schema.json';
export interface AvroCardinalityRequest {column:string;nativeSource:string;dependencies?:{id:string;schema:string}[];identity:{module:string;element:string};profile:'present-non-null-schema'|'unresolved';mode:'strict'|'report';}
const binding=schema.properties.binding.const,basis=binding.subset;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
interface Node {identity:{module:string;element:string};location:AvroTypeLocation;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';nativeAllowsNull:boolean|null;definitions:AvroTypeLocation[];}
export interface AvroCardinalityClassification {
 operation:'classify-avro-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';cardinality:Cardinality;outcome:'exact'|'unknown'|'not-expressible';basis:typeof basis;nodes:Node[]};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Schema classification creates logical identities; native metadata and codec semantics remain intact. */
export function classifyAvroCardinality(input:Document,options:AvroCardinalityRequest):AvroCardinalityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as AvroCardinalityRequest;
 if(!checkRequest(request))throw new UmfError('AVRO_CARDINALITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.4.0'||!validateDocument(source).valid)throw new UmfError('AVRO_CARDINALITY_SOURCE','Valid core 0.4.0 required; migrate explicitly');
 const exported=exportAvroBundle(source),dependencies=request.dependencies??[];
 if(exported.schema!==renderTree(parseNativeJson(request.nativeSource))+'\n'||exported.dependencies.length!==dependencies.length||exported.dependencies.some((d,i)=>d.id!==dependencies[i]!.id||d.schema!==renderTree(parseNativeJson(dependencies[i]!.schema))+'\n'))throw new UmfError('AVRO_CARDINALITY_ARCHIVE','Source bundle differs from retained native archive');
 const column=getAvroFieldMetadata(source).find(c=>c.element.id===request.column);
 if(!column)throw new UmfError('AVRO_CARDINALITY_COLUMN','Native field not found');
 const rootLocation:AvroTypeLocation={path:column.path+'/type',...(column.dependencyId!==undefined?{dependencyId:column.dependencyId}:{})};
 const roots=[...dependencies.map(d=>({root:getAvroNode(source,'',d.id),dependencyId:d.id})),{root:getAvroNode(source,'')}];
 const r:AvroCardinalityClassification={operation:'classify-avro-cardinality',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',cardinality:'unspecified',outcome:'exact',basis,nodes:[]},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>r.residuals.push({path,value:copyJson(value),reason,recovery});
 const key=(l:AvroTypeLocation)=>JSON.stringify([l.dependencyId??null,l.path]),identities=new Map([[key(rootLocation),request.identity.element]]),elements:Element[]=[];
 const pending=[rootLocation];
 for(let i=0;i<pending.length;i++){
  const location=pending[i]!,id=identities.get(key(location))!,nativeFragment=getAvroNode(source,location.path,location.dependencyId);
  const node:Node={identity:{module:request.identity.module,element:id},location,nativeFragment,cardinality:'unspecified',interpretation:'unknown',nativeAllowsNull:null,definitions:[]};
  let shape:AvroTypeShape|undefined;
  if(request.profile==='unresolved')loss(location.path,nativeFragment,'An explicit present-non-null-schema profile is required; no container or availability inference is made');
  else{
   try{shape=inspectAvroTypeShape(roots,location);node.cardinality=shape.shape;node.nativeAllowsNull=shape.allowsNull;node.definitions=shape.branches.flatMap(b=>b.definition?[b.definition]:[]);
    node.interpretation=shape.shape==='unspecified'?'unknown':'declared';
    if(shape.shape==='unspecified')loss(location.path,nativeFragment,'Null-only or mixed container branches do not establish a single present non-null shape');
   }catch(error){if(!(error instanceof Error))throw error;node.interpretation='unsupported';loss(location.path,nativeFragment,'Native structural type is unresolved: '+error.message);}
  }
  const element:Element={id,kind:'field',...(i===0?{name:column.element.name!}:{}),cardinality:node.cardinality,extensions:{[AVRO_CARDINALITY_EXTENSION]:{origin:'classified',nativeColumn:request.column,binding:{id:binding.id,version:binding.version},profile:request.profile,basis,location:copyJson(location),nativeFragment,interpretation:node.interpretation,nativeAllowsNull:node.nativeAllowsNull,definitions:copyJson(node.definitions)}}};
  if(shape&&(shape.shape==='array'||shape.shape==='map')){
   const container=shape.branches.find(b=>b.shape===shape!.shape)!;
   const item=container.item!.location,itemKey=key(item);
   if(!identities.has(itemKey)){identities.set(itemKey,JSON.stringify([request.identity.element,item.dependencyId??null,item.path]));pending.push(item);}
   element.itemType={module:request.identity.module,element:identities.get(itemKey)!};
  }else if(shape?.shape==='one'){
   // Reuse qualified scalar-family rules; never interpret names or decimal facets with host coercion.
   const branches=shape.branches.map(b=>b.definition?getAvroNode(source,b.definition.path,b.definition.dependencyId):b.native);
   const nativeType=branches.length===1?renderTree(branches[0]!):'['+branches.map(renderTree).join(',')+']';
   const synthetic=parseNativeJson('{"type":"record","name":"CardinalityScalar","fields":[{"name":"value","type":'+nativeType+'}]}');
   const family=deriveAvroFields({version:'1.12.0',root:synthetic}).find(f=>f.path==='/fields/0')?.element.scalarType;
   if(family!==undefined)element.scalarType=family;
  }
  r.mapping.nodes.push(node);elements.push(element);
 }
 r.mapping.cardinality=r.mapping.nodes[0]!.cardinality;
 let conflict:string|undefined;
 const nativeElement=source.modules.find(m=>m.id==='avro.fields')?.elements.find(e=>e.id===request.column);
 if(nativeElement?.kind!=='field')conflict='Native member must first be classified as an explicit Field';
 const module=source.modules.find(m=>m.id===request.identity.module);
 if(request.identity.module==='avro.fields'||request.identity.module==='schema')conflict='Logical fields cannot extend native representation modules';
 if(new Set(elements.map(e=>e.id)).size!==elements.length||module?.elements.some(e=>elements.some(n=>n.id===e.id)))conflict='A logical identity collides with existing meaning';
 if(source.vocabularies[AVRO_CARDINALITY_EXTENSION]&&source.vocabularies[AVRO_CARDINALITY_EXTENSION]!.version!=='1.0.0')conflict='Incompatible binding vocabulary';
 if(conflict)loss('/modules',null,conflict);
 if(r.residuals.length)r.mapping.outcome=r.mapping.nodes.some(n=>n.interpretation==='unsupported')?'not-expressible':'unknown';
 if(conflict||request.mode==='strict'&&r.residuals.length)r.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;let destination=target.modules.find(m=>m.id===request.identity.module);
  if(!destination){destination={id:request.identity.module,namespace:'',elements:[]};target.modules.push(destination);}
  destination.elements.push(...elements);target.vocabularies[AVRO_CARDINALITY_EXTENSION]??={version:'1.0.0'};
  if(!validateDocument(target).valid)throw new UmfError('AVRO_CARDINALITY_TARGET','Invalid logical candidate');
  const checkNative=exportAvroBundle(target);
  if(checkNative.schema!==exported.schema||canonical(copyJson(checkNative.dependencies))!==canonical(copyJson(exported.dependencies)))throw new UmfError('AVRO_CARDINALITY_NATIVE','Native bundle changed');
  r.target=target;
 }
 r.diagnostics=r.residuals.map(v=>({code:'AVRO_CARDINALITY_RESIDUAL',path:v.path,message:v.reason,severity:r.status==='blocked'?'error':'warning'}));
 const output=copyJson(r);if(!check(output))throw new UmfError('AVRO_CARDINALITY_RESULT',JSON.stringify(check.errors));return output as unknown as AvroCardinalityClassification;
}
/** Consistency checking, not receipt authentication. */
export function verifyAvroCardinalityClassification(input:AvroCardinalityClassification,current:Document){
 const r=copyJson(input) as unknown as AvroCardinalityClassification;
 if(!check(r)||r.status!=='classified')throw new UmfError('AVRO_CARDINALITY_RECEIPT','Complete classified receipt required');
 if(canonical(copyJson(r))!==canonical(copyJson(classifyAvroCardinality(r.source,r.request))))throw new UmfError('AVRO_CARDINALITY_RECEIPT','Receipt differs from retained source and request');
 if(canonical(copyJson(current))!==canonical(copyJson(r.target)))throw new UmfError('AVRO_CARDINALITY_STALE','Current target changed');return r;
}
export function recoverAvroCardinalityBundle(input:AvroCardinalityClassification,current:Document){const r=verifyAvroCardinalityClassification(input,current);return {schema:r.request.nativeSource,dependencies:copyJson(r.request.dependencies??[]) as {id:string;schema:string}[]};}
