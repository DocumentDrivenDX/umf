import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {sqlServerIdentifier as identifier,sqlServerLiteral as literal} from './sqlserver-syntax';
const nativeCarriers={bit:'boolean',tinyint:'integer',smallint:'integer',int:'integer',bigint:'integer',decimal:'decimal',real:'float','float(53)':'float',nvarchar:'string',nchar:'string',varchar:'string',char:'string',varbinary:'binary',binary:'binary',date:'date','time(7)':'time','datetime2(7)':'timestamp','datetimeoffset(7)':'timestamp'} as const;
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import facetAuthor from '../../spec/core/facet-operation.schema.json';import kindAuthor from '../../spec/core/kind-operation-v4.schema.json';
import schema from '../../spec/core/facets-sqlserver-projection.schema.json';
export {default as facetsSqlServerProjectionSchema} from '../../spec/core/facets-sqlserver-projection.schema.json';
export interface FacetsSqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof nativeCarriers;mode:'strict'|'report';encoding:'checked'|'type-modifier'|'carrier-only';obligation:'value-domain'|'exact-input'}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsSqlServerProjection {
 operation:'project-facets-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsSqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/sql';facets:CoreFacetPatch;encoding:FacetsSqlServerRequest['encoding'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,facetAuthor,kindAuthor])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Project verified author intent. Native carrier defaults never become author assertions. */
export function projectFacetsToSqlServer(input:Author,options:FacetsSqlServerRequest):FacetsSqlServerProjection {
 const copied=copyJson(input) as unknown as Author,request=copyJson(options) as unknown as FacetsSqlServerRequest;
 if(!checkRequest(request))throw new UmfError('FACETS_SQLSERVER_REQUEST',JSON.stringify(checkRequest.errors));
 const author=copied?.operation==='declare-core-facets'?verifyCoreFacetDeclaration(copied,copied.target):verifyCoreKindDeclaration(copied as CoreKindDeclaration,copied?.target);
 const source=copyJson(author.target) as unknown as Document;
 if(source.umf!=='0.5.0')throw new UmfError('FACETS_SQLSERVER_VERSION','Explicit core 0.5.0 declaration required');
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 if(element.kind!=='field')throw new UmfError('FACETS_SQLSERVER_FIELD','Selected author must identify a Field');
 const result:FacetsSqlServerProjection={operation:'project-facets-sqlserver',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/facets',nativePath:'/sql',facets:{},encoding:request.encoding,outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(at:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown')=>result.residuals.push({path:at,value:copyJson(value),reason,outcome,recovery});
 // Closed scope: unchanged identifiers are receipt bookkeeping, all other omitted semantics are disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata remains in the receipt and is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  for(const [key,value] of Object.entries(m))if(!['id','elements'].includes(key)&&!(key==='namespace'&&(value===''||value===request.namespace)))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','facets'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained without implying composition with other concept bindings');
 if(element.name!==undefined&&element.name!==request.columnName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 let intended:CoreFacetPatch={};
 if(author.operation==='declare-core-facets'){
  const meaning=inspectCoreFacets(source,author.identity).meaning;
  if(meaning.state==='known'||meaning.state==='partial'){
   intended=meaning.interpreted;
   if(meaning.state==='partial')loss(path+'/facets',meaning.facets,'Unknown facet qualifiers remain attached; no native interpretation is fabricated');
  }
 }else if(element.facets!==undefined)loss(path+'/facets',element.facets,'A Field-kind declaration does not establish authorship of facet members');
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName),columnName=identifier(request.columnName);
 const family=nativeCarriers[request.nativeType],checks:string[]=[];
 const checked=request.encoding==='checked',modifier=request.encoding==='type-modifier';
 const stringCarrier=['nvarchar','nchar','varchar','char'].includes(request.nativeType),binaryCarrier=['varbinary','binary'].includes(request.nativeType);
 const variable=['nvarchar','varchar','varbinary'].includes(request.nativeType);
 let typeSql:string=request.nativeType==='decimal'?'decimal(38,9)':stringCarrier||binaryCarrier?request.nativeType+(variable?'(max)':'(1)'):request.nativeType;
 const scalarShape=(element.cardinality===undefined||element.cardinality==='one'||element.cardinality==='unspecified')&&element.itemType===undefined&&!element.references?.some(r=>r.role==='record-type');
 if(!scalarShape)loss(path,element,'Scalar carrier cannot project container or record-valued Field facets','not-expressible');
 if(intended.length){
  const f=intended.length;let expressed=false;
  if(scalarShape&&f.max<=2147483647){
   if(binaryCarrier&&f.unit==='byte'){
    if(checked&&variable){checks.push(`DATALENGTH(${columnName}) <= ${f.max}`);expressed=true;}
    else if(modifier&&f.max>0&&f.max<=8000){typeSql=`${request.nativeType}(${f.max})`;expressed=true;}
   }else if(stringCarrier&&f.unit==='unicode-scalar'){
    if(checked&&variable){
     // MAX avoids bounded concatenation truncation. SC counts supplementary pairs;
     // a separate residual retains malformed Unicode and code-page restrictions.
     checks.push(f.max===0?`DATALENGTH(${columnName}) = 0`:`LEN(${columnName}+N'x')-1 <= ${f.max}`);expressed=true;
    }else if(modifier&&f.max>0&&f.max<=(request.nativeType.startsWith('n')?4000:8000)){
     typeSql=`${request.nativeType}(${f.max})`;expressed=true;
     loss(path+'/facets/length',f,'Native type size counts UTF-16 units or code-page bytes, not Unicode scalars; supplementary values can be excluded','approximated');
    }
   }
  }
  if(expressed)result.mapping.facets.length=f;
  else loss(path+'/facets/length',f,'Selected carrier/encoding cannot honor the length; checked MAX carriers are bounded to 2147483647 and native modifiers require positive bounded sizes','not-expressible');
 }
 if(intended.integerWidth){
  const f=intended.integerWidth;let expressed=false;
  if(scalarShape&&f.bits<=127){
   const min=f.signed?-(1n<<BigInt(f.bits-1)):0n,max=(1n<<BigInt(f.bits-(f.signed?1:0)))-1n;
   const widths:Record<string,number>={tinyint:8,smallint:16,int:32,bigint:64},bits=widths[request.nativeType];
   const nativeMin=bits===undefined?undefined:request.nativeType==='tinyint'?0n:-(1n<<BigInt(bits-1));
   const nativeMax=bits===undefined?undefined:(1n<<BigInt(request.nativeType==='tinyint'?bits:bits-1))-1n;
   if(nativeMin!==undefined&&nativeMax!==undefined&&min>=nativeMin&&max<=nativeMax){
    if(min===nativeMin&&max===nativeMax)expressed=true;
    else if(checked){checks.push(`${columnName} >= ${min}`,`${columnName} <= ${max}`);expressed=true;}
   }else if(checked&&request.nativeType==='decimal'&&min>-(10n**38n)&&max<10n**38n){
    typeSql='decimal(38,0)';checks.push(`${columnName} >= ${min}`,`${columnName} <= ${max}`);expressed=true;
   }
  }
  if(expressed)result.mapping.facets.integerWidth=f;
  else loss(path+'/facets/integerWidth',f,'Selected carrier cannot contain/enforce this integer domain; checked decimal width is bounded by the 38-digit coefficient domain','not-expressible');
 }
 if(intended.precision!==undefined){
  const precision=intended.precision,scale=intended.scale!;
  if(scalarShape&&request.nativeType==='decimal'&&precision<=38&&(checked||modifier)){
   typeSql=`decimal(${precision},${scale})`;
   if(checked)checks.push(`${columnName} = ROUND(${columnName},${scale},1)`);
   result.mapping.facets.precision=precision;result.mapping.facets.scale=scale;
  }else loss(path+'/facets',{precision,scale},'Native decimal precision/scale requires a checked or type-modifier decimal carrier with precision at most 38','not-expressible');
 }
 if(stringCarrier){
  typeSql+=' COLLATE Latin1_General_100_CI_AS_SC';
  if(intended.length?.max!==0||result.mapping.facets.length===undefined)loss(path,element,request.nativeType.startsWith('n')?'UTF-16 storage admits isolated surrogates; LEN with a sentinel is not Unicode validity enforcement':'The selected legacy code page cannot represent the full Unicode scalar domain','not-expressible');
 }
 if(['char','nchar','binary'].includes(request.nativeType))loss(path,element,'Fixed native storage pads values; a maximum length facet does not imply padding','not-expressible');
 if(request.obligation==='exact-input'){
  const rounding=request.nativeType==='real'||request.nativeType==='decimal'||stringCarrier||binaryCarrier;
  loss(path,element,request.nativeType==='real'?'Binary64 1.0000000000000002 narrows to binary32 1.0':request.nativeType==='decimal'?'Decimal conversion can round before CHECK evaluation; runtime settings can instead produce errors or NULL':rounding?'Native conversion can truncate, substitute or pad before CHECK evaluation':'Catalog carrier and facet enforcement do not prove exact conversion of arbitrary SQL input expressions',rounding?'approximated':'unknown');
 }
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Native carrier belongs to a different scalar family; the checked representation does not authorize implicit value conversion','not-expressible');
 let comment='';
 if(element.description!==undefined){
  try{
   const description=literal(element.description);
   if(element.description.length>3750)loss(path+'/description',element.description,'Description exceeds bounded extended-property size','not-expressible');
   else comment=`EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=${description}, @level0type=N'SCHEMA', @level0name=${literal(request.namespace)}, @level1type=N'TABLE', @level1name=${literal(request.tableName)}, @level2type=N'COLUMN', @level2name=${literal(request.columnName)};\n`;
  }catch(error){if(!(error instanceof UmfError))throw error;loss(path+'/description',element.description,'Native comments cannot preserve NUL or unpaired Unicode surrogates','not-expressible');}
 }
 // Availability is not inferred from facets or session defaults.
 const text=`CREATE TABLE ${namespace}.${tableName} (${columnName} ${typeSql} NULL${checks.length?' CHECK ('+checks.join(' AND ')+')':''});\n`+comment;
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target={format:'sqlserver-ddl',sql:text};result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'FACETS_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FACETS_SQLSERVER_RESULT',JSON.stringify(check.errors));return output as unknown as FacetsSqlServerProjection;
}
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export function recoverFacetsFromSqlServer(input:FacetsSqlServerProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as FacetsSqlServerProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FACETS_SQLSERVER_RECEIPT','Expected projected receipt');
 const expected=projectFacetsToSqlServer(receipt.author,receipt.request);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FACETS_SQLSERVER_RECEIPT','Receipt disagrees with retained author and request');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==receipt.target.sql)throw new UmfError('FACETS_SQLSERVER_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
