import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type Nullability,type ExtensionPackage} from '../model/types';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {exportParquetCapture} from '../adapters/parquet';
import {getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {inspectParquetSchema,type ParquetSchemaNode} from '../adapters/parquet/schema';
import {inspectParquetContainers} from '../adapters/parquet/containers';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import core from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/parquet-nullability-classification.schema.json';
import manifest from '../../spec/extensions/parquet-nullability/package.json';
export const PARQUET_NULLABILITY_EXTENSION='umf.parquet.nullability';
export const parquetNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as parquetNullabilityClassificationSchema} from '../../spec/core/parquet-nullability-classification.schema.json';
export interface ParquetNullabilityRequest {
 index:number;mode:'strict'|'report';scope:'row-leaf-value'|'repeated-element-value'|'write-input'|'unresolved';carrier:'definition-level'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface ParquetNullabilityClassification {
 operation:'classify-parquet-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:Json;ancestry:{index:number;repetition:'required'|'optional'|'repeated';definitionLevel:number;repetitionLevel:number}[];contextIndex:number|null;absencePaths:string[];nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';scope:ParquetNullabilityRequest['scope'];carrier:ParquetNullabilityRequest['carrier'];basis:'Physical definition-level availability in the selected context; repeated cardinality, writer inputs, Arrow metadata and logical refinements remain separate'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
export function classifyParquetNullability(input:Document,options:ParquetNullabilityRequest):ParquetNullabilityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as ParquetNullabilityRequest;
 if(!checkRequest(request))throw new UmfError('PARQUET_NULLABILITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.3.0')throw new UmfError('PARQUET_NULLABILITY_SOURCE','Valid core 0.3.0 required; migrate explicitly');
 exportParquetCapture(source);
 const inventory=getParquetFieldMetadata(source),physical=inspectParquetSchema(source),containers=inspectParquetContainers(source);
 if(inventory.status!=='checked'||physical.status!=='checked'||containers.status!=='checked')throw new UmfError('PARQUET_NULLABILITY_SCHEMA','Checked physical schema and container topology required');
 const metadata=inventory.fields.find(c=>c.index===request.index);
 if(!metadata)throw new UmfError('PARQUET_NULLABILITY_COLUMN','Native schema member not found');
 let chain:ParquetSchemaNode[]|undefined;
 function find(node:ParquetSchemaNode,parents:ParquetSchemaNode[]){const path=node.index===0?parents:[...parents,node];if(node.index===request.index)chain=path;else for(const child of node.children)find(child,path);}
 find(physical.tree!,[]);if(!chain)throw new UmfError('PARQUET_NULLABILITY_PATH','Schema ancestry unavailable');
 const nativeSchemaElements=(physical.metadata as unknown as {schema:Record<string,Json>[]}).schema;
 const ancestry=chain.map(n=>({index:n.index,repetition:({'0':'required','1':'optional','2':'repeated'} as const)[nativeSchemaElements[n.index]!.repetition_type as '0'|'1'|'2'],definitionLevel:n.definitionLevel,repetitionLevel:n.repetitionLevel}));
 const mi=source.modules.findIndex(m=>m.id==='parquet.fields'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===metadata.element.id)??-1;
 if(mi<0||ei<0)throw new UmfError('PARQUET_NULLABILITY_COLUMN','Derived column member is required');
 const element=source.modules[mi]!.elements[ei]!,nativeFragment=metadata.nativeField;
 const idealPath=`/modules/${mi}/elements/${ei}/nullability`,base='/schema/'+request.index;
 const result:ParquetNullabilityClassification={operation:'classify-parquet-nullability',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,ancestry,contextIndex:null,absencePaths:[],nullability:'unspecified',interpretation:'unknown',outcome:'unknown',scope:request.scope,carrier:request.carrier,basis:'Physical definition-level availability in the selected context; repeated cardinality, writer inputs, Arrow metadata and logical refinements remain separate'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 let reason:string|undefined;
 const repeated=ancestry.filter(n=>n.repetition==='repeated');
 if(!Object.hasOwn(nativeFragment as object,'type')){reason='A group/container is not a physical leaf; choose a leaf with an explicit context';result.mapping.interpretation='unsupported';}
 else if(request.carrier!=='definition-level')reason='Explicit physical definition-level carrier required; Arrow masks and omitted inputs remain separate';
 else if(request.scope==='row-leaf-value'){
  if(repeated.length){reason='A repeated path has no single scalar leaf value per row; select repeated-element context or retain a residual';result.mapping.interpretation='unsupported';}
  else result.mapping.contextIndex=0;
 }else if(request.scope==='repeated-element-value'){
  if(!repeated.length){reason='Repeated-element context requires a repeated ancestor or repeated primitive';result.mapping.interpretation='unsupported';}
  else result.mapping.contextIndex=repeated.at(-1)!.index;
 }else reason='Writer-input and unresolved scopes cannot be inferred from physical schema declarations';
 if(reason){loss(base,nativeFragment,reason);if(result.mapping.interpretation==='unsupported')result.mapping.outcome='not-expressible';}
 else{
  const anchor=ancestry.findIndex(n=>n.index===result.mapping.contextIndex);
  result.mapping.absencePaths=ancestry.slice(anchor+1).filter(n=>n.repetition==='optional').map(n=>'/schema/'+n.index+'/repetition_type');
  result.mapping.nullability=result.mapping.absencePaths.length?'absent-allowed':'required';result.mapping.interpretation='declared';result.mapping.outcome='exact';
 }
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreNullabilityDeclaration(request.author,source);
   if(author.identity.module!=='parquet.fields'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.nullability!==result.mapping.nullability)conflict='Authored availability differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'nullability'))conflict='Existing availability requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,PARQUET_NULLABILITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[PARQUET_NULLABILITY_EXTENSION]&&source.vocabularies[PARQUET_NULLABILITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(conflict){loss(idealPath,Object.hasOwn(element,'nullability')?element.nullability:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[ei]!;selected.nullability=result.mapping.nullability;
  target.vocabularies[PARQUET_NULLABILITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[PARQUET_NULLABILITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},scope:request.scope,carrier:request.carrier,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath,contextIndex:result.mapping.contextIndex,repetitionLevel:metadata.repetitionLevel};result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'PARQUET_NULLABILITY_CONFLICT':'PARQUET_NULLABILITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('PARQUET_NULLABILITY_RESULT',JSON.stringify(check.errors));return copied as unknown as ParquetNullabilityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyParquetNullabilityClassification(input:ParquetNullabilityClassification,current:Document):ParquetNullabilityClassification {
 const receipt=copyJson(input) as unknown as ParquetNullabilityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('PARQUET_NULLABILITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyParquetNullability(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('PARQUET_NULLABILITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('PARQUET_NULLABILITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover original file bytes, including unclaimed pages and embedded metadata. */
export function recoverParquetNullabilityBytes(input:ParquetNullabilityClassification,current:Document):Uint8Array{
 const receipt=verifyParquetNullabilityClassification(input,current);return exportParquetCapture(receipt.source);
}
