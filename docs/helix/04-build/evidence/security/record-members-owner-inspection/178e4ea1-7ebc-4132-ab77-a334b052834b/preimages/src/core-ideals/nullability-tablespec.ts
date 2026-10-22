import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type Nullability,type ExtensionPackage} from '../model/types';
import {type NativeJson} from '../model/native-json';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {exportTableSpec,exportTableSpecBundle,getTableSpecColumn,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import core from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/tablespec-nullability-classification.schema.json';
import manifest from '../../spec/extensions/tablespec-nullability/package.json';
export const TABLESPEC_NULLABILITY_EXTENSION='umf.tablespec.nullability';
export const tableSpecNullabilityPackage=manifest as unknown as ExtensionPackage;
export {default as tableSpecNullabilityClassificationSchema} from '../../spec/core/tablespec-nullability-classification.schema.json';
export interface TableSpecNullabilityRequest {
 column:number;mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';context:string|null;carrier:'null-value'|'unresolved';author?:CoreNullabilityDeclaration;
}
const binding=schema.properties.binding.const;
const recovery='Retain the complete source and native archive; unknown native meaning is not replaced by the core label' as const;
export interface TableSpecNullabilityClassification {
 operation:'classify-tablespec-nullability';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecNullabilityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;nullability:Nullability;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'unknown'|'not-expressible';context:string|null;carrier:TableSpecNullabilityRequest['carrier'];basis:'Native declaration under selected profile and context; not runtime coercion or row validation'};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
function nativeArchive(source:Document):string|Record<string,string>{
 const payload=source.extensions?.[TABLESPEC_EXTENSION];
 return payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.hasOwn(payload,'splitFiles')?exportTableSpecBundle(source):exportTableSpec(source);
}
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Read exact declarations under the caller's profile/context/carrier. Never use native coercion or defaults as ideal meaning. */
export function classifyTableSpecNullability(input:Document,options:TableSpecNullabilityRequest):TableSpecNullabilityClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecNullabilityRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_NULLABILITY_REQUEST',JSON.stringify(checkRequest.errors));
 if(!validateDocument(source).valid||source.umf!=='0.3.0')throw new UmfError('TABLESPEC_NULLABILITY_SOURCE','Valid core 0.3.0 required; migrate explicitly');
 nativeArchive(source); // Verify metadata/archive consistency without pretending to run native validation.
 const nativeFragment=getTableSpecColumn(source,request.column);
 if(nativeFragment.kind!=='object')throw new UmfError('TABLESPEC_NULLABILITY_COLUMN','Expected native column');
 const mi=source.modules.findIndex(m=>m.id==='table'),element=source.modules[mi]!.elements[request.column]!;
 const idealPath=`/modules/${mi}/elements/${request.column}/nullability`,base=`/extensions/umf.tablespec/root/members/columns/items/${request.column}/members/nullable`;
 const result:TableSpecNullabilityClassification={operation:'classify-tablespec-nullability',version:'1.0.0',status:'classified',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment,nullability:'unspecified',interpretation:'unknown',outcome:'unknown',context:request.context,carrier:request.carrier,basis:'Native declaration under selected profile and context; not runtime coercion or row validation'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({path,value:copyJson(value),reason,recovery});
 let selected=nativeFragment.members.nullable,reason:string|undefined;
 if(request.profile==='unresolved')reason='No native profile selected; schema/runtime disagreement remains unresolved';
 else if(request.carrier==='unresolved')reason='No explicit absence carrier selected; null and omission are not equated';
 else if(!selected||selected.kind==='null')reason='Missing/null nullable metadata is not an availability declaration; native helper defaults are not inferred';
 else if(selected.kind==='boolean'){
  if(request.profile==='checked-schema'){reason='Checked-in schema rejects scalar booleans; select the runtime profile explicitly';result.mapping.interpretation='unsupported';}
 }else if(selected.kind==='object'){
  if(request.context===null)reason='Context map requires a selected context; aggregate truthiness is not a context resolver';
  else{
   result.mapping.nativePath=base+'/members/'+pointer(request.context);
   selected=Object.hasOwn(selected.members,request.context)?selected.members[request.context]:undefined;
   if(!selected||selected.kind==='null')reason='Selected context has no declared boolean; no default context or permissive default is inferred';
   else if(selected.kind!=='boolean'){reason='Selected context value is not an exact boolean; native truthiness is not ideal meaning';result.mapping.interpretation='unsupported';}
  }
 }else{reason='Native scalar coercion or unsupported nullable shape is not an exact boolean declaration';result.mapping.interpretation='unsupported';}
 if(reason){loss(result.mapping.nativePath,selected??null,reason);if(result.mapping.interpretation==='unsupported')result.mapping.outcome='not-expressible';}
 else{
  if(selected?.kind!=='boolean')throw new UmfError('TABLESPEC_NULLABILITY_BASIS','Expected a checked native boolean');
  result.mapping.nullability=selected.value?'absent-allowed':'required';result.mapping.interpretation='declared';result.mapping.outcome='exact';
 }
 let conflict:string|undefined;
 if(element.kind!=='field')conflict='Selected native member must already be an explicit Field; this operation does not replace its kind';
 if(request.author!==undefined){
  try{
   const author=verifyCoreNullabilityDeclaration(request.author,source);
   if(author.identity.module!=='table'||author.identity.element!==element.id)conflict='Author receipt identifies a different member';
   else if(author.provenance.nullability!==result.mapping.nullability)conflict='Authored availability differs from the native observation; neither assertion may be overwritten';
  }catch(error){if(!(error instanceof UmfError))throw error;conflict='Author provenance is invalid or stale: '+error.code;}
 }else if(Object.hasOwn(element,'nullability'))conflict='Existing availability requires verified author provenance before native classification';
 if(Object.hasOwn(element.extensions,TABLESPEC_NULLABILITY_EXTENSION))conflict='Existing binding scope cannot be overwritten; reclassify from its retained source';
 if(source.vocabularies[TABLESPEC_NULLABILITY_EXTENSION]&&source.vocabularies[TABLESPEC_NULLABILITY_EXTENSION]!.version!=='1.0.0')conflict='Existing binding vocabulary version is incompatible';
 if(conflict){loss(idealPath,Object.hasOwn(element,'nullability')?element.nullability:null,conflict);result.mapping.outcome='unknown';}
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{const target=copyJson(source) as unknown as Document;const selected=target.modules[mi]!.elements[request.column]!;selected.nullability=result.mapping.nullability;
  target.vocabularies[TABLESPEC_NULLABILITY_EXTENSION]??={version:'1.0.0'};
  selected.extensions[TABLESPEC_NULLABILITY_EXTENSION]={origin:'classified',binding:{id:binding.id,version:binding.version},profile:request.profile,context:request.context,carrier:request.carrier,interpretation:result.mapping.interpretation,nativePath:result.mapping.nativePath};result.target=target;}
 result.diagnostics=result.residuals.map(r=>({code:r.path===idealPath?'TABLESPEC_NULLABILITY_CONFLICT':'TABLESPEC_NULLABILITY_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('TABLESPEC_NULLABILITY_RESULT',JSON.stringify(check.errors));return copied as unknown as TableSpecNullabilityClassification;
}
/** Receipt consistency is not authentication; any model edit requires reclassification. */
export function verifyTableSpecNullabilityClassification(input:TableSpecNullabilityClassification,current:Document):TableSpecNullabilityClassification {
 const receipt=copyJson(input) as unknown as TableSpecNullabilityClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_NULLABILITY_RECEIPT','Expected complete classified receipt');
 const expected=classifyTableSpecNullability(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_NULLABILITY_RECEIPT','Receipt disagrees with retained source and selected binding');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_NULLABILITY_STALE','Target changed after classification');
 return receipt;
}
/** Recover exact original text or split files, including unclaimed native content. */
export function recoverTableSpecNullabilitySource(input:TableSpecNullabilityClassification,current:Document):string|Record<string,string>{
 const receipt=verifyTableSpecNullabilityClassification(input,current);return nativeArchive(receipt.source);
}
