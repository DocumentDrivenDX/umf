import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type Cardinality,type ExtensionPackage} from '../model/types';
import {type NativeJson} from '../model/native-json';
import {verifyCoreCardinalityDeclaration,type CoreCardinalityDeclaration} from '../model/cardinality';
import {exportTableSpec,exportTableSpecBundle,getTableSpecColumn,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import core from '../../spec/core/cardinality-document.schema.json';
import authorSchema from '../../spec/core/cardinality-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/tablespec-cardinality-classification.schema.json';
import manifest from '../../spec/extensions/tablespec-cardinality/package.json';
export const TABLESPEC_CARDINALITY_EXTENSION='umf.tablespec.cardinality';
export const tableSpecCardinalityPackage=manifest as unknown as ExtensionPackage;
export {default as tableSpecCardinalityClassificationSchema} from '../../spec/core/tablespec-cardinality-classification.schema.json';
export interface TableSpecCardinalityRequest {
 column:number;mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';author?:CoreCardinalityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface TableSpecCardinalityClassification {
 operation:'classify-tablespec-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';basis:'Explicit native data_type and uncoerced dimension under selected metadata profile; item and execution semantics remain native'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
function nativeArchive(source:Document):string|Record<string,string>{
 const payload=source.extensions?.[TABLESPEC_EXTENSION];
 return payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.hasOwn(payload,'splitFiles')?exportTableSpecBundle(source):exportTableSpec(source);
}
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Classify declared column shape only. Retain vector/item/runtime refinements in the native archive. */
export function classifyTableSpecCardinality(input:Document,options:TableSpecCardinalityRequest):TableSpecCardinalityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecCardinalityRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_CARDINALITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.4.0')throw new UmfError('TABLESPEC_CARDINALITY_SOURCE','Valid core 0.4.0 required; migrate explicitly');
 nativeArchive(source); // Verify metadata/archive consistency without pretending to run native validation.
 const nativeFragment=getTableSpecColumn(source,request.column);
 if(nativeFragment.kind!=='object')throw new UmfError('TABLESPEC_CARDINALITY_COLUMN','Expected native column');
 const mi=source.modules.findIndex(m=>m.id==='table'),element=source.modules[mi]!.elements[request.column]!;
 const idealPath=`/modules/${mi}/elements/${request.column}/cardinality`,base=`/extensions/umf.tablespec/root/members/columns/items/${request.column}/members/data_type`;
 const result:TableSpecCardinalityClassification={operation:'classify-tablespec-cardinality',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,cardinality:'unspecified',interpretation:'unknown',outcome:'unknown',basis:'Explicit native data_type and uncoerced dimension under selected metadata profile; item and execution semantics remain native'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 const type=nativeFragment.members.data_type,dimension=nativeFragment.members.dimension;
 const scalarTypes=['VARCHAR','DECIMAL','INTEGER','DATE','DATETIME','TIMESTAMP','BOOLEAN','TEXT','CHAR','FLOAT'];
 let reason:string|undefined;
 // Keep exact native number tokens; neither Pydantic coercion nor unsafe JS rounding
 // can establish a declared positive dimension. Unknown lexical forms stay residual.
 const positiveDimension=dimension?.kind==='number'&&/^[1-9][0-9]*$/.test(dimension.value);
 const absentDimension=!dimension||dimension.kind==='null';
 if(request.profile==='unresolved')reason='No metadata profile selected; native schema/runtime differences remain unresolved';
 else if(type?.kind!=='string'||!scalarTypes.includes(type.value)&&type.value!=='EMBEDDING'){
  reason='Unsupported native data_type; helper fallback and EMBEDDING prefix matching do not establish a declaration';result.mapping.interpretation='unsupported';
 }else if(!absentDimension&&!positiveDimension){
  reason='Dimension is not an uncoerced positive integer token; native normalization is not an authored declaration';
 }else if(request.profile==='runtime-model'&&(type.value==='EMBEDDING'?absentDimension:!absentDimension)){
  reason='Runtime model requires a dimension on EMBEDDING and rejects dimensions on scalar columns';result.mapping.interpretation='unsupported';
 }else{
  result.mapping.cardinality=type.value==='EMBEDDING'?'array':'one';result.mapping.interpretation='declared';result.mapping.outcome='exact';
 }
 if(reason){loss(base.replace(/\/members\/data_type$/,''),nativeFragment,reason);if(result.mapping.interpretation==='unsupported')result.mapping.outcome='not-expressible';}
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreCardinalityDeclaration(request.author,source);
   if(author.identity.module!=='table'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.cardinality!==result.mapping.cardinality)conflict='Authored cardinality differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'cardinality'))conflict='Existing cardinality requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,TABLESPEC_CARDINALITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[TABLESPEC_CARDINALITY_EXTENSION]&&source.vocabularies[TABLESPEC_CARDINALITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(result.mapping.cardinality==='array'&&Object.hasOwn(element,'scalarType'))conflict='Array classification cannot erase or relocate an existing scalar assertion';
 if(Object.hasOwn(element,'itemType'))loss(idealPath.replace(/cardinality$/,'itemType'),element.itemType,'This observation does not classify or confirm item/value meaning; retained author item references stay independent');
 if(conflict){loss(idealPath,Object.hasOwn(element,'cardinality')?element.cardinality:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[request.column]!;selected.cardinality=result.mapping.cardinality;
  target.vocabularies[TABLESPEC_CARDINALITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[TABLESPEC_CARDINALITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},profile:request.profile,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath,basis:result.mapping.basis};if(!validateDocument(target).valid)throw new UmfError('TABLESPEC_CARDINALITY_TARGET','Classification would violate core constraints');result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'TABLESPEC_CARDINALITY_CONFLICT':'TABLESPEC_CARDINALITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('TABLESPEC_CARDINALITY_RESULT',JSON.stringify(check.errors));return copied as unknown as TableSpecCardinalityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyTableSpecCardinalityClassification(input:TableSpecCardinalityClassification,current:Document):TableSpecCardinalityClassification {
 const receipt=copyJson(input) as unknown as TableSpecCardinalityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_CARDINALITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyTableSpecCardinality(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_CARDINALITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_CARDINALITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover exact original text or split files, including unclaimed native content. */
export function recoverTableSpecCardinalitySource(input:TableSpecCardinalityClassification,current:Document):string|Record<string,string>{
 const receipt=verifyTableSpecCardinalityClassification(input,current);return nativeArchive(receipt.source);
}
