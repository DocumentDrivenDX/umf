import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {exportParquetCapture} from '../adapters/parquet';
import {importParquetSchema} from '../adapters/parquet/field-metadata';
import {parquetCardinalityFile,type ParquetCardinalityCarrier} from './parquet-cardinality-carrier';
import {inspectParquetCardinalityShape} from './parquet-cardinality-shape';
export type {ParquetCardinalityCarrier} from './parquet-cardinality-carrier';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import authorSchema from '../../spec/core/cardinality-operation.schema.json';
import schema from '../../spec/core/cardinality-parquet-projection.schema.json';
export {default as cardinalityParquetProjectionSchema} from '../../spec/core/cardinality-parquet-projection.schema.json';
export interface CardinalityParquetRequest {id:string;recordName:string;fieldName:string;nativeType:ParquetCardinalityCarrier;availability:'definition-level'|'unresolved';requireExactValues:boolean;mode:'strict'|'report';}
const binding=schema.properties.binding.const;
export interface CardinalityParquetProjection {
 operation:'project-cardinality-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalityParquetRequest;target?:Document;binding:typeof binding;
 mapping:{origin:'authored';idealPath:string;cardinality:'one'|'array'|'map'|'unspecified';outcome:'exact'|'approximated'|'unknown'|'not-expressible';items:{idealPath:string;nativeIndex:number}[]};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core,authorSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile({...schema.properties.request,$defs:schema.$defs});
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
export function projectCardinalityToParquet(input:CoreCardinalityDeclaration,options:CardinalityParquetRequest):CardinalityParquetProjection {
 const copied=copyJson(input) as unknown as CoreCardinalityDeclaration,author=verifyCoreCardinalityDeclaration(copied,copied.target);
 const source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as CardinalityParquetRequest;
 if(source.umf!=='0.4.0')throw new UmfError('CARDINALITY_PARQUET_VERSION','This binding requires a core 0.4.0 declaration; facet-envelope projection requires a separately qualified binding');
 if(!checkRequest(request))throw new UmfError('CARDINALITY_PARQUET_REQUEST',JSON.stringify(checkRequest.errors));
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),ei=source.modules[mi]!.elements.findIndex(e=>e.id===author.identity.element),element=source.modules[mi]!.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const target=importParquetSchema(parquetCardinalityFile(request.recordName,request.fieldName,request.nativeType),{id:request.id});
 const nodes=new Map(inspectParquetCardinalityShape(target,1).nodes.map(n=>[n.index,n]));
 const result:CardinalityParquetProjection={operation:'project-cardinality-parquet',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/cardinality',cardinality:author.provenance.cardinality,outcome:'exact',items:[]},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'approximated'|'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 const visited=new Set<string>(),fieldsSeen=new Set<string>(),modulesSeen=new Set<number>();
 function match(moduleId:string,elementId:string,index:number){
  const im=source.modules.findIndex(m=>m.id===moduleId),ie=source.modules[im]!.elements.findIndex(e=>e.id===elementId),field=source.modules[im]!.elements[ie]!,p=`/modules/${im}/elements/${ie}`;
  const pair=JSON.stringify([moduleId,elementId,index]);if(visited.has(pair))return;visited.add(pair);fieldsSeen.add(p);modulesSeen.add(im);
  const shape=nodes.get(index)!;result.mapping.items.push({idealPath:p,nativeIndex:index});
  for(const residual of shape.residuals)loss(p,residual,residual.reason,'approximated');
  const cardinality=field.cardinality??'unspecified';
  if(cardinality==='unspecified')loss(p+'/cardinality',cardinality,'No ideal shape is asserted; the selected native type remains an explicit refinement');
  else if(cardinality!==shape.shape)loss(p+'/cardinality',cardinality,'Native type does not express the selected present non-null shape','not-expressible');
  if(p===path&&field.name!==undefined&&field.name!==request.fieldName)loss(p+'/name',field.name,'Selected native field name differs from the ideal name','not-expressible');
  if(p!==path&&field.name!==undefined)loss(p+'/name',field.name,'Item/value Field names have no separate Parquet field-name position');
  for(const [k,v] of Object.entries(field))if(!['id','kind','name','scalarType','cardinality','itemType','nullability'].includes(k)&&!(k==='extensions'&&v&&typeof v==='object'&&!Object.keys(v).length))loss(p+'/'+pointer(k),v,'Field metadata is retained but not projected');
  if(field.nullability!==undefined){
   if(request.availability!=='definition-level'||!['required','absent-allowed'].includes(field.nullability as string))loss(p+'/nullability',field.nullability,'Explicit definition-level carrier must be selected; writer-input/default/unspecified availability is not inferred');
   else if(shape.nativeNullable!==(field.nullability==='absent-allowed'))loss(p+'/nullability',field.nullability,'Native definition-level availability differs from independently stated availability','not-expressible');
  }
  if(field.scalarType!==undefined){
   const family=shape.shape==='one'?shape.scalarType:undefined;
   if(field.scalarType!==family)loss(p+'/scalarType',field.scalarType,'Native scalar family does not express the stated item/value family','not-expressible');
  }
  if((cardinality==='array'||cardinality==='map')&&shape.shape===cardinality){
   const item=shape.itemIndex!;
   if(field.itemType===undefined)loss(p+'/itemType',null,'Native items/values require a concrete schema while ideal member meaning is unspecified','approximated');
   else{
    const ref=field.itemType as {module:string;element:string};
    for(const [k,v] of Object.entries(ref))if(!['module','element'].includes(k))loss(p+'/itemType/'+pointer(k),v,'Unknown item-reference metadata is retained');
    match(ref.module,ref.element,item);
   }
  }else if(field.itemType!==undefined)loss(p+'/itemType',field.itemType,'Item/value reference cannot be lowered through an incompatible native shape','not-expressible');
 }
 match(author.identity.module,author.identity.element,1);
 if(request.requireExactValues)loss(path,element,'Schema shape/family matching does not prove value-domain or codec exactness: binary32 narrows 1.0000000000000002 to 1.0; native MAP permits duplicate or non-string keys','approximated');
 for(const [k,v] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(k))loss('/'+pointer(k),v,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary meaning is not projected');
 source.modules.forEach((m,i)=>{
  if(!modulesSeen.has(i)){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  if(m.namespace)loss(`/modules/${i}/namespace`,m.namespace,'Native root namespace does not represent this module namespace','not-expressible');
  for(const [k,v] of Object.entries(m))if(!['id','namespace','elements'].includes(k))loss(`/modules/${i}/`+pointer(k),v,'Module metadata is retained');
  m.elements.forEach((e,j)=>{if(!fieldsSeen.has(`/modules/${i}/elements/${j}`))loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else result.target=target;
 result.diagnostics=result.residuals.map(r=>({code:'CARDINALITY_PARQUET_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('CARDINALITY_PARQUET_RESULT',JSON.stringify(check.errors));return output as unknown as CardinalityParquetProjection;
}
export function recoverCardinalityFromParquet(input:CardinalityParquetProjection,native:Uint8Array):Document {
 const receipt=copyJson(input) as unknown as CardinalityParquetProjection;
 if(!check(receipt)||receipt.status!=='projected')throw new UmfError('CARDINALITY_PARQUET_RECEIPT','Complete projected receipt required');
 const expected=projectCardinalityToParquet(receipt.author,receipt.request);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CARDINALITY_PARQUET_RECEIPT','Receipt disagrees with retained author and request');
 const bytes=exportParquetCapture(receipt.target!);
 if(!(native instanceof Uint8Array)||native.length!==bytes.length||native.some((b,i)=>b!==bytes[i]))throw new UmfError('CARDINALITY_PARQUET_STALE','Native bytes changed');
 return copyJson(receipt.source) as unknown as Document;
}
