import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {avroCarriers} from './avro-carriers';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import facetAuthor from '../../spec/core/facet-operation.schema.json';import kindAuthor from '../../spec/core/kind-operation-v4.schema.json';
import schema from '../../spec/core/facets-avro-projection.schema.json';
export {default as facetsAvroProjectionSchema} from '../../spec/core/facets-avro-projection.schema.json';
const families={boolean:'boolean',int:'integer',long:'integer',float:'float',double:'float',bytes:'binary',string:'string',fixed:'binary','decimal-bytes':'decimal','decimal-fixed':'decimal',date:'date','time-millis':'time','time-micros':'time','timestamp-millis':'timestamp','timestamp-micros':'timestamp','local-timestamp-micros':'timestamp'} as const;
export interface FacetsAvroRequest {id:string;recordName:string;namespace:string;fieldName:string;nativeType:keyof typeof families;fixedName?:string;fixedSize?:number;mode:'strict'|'report';encoding:'native-type'|'metadata-only'|'carrier-only';profile:'declared-schema'|'apache-datum-writer'|'fastavro-schemaless-writer';obligation:'value-domain'|'exact-input';}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsAvroProjection {
 operation:'project-facets-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsAvroRequest;target?:{format:'avro-schema-json';schema:string};nativeSchema?:string;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/fields/0/type';facets:CoreFacetPatch;encoding:FacetsAvroRequest['encoding'];profile:FacetsAvroRequest['profile'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,facetAuthor,kindAuthor])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Project verified ideal assertions; custom metadata never becomes an implicit validator. */
export function projectFacetsToAvro(input:Author,options:FacetsAvroRequest):FacetsAvroProjection {
 const copied=copyJson(input) as unknown as Author,request=copyJson(options) as unknown as FacetsAvroRequest;
 if(!checkRequest(request))throw new UmfError('FACETS_AVRO_REQUEST',JSON.stringify(checkRequest.errors));
 const author=copied?.operation==='declare-core-facets'?verifyCoreFacetDeclaration(copied,copied.target):verifyCoreKindDeclaration(copied as CoreKindDeclaration,copied?.target);
 const source=copyJson(author.target) as unknown as Document;
 if(source.umf!=='0.5.0')throw new UmfError('FACETS_AVRO_VERSION','Explicit core 0.5.0 declaration required');
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 if(element.kind!=='field')throw new UmfError('FACETS_AVRO_FIELD','Selected author must identify a Field');
 const result:FacetsAvroProjection={operation:'project-facets-avro',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/facets',nativePath:'/fields/0/type',facets:{},encoding:request.encoding,profile:request.profile,outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(at:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown')=>result.residuals.push({path:at,value:copyJson(value),reason,outcome,recovery});
 let fatal=false;const block=(at:string,value:unknown,reason:string)=>{fatal=true;loss(at,value,reason,'not-expressible');};
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata remains in the receipt and is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  for(const [key,value] of Object.entries(m))if(!['id','elements'].includes(key)&&!(key==='namespace'&&(value===''||value===request.namespace)))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','facets'].includes(key)&&!(key==='cardinality'&&value==='one')&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained; availability/default execution is not inferred from facets');
 if(element.name!==undefined&&element.name!==request.fieldName)loss(path+'/name',element.name,'Explicit native field name differs from ideal name','not-expressible');
 if(element.itemType!==undefined||element.cardinality==='array'||element.cardinality==='map'||element.references?.some(r=>r.role==='record-type'))block(path,element,'A scalar projection cannot flatten a container or record-valued Field');
 let intended:CoreFacetPatch={};
 if(author.operation==='declare-core-facets'){
  const meaning=inspectCoreFacets(source,author.identity).meaning;
  if(meaning.state==='known'||meaning.state==='partial'){intended=meaning.interpreted;if(meaning.state==='partial')loss(path+'/facets',meaning.facets,'Unknown facet qualifiers remain attached; no native interpretation is fabricated');}
 }else if(element.facets!==undefined)loss(path+'/facets',element.facets,'A Field-kind receipt does not establish authorship of facet members');
 const fixed=request.nativeType==='fixed'||request.nativeType==='decimal-fixed',decimal=request.nativeType==='decimal-bytes'||request.nativeType==='decimal-fixed';
 if(fixed&&(request.fixedSize!>4096||request.fixedName===request.recordName))block('/request',request,'Fixed carrier exceeds the 4096-byte execution profile or collides with the record name');
 let carrier:Json;
 if(fixed)carrier={type:'fixed',name:request.fixedName!,size:request.fixedSize!};
 else if(decimal)carrier={type:'bytes'};
 else carrier=copyJson(avroCarriers[request.nativeType as keyof typeof avroCarriers]);
 let precision=38,scale=9;
 if(decimal){
  if(fixed){
   if(request.fixedSize===0)block('/request/fixedSize',0,'Zero-byte fixed cannot carry positive decimal precision');
   else if(request.fixedSize!<=4096){const capacity=((1n<<BigInt(8*request.fixedSize!-1))-1n).toString().length-1;precision=Math.min(precision,capacity);scale=Math.min(scale,precision);}
  }
  if(request.encoding==='native-type'&&intended.precision!==undefined){precision=intended.precision;scale=intended.scale!;}
  if(precision>4096)block(path+'/facets',intended,'Decimal precision exceeds the 4096-digit execution profile; no smaller decimal is substituted');
  if(fixed&&request.fixedSize!>0&&request.fixedSize!<=4096&&precision>((1n<<BigInt(8*request.fixedSize!-1))-1n).toString().length-1)block(path+'/facets',intended,'Decimal precision exceeds signed fixed-byte capacity');
  carrier={...(carrier as Record<string,Json>),logicalType:'decimal',precision,scale};
 }
 if(intended.integerWidth){
  const f=intended.integerWidth,bits=request.nativeType==='int'?32:request.nativeType==='long'?64:undefined;
  if(bits!==undefined&&f.signed&&f.bits===bits)result.mapping.facets.integerWidth=f;
  else loss(path+'/facets/integerWidth',f,'Avro primitive carriers cannot enforce this narrower, unsigned or out-of-range integer domain','not-expressible');
 }
 if(intended.precision!==undefined){
  if(decimal&&precision===intended.precision&&scale===intended.scale){result.mapping.facets.precision=precision;result.mapping.facets.scale=scale;}
  else loss(path+'/facets',intended,'Selected carrier/encoding does not declare the authored decimal pair','not-expressible');
 }
 if(intended.length){
  const f=intended.length;
  if(request.nativeType==='fixed'&&f.unit==='byte'&&request.fixedSize===f.max)result.mapping.facets.length=f;
  else loss(path+'/facets/length',f,'Variable Avro string/bytes carriers have no builtin maximum bound; a selected fixed count must match explicitly','not-expressible');
 }
 if(request.nativeType==='fixed'&&request.fixedSize!==0)loss(path+'/facets/length',intended.length??null,'Exact fixed length rejects shorter values allowed by a maximum bound; no padding or truncation is implied','not-expressible');
 if(request.encoding==='metadata-only'&&element.facets!==undefined&&author.operation==='declare-core-facets')carrier={...(typeof carrier==='string'?{type:carrier}:carrier as Record<string,Json>),umfFacets:copyJson(element.facets)};
 if(request.profile!=='declared-schema'){
  if(decimal)loss(path+'/facets',intended,request.profile==='apache-datum-writer'?'Apache Decimal validation/writing does not establish coefficient bounds or exact scale conversion':'Physical bytes/fixed inputs can bypass fastavro Decimal precision checks','unknown');
  if(request.nativeType==='int'&&request.profile==='fastavro-schemaless-writer')loss(path,element,'Pinned fastavro accepts int 2147483648 outside the declared signed-32 domain','approximated');
 }
 if(request.obligation==='exact-input')loss(path,element,request.nativeType==='float'?'Binary64 1.0000000000000002 narrows to binary32 1.0':decimal?'Decimal rescaling/rounding and physical-byte bypass prevent a general exact-input guarantee':'Schema domains do not prove exact conversion of arbitrary host inputs',request.nativeType==='float'||decimal?'approximated':'unknown');
 if(element.scalarType!==undefined&&element.scalarType!==families[request.nativeType])loss(path+'/scalarType',element.scalarType,'Explicit native carrier belongs to a different scalar family; no value conversion is inferred','not-expressible');
 const text=JSON.stringify({type:'record',name:request.recordName,namespace:request.namespace,fields:[{name:request.fieldName,type:carrier,...(element.description!==undefined?{doc:element.description}:{})}]})+'\n';
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(fatal||request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target={format:'avro-schema-json',schema:text};result.nativeSchema=text;}
 result.diagnostics=result.residuals.map(r=>({code:'FACETS_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FACETS_AVRO_RESULT',JSON.stringify(check.errors));return output as unknown as FacetsAvroProjection;
}
/** Recompute the complete author projection and compare exact emitted text. */
export function recoverFacetsFromAvro(input:FacetsAvroProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as FacetsAvroProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FACETS_AVRO_RECEIPT','Expected projected receipt');
 if(canonical(copyJson(receipt))!==canonical(copyJson(projectFacetsToAvro(receipt.author,receipt.request))))throw new UmfError('FACETS_AVRO_RECEIPT','Receipt differs from retained author and request');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSchema||nativeText!==receipt.target.schema)throw new UmfError('FACETS_AVRO_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
