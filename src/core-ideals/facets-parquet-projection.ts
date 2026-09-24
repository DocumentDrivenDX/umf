import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {parquetFacetFile,type ParquetFacetCarrier} from './parquet-facet-carrier';
import {importParquetSchema,getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {exportParquetCapture} from '../adapters/parquet';
import {inspectParquetFacetType} from '../adapters/parquet/facet-type';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import facetAuthor from '../../spec/core/facet-operation.schema.json';import kindAuthor from '../../spec/core/kind-operation-v4.schema.json';
import schema from '../../spec/core/facets-parquet-projection.schema.json';
export {default as facetsParquetProjectionSchema} from '../../spec/core/facets-parquet-projection.schema.json';
export interface FacetsParquetRequest {id:string;recordName:string;fieldName:string;nullable:boolean;fieldId?:number;carrier:ParquetFacetCarrier;mode:'strict'|'report';encoding:'native-type'|'metadata-only'|'carrier-only';profile:'declared-schema'|'pyarrow-21';obligation:'value-domain'|'exact-input';}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsParquetProjection {
 operation:'project-facets-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsParquetRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativeIndex:1;facets:CoreFacetPatch;encoding:FacetsParquetRequest['encoding'];profile:FacetsParquetRequest['profile'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,facetAuthor,kindAuthor])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Project verified ideal assertions; custom metadata never becomes an implicit validator. */
export function projectFacetsToParquet(input:Author,options:FacetsParquetRequest):FacetsParquetProjection {
 const copied=copyJson(input) as unknown as Author,request=copyJson(options) as unknown as FacetsParquetRequest;
 if(!checkRequest(request))throw new UmfError('FACETS_PARQUET_REQUEST',JSON.stringify(checkRequest.errors));
 const author=copied?.operation==='declare-core-facets'?verifyCoreFacetDeclaration(copied,copied.target):verifyCoreKindDeclaration(copied as CoreKindDeclaration,copied?.target);
 const source=copyJson(author.target) as unknown as Document;
 if(source.umf!=='0.5.0')throw new UmfError('FACETS_PARQUET_VERSION','Explicit core 0.5.0 declaration required');
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 if(element.kind!=='field')throw new UmfError('FACETS_PARQUET_FIELD','Selected author must identify a Field');
 const result:FacetsParquetProjection={operation:'project-facets-parquet',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/facets',nativeIndex:1,facets:{},encoding:request.encoding,profile:request.profile,outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(at:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown')=>result.residuals.push({path:at,value:copyJson(value),reason,outcome,recovery});
 let fatal=false;const block=(at:string,value:unknown,reason:string)=>{fatal=true;loss(at,value,reason,'not-expressible');};
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata remains in the receipt and is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  for(const [key,value] of Object.entries(m))if(!['id','elements'].includes(key)&&!(key==='namespace'&&value===''))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','scalarType','facets'].includes(key)&&!(key==='cardinality'&&value==='one')&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained; availability/default execution is not inferred from facets');
 if(element.name!==undefined&&element.name!==request.fieldName)loss(path+'/name',element.name,'Explicit native field name differs from ideal name','not-expressible');
 if(element.itemType!==undefined||element.cardinality==='array'||element.cardinality==='map'||element.references?.some(r=>r.role==='record-type'))block(path,element,'A scalar projection cannot flatten a container or record-valued Field');
 let intended:CoreFacetPatch={};
 if(author.operation==='declare-core-facets'){
  const meaning=inspectCoreFacets(source,author.identity).meaning;
  if(meaning.state==='known'||meaning.state==='partial'){intended=meaning.interpreted;if(meaning.state==='partial')loss(path+'/facets',meaning.facets,'Unknown facet qualifiers remain attached; no native interpretation is fabricated');}
 }else if(element.facets!==undefined)loss(path+'/facets',element.facets,'A Field-kind receipt does not establish authorship of facet members');
 let target:Document|undefined;
 try{
  const metadata=request.encoding==='metadata-only'&&element.facets!==undefined&&author.operation==='declare-core-facets'?{'umf.facets':JSON.stringify(element.facets)}:undefined;
  target=importParquetSchema(parquetFacetFile({recordName:request.recordName,fieldName:request.fieldName,nullable:request.nullable,carrier:request.carrier,...(request.fieldId!==undefined?{fieldId:request.fieldId}:{}),...(metadata?{metadata}:{})}),{id:request.id});
 }catch(error){if(!(error instanceof UmfError))throw error;block('/request/carrier',request.carrier,'Invalid native carrier or unsupported representation: '+error.message);}
 if(target){
  const field=getParquetFieldMetadata(target).fields[0]!,native=inspectParquetFacetType(field.nativeField).meaning;
  if(intended.integerWidth){
   const f=intended.integerWidth;
   if(native?.family==='integer'&&native.bits===f.bits&&native.signed===f.signed)result.mapping.facets.integerWidth=f;
   else loss(path+'/facets/integerWidth',f,'Explicit Parquet carrier does not declare the authored integer domain','not-expressible');
  }
  if(intended.precision!==undefined){
   if(native?.family==='decimal'&&native.precision===intended.precision&&native.scale===intended.scale){result.mapping.facets.precision=intended.precision;result.mapping.facets.scale=intended.scale;}
   else loss(path+'/facets',intended,'Explicit Parquet carrier does not declare the authored decimal pair','not-expressible');
  }
  if(intended.length){
   const f=intended.length;
   if(native?.family==='binary'&&native.exactBytes!==null&&f.unit==='byte'&&native.exactBytes===f.max)result.mapping.facets.length=f;
   else loss(path+'/facets/length',f,'Parquet variable string/binary metadata does not enforce a maximum bound; fixed count must match explicitly','not-expressible');
  }
  if(native?.family==='binary'&&native.exactBytes!==null)loss(path+'/facets/length',intended.length??null,'Exact fixed length rejects shorter values permitted by a maximum bound; no padding or truncation is implied','not-expressible');
  if(request.profile==='pyarrow-21'&&native?.family==='decimal'&&native.precision>76)loss('/request/carrier',request.carrier,'PyArrow 21.0.0 cannot represent decimal precision above 76 although Parquet BYTE_ARRAY declarations allow it','not-expressible');
  if(request.obligation==='exact-input')loss(path,element,native?.family==='float'&&native.bits===32?'Binary64 1.0000000000000002 narrows to binary32 1.0':native?.family==='integer'?'PyArrow safe array construction truncates fractional input 1.5 to integer 1':'Schema domains do not prove exact conversion of arbitrary host inputs',native?.family==='integer'||native?.family==='float'&&native.bits===32?'approximated':'unknown');
  if(element.scalarType!==undefined&&element.scalarType!==field.element.scalarType)loss(path+'/scalarType',element.scalarType,'Explicit native carrier belongs to a different scalar family; no value conversion is inferred','not-expressible');
 }
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(fatal||request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target!;
 result.diagnostics=result.residuals.map(r=>({code:'FACETS_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FACETS_PARQUET_RESULT',JSON.stringify(check.errors));return output as unknown as FacetsParquetProjection;
}
/** Recompute the complete author projection and compare exact emitted bytes. */
export function recoverFacetsFromParquet(input:FacetsParquetProjection,nativeBytes:Uint8Array):Document {
 const receipt=copyJson(input) as unknown as FacetsParquetProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FACETS_PARQUET_RECEIPT','Expected projected receipt');
 if(canonical(copyJson(receipt))!==canonical(copyJson(projectFacetsToParquet(receipt.author,receipt.request))))throw new UmfError('FACETS_PARQUET_RECEIPT','Receipt differs from retained author and request');
 const bytes=exportParquetCapture(receipt.target);
 if(!(nativeBytes instanceof Uint8Array)||bytes.length!==nativeBytes.length||bytes.some((b,i)=>b!==nativeBytes[i]))throw new UmfError('FACETS_PARQUET_STALE','Native target bytes changed');
 return copyJson(receipt.source) as unknown as Document;
}
