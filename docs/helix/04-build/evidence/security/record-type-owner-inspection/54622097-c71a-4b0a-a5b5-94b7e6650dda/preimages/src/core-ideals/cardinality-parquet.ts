import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Cardinality,type ExtensionPackage,type Element} from '../model/types';
import {exportParquetCapture} from '../adapters/parquet';
import {inspectParquetCardinalityShape,type ParquetCardinalityNode} from './parquet-cardinality-shape';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import schema from '../../spec/core/parquet-cardinality-classification.schema.json';
import manifest from '../../spec/extensions/parquet-cardinality/package.json';
export const PARQUET_CARDINALITY_EXTENSION='umf.parquet.cardinality';
export const parquetCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as parquetCardinalityClassificationSchema} from '../../spec/core/parquet-cardinality-classification.schema.json';
export interface ParquetCardinalityRequest {index:number;identity:{module:string;element:string};profile:'present-value-schema'|'unresolved';mode:'strict'|'report';}
const binding=schema.properties.binding.const,basis=binding.subset;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
type Node=ParquetCardinalityNode&{identity:{module:string;element:string}};
export interface ParquetCardinalityClassification {
 operation:'classify-parquet-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';cardinality:Cardinality;outcome:'exact'|'approximated'|'unknown';basis:typeof basis;nodes:Node[]};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Publish logical Fields while retaining the physical archive and all existing meaning. */
export function classifyParquetCardinality(input:Document,options:ParquetCardinalityRequest):ParquetCardinalityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetCardinalityRequest;
 if(!checkRequest(request))throw new UmfError('PARQUET_CARDINALITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.4.0'||!validateDocument(source).valid)throw new UmfError('PARQUET_CARDINALITY_SOURCE','Valid core 0.4.0 required; migrate explicitly');
 const original=exportParquetCapture(source),shape=inspectParquetCardinalityShape(source,request.index);
 const observed:ParquetCardinalityNode[]=request.profile==='present-value-schema'?shape.nodes:[{
  index:request.index,path:shape.nodes[0]!.path,nativeFragment:shape.nodes[0]!.nativeFragment,
  shape:'unspecified',role:'unresolved',nativeNullable:null,
  residuals:[{path:'/schema/'+request.index,reason:'An explicit present-value-schema profile is required; no shape or availability is inferred'}],
 }];
 const identities=new Map(observed.map(n=>[n.index,n.index===request.index?request.identity.element:JSON.stringify([request.identity.element,n.index])]));
 const nodes=observed.map(n=>({...n,identity:{module:request.identity.module,element:identities.get(n.index)!}}));
 const r:ParquetCardinalityClassification={operation:'classify-parquet-cardinality',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',cardinality:nodes[0]!.shape,outcome:'exact',basis,nodes},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>r.residuals.push({path,value:copyJson(value),reason,recovery});
 const elements:Element[]=nodes.map(node=>{
  for(const residual of node.residuals)loss(residual.path,node.nativeFragment,residual.reason);
  const element:Element={id:node.identity.element,name:node.path.at(-1)!,kind:'field',cardinality:node.shape,extensions:{[PARQUET_CARDINALITY_EXTENSION]:{origin:'classified',binding:{id:binding.id,version:binding.version},profile:request.profile,basis,node:copyJson(node)}}};
  if(node.scalarType!==undefined)element.scalarType=node.scalarType;
  if(node.itemIndex!==undefined)element.itemType={module:request.identity.module,element:identities.get(node.itemIndex)!};
  // recordMembers remains a native observation; do not invent a core record definition/link.
  return element;
 });
 let conflict:string|undefined;
 const module=source.modules.find(m=>m.id===request.identity.module);
 if(['parquet','parquet.fields'].includes(request.identity.module))conflict='Logical fields cannot extend native representation modules';
 if(new Set(elements.map(e=>e.id)).size!==elements.length||module?.elements.some(e=>elements.some(n=>n.id===e.id)))conflict='A logical identity collides with existing meaning';
 if(source.vocabularies[PARQUET_CARDINALITY_EXTENSION]&&source.vocabularies[PARQUET_CARDINALITY_EXTENSION]!.version!=='1.0.0')conflict='Incompatible binding vocabulary';
 if(conflict)loss('/modules',null,conflict);
 if(r.residuals.length)r.mapping.outcome=nodes.some(n=>n.shape==='unspecified')||conflict?'unknown':'approximated';
 if(conflict||request.mode==='strict'&&r.residuals.length)r.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document;let destination=target.modules.find(m=>m.id===request.identity.module);
  if(!destination){destination={id:request.identity.module,namespace:'',elements:[]};target.modules.push(destination);}
  destination.elements.push(...elements);target.vocabularies[PARQUET_CARDINALITY_EXTENSION]??={version:'1.0.0'};
  if(!validateDocument(target).valid)throw new UmfError('PARQUET_CARDINALITY_TARGET','Invalid logical candidate');
  const back=exportParquetCapture(target);
  if(back.length!==original.length||back.some((b,i)=>b!==original[i]))throw new UmfError('PARQUET_CARDINALITY_NATIVE','Native archive changed');
  r.target=target;
 }
 r.diagnostics=r.residuals.map(v=>({code:'PARQUET_CARDINALITY_RESIDUAL',path:v.path,message:v.reason,severity:r.status==='blocked'?'error':'warning'}));
 const output=copyJson(r);if(!check(output))throw new UmfError('PARQUET_CARDINALITY_RESULT',JSON.stringify(check.errors));return output as unknown as ParquetCardinalityClassification;
}
/** Recompute consistency; this is not receipt authentication. */
export function verifyParquetCardinalityClassification(input:ParquetCardinalityClassification,current:Document){
 const r=copyJson(input) as unknown as ParquetCardinalityClassification;
 if(!check(r)||r.status!=='classified')throw new UmfError('PARQUET_CARDINALITY_RECEIPT','Complete classified receipt required');
 if(canonical(copyJson(r))!==canonical(copyJson(classifyParquetCardinality(r.source,r.request))))throw new UmfError('PARQUET_CARDINALITY_RECEIPT','Receipt differs from retained source and request');
 if(canonical(copyJson(current))!==canonical(copyJson(r.target)))throw new UmfError('PARQUET_CARDINALITY_STALE','Current target changed');return r;
}
export function recoverParquetCardinalityBytes(input:ParquetCardinalityClassification,current:Document){const r=verifyParquetCardinalityClassification(input,current);return exportParquetCapture(r.source);}
