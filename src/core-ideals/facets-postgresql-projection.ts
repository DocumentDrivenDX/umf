import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {importPostgresqlSql,getPostgresqlSource,type PostgresqlBackend} from '../adapters/postgresql';
import {carriers,identifier,literal} from './postgresql-syntax';
const nativeCarriers={...carriers,varchar:['varchar','string'],char:['bpchar','string']} as const;
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import facetAuthor from '../../spec/core/facet-operation.schema.json';import kindAuthor from '../../spec/core/kind-operation-v4.schema.json';
import schema from '../../spec/core/facets-postgresql-projection.schema.json';
export {default as facetsPostgresqlProjectionSchema} from '../../spec/core/facets-postgresql-projection.schema.json';
export interface FacetsPostgresqlRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof nativeCarriers;mode:'strict'|'report';encoding:'checked'|'type-modifier'|'carrier-only';obligation:'value-domain'|'exact-input'}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsPostgresqlProjection {
 operation:'project-facets-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsPostgresqlRequest;target?:Document;nativeSql?:string;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef';facets:CoreFacetPatch;encoding:FacetsPostgresqlRequest['encoding'];outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,facetAuthor,kindAuthor])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Project verified author intent. Native carrier defaults never become author assertions. */
export async function projectFacetsToPostgresql(input:Author,options:FacetsPostgresqlRequest,backend:PostgresqlBackend):Promise<FacetsPostgresqlProjection> {
 const copied=copyJson(input) as unknown as Author,request=copyJson(options) as unknown as FacetsPostgresqlRequest;
 if(!checkRequest(request))throw new UmfError('FACETS_POSTGRESQL_REQUEST',JSON.stringify(checkRequest.errors));
 const author=copied?.operation==='declare-core-facets'?verifyCoreFacetDeclaration(copied,copied.target):verifyCoreKindDeclaration(copied as CoreKindDeclaration,copied?.target);
 const source=copyJson(author.target) as unknown as Document;
 if(source.umf!=='0.5.0')throw new UmfError('FACETS_POSTGRESQL_VERSION','Explicit core 0.5.0 declaration required');
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 if(element.kind!=='field')throw new UmfError('FACETS_POSTGRESQL_FIELD','Selected author must identify a Field');
 const result:FacetsPostgresqlProjection={operation:'project-facets-postgresql',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/facets',nativePath:'/stmts/0/stmt/CreateStmt/tableElts/0/ColumnDef',facets:{},encoding:request.encoding,outcome:'exact'},residuals:[],diagnostics:[]};
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
 const [nativeName,family]=nativeCarriers[request.nativeType],checks:string[]=[];
 let typeSql='pg_catalog.'+nativeName;
 const scalarShape=(element.cardinality===undefined||element.cardinality==='one'||element.cardinality==='unspecified')&&element.itemType===undefined&&!element.references?.some(r=>r.role==='record-type');
 if(!scalarShape)loss(path,element,'Scalar carrier cannot project container or record-valued Field facets','not-expressible');
 const checked=request.encoding==='checked',modifier=request.encoding==='type-modifier';
 const stringCarrier=['text','varchar','char'].includes(request.nativeType);
 if(intended.length){
  const f=intended.length;let expressed=false;
  // Binding resource/qualification ceiling, not a claim about the engine maximum.
  if(scalarShape&&f.max<=10485760){
   if(checked&&(stringCarrier&&f.unit==='unicode-scalar'||request.nativeType==='bytea'&&f.unit==='byte')){
    checks.push(`pg_catalog.${f.unit==='byte'?'octet_length':'char_length'}(${columnName}) OPERATOR(pg_catalog.<=) ${f.max}`);expressed=true;
   }else if(modifier&&['varchar','char'].includes(request.nativeType)&&f.unit==='unicode-scalar'&&f.max>0){typeSql+=`(${f.max})`;expressed=true;}
  }
  if(expressed)result.mapping.facets.length=f;
  else loss(path+'/facets/length',f,'Selected carrier/encoding does not honor this unit or bound; the qualified length ceiling is 10485760, and native character modifiers cannot express zero','not-expressible');
 }
 if(intended.integerWidth){
  const f=intended.integerWidth;let expressed=false;
  const bits:Record<string,number>={smallint:16,integer:32,bigint:64},carrierBits=bits[request.nativeType];
  if(scalarShape&&f.bits<=1024){
   const fits=carrierBits!==undefined&&f.bits<=(f.signed?carrierBits:carrierBits-1);
   if(fits&&f.signed&&f.bits===carrierBits){expressed=true;}
   else if(checked&&(fits||request.nativeType==='numeric')){
    const min=f.signed?-(1n<<BigInt(f.bits-1)):0n,max=(1n<<BigInt(f.bits-(f.signed?1:0)))-1n;
    checks.push(`${columnName} OPERATOR(pg_catalog.>=) ${min}`,`${columnName} OPERATOR(pg_catalog.<=) ${max}`);
    if(request.nativeType==='numeric')checks.push(`${columnName} OPERATOR(pg_catalog.=) pg_catalog.trunc(${columnName}, 0)`);
    expressed=true;
   }
  }
  if(expressed)result.mapping.facets.integerWidth=f;
  else loss(path+'/facets/integerWidth',f,'Selected native carrier does not honor the width; checked numeric integer encodings are bounded to 1024 bits','not-expressible');
 }
 if(intended.precision!==undefined){
  const precision=intended.precision,scale=intended.scale!;let expressed=false;
  if(scalarShape&&request.nativeType==='numeric'&&precision<=1000&&(checked||modifier)){
   const whole=precision-scale,max=(whole?'9'.repeat(whole):'0')+(scale?'.'+'9'.repeat(scale):'');
   if(modifier)typeSql+=`(${precision},${scale})`;
   checks.push(`${columnName} OPERATOR(pg_catalog.>=) '-${max}'::pg_catalog.numeric`,`${columnName} OPERATOR(pg_catalog.<=) '${max}'::pg_catalog.numeric`);
   if(checked)checks.push(`${columnName} OPERATOR(pg_catalog.=) pg_catalog.trunc(${columnName}, ${scale})`);
   expressed=true;
  }
  if(expressed){result.mapping.facets.precision=precision;result.mapping.facets.scale=scale;}
  else loss(path+'/facets',{precision,scale},'Finite decimal facets require a checked or finite-checked modifier numeric carrier with precision at most 1000','not-expressible');
 }
 if(stringCarrier){
  if(intended.length?.max!==0||result.mapping.facets.length===undefined)loss(path,element,'PostgreSQL character types cannot represent NUL; this restriction is not implied by a Unicode-scalar bound','not-expressible');
  if(request.nativeType==='char')loss(path,element,'Native blank padding and trailing-space semantics differ from the ideal string','not-expressible');
 }
 if(request.obligation==='exact-input'){
  const narrowing=request.nativeType==='real'||request.nativeType==='char'||typeSql.includes('(')&&['numeric','varchar'].includes(request.nativeType);
  loss(path,element,narrowing?(request.nativeType==='real'?'Binary64 1.0000000000000002 narrows to binary32 1.0':'Native type conversion can round, truncate or pad before CHECK evaluation'):'Facet enforcement does not establish exact conversion of arbitrary SQL input expressions',narrowing?'approximated':'unknown');
 }
 if(element.scalarType!==undefined&&element.scalarType!==family)loss(path+'/scalarType',element.scalarType,'Native carrier belongs to a different scalar family; the checked representation does not authorize implicit value conversion','not-expressible');
 let comment='';
 if(element.description!==undefined){try{comment=`COMMENT ON COLUMN ${namespace}.${tableName}.${columnName} IS ${literal(element.description)};\n`;}catch(error){if(!(error instanceof UmfError))throw error;loss(path+'/description',element.description,'Native comments cannot preserve NUL or unpaired Unicode surrogates','not-expressible');}}
 const text=`CREATE TABLE ${namespace}.${tableName} (${columnName} ${typeSql}${checks.length?' CHECK ('+checks.join(' AND ')+')':''});\n`+comment;
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else {result.target=await importPostgresqlSql(text,backend,{id:request.id});result.nativeSql=text;}
 result.diagnostics=result.residuals.map(r=>({code:'FACETS_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FACETS_POSTGRESQL_RESULT',JSON.stringify(check.errors));return output as unknown as FacetsPostgresqlProjection;
}
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export async function recoverFacetsFromPostgresql(input:FacetsPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document> {
 const receipt=copyJson(input) as unknown as FacetsPostgresqlProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FACETS_POSTGRESQL_RECEIPT','Expected projected receipt');
 const expected=await projectFacetsToPostgresql(receipt.author,receipt.request,backend);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FACETS_POSTGRESQL_RECEIPT','Receipt disagrees with retained author and request');
 if(typeof nativeText!=='string'||nativeText!==receipt.nativeSql||nativeText!==getPostgresqlSource(receipt.target))throw new UmfError('FACETS_POSTGRESQL_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
