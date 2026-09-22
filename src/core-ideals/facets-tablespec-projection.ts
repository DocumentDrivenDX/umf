import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {importTableSpec,exportTableSpec} from '../adapters/tablespec';
import {type TableSpecFacetProfile} from './facets-tablespec';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import facetAuthor from '../../spec/core/facet-operation.schema.json';import kindAuthor from '../../spec/core/kind-operation-v4.schema.json';
import schema from '../../spec/core/facets-tablespec-projection.schema.json';
export {default as facetsTableSpecProjectionSchema} from '../../spec/core/facets-tablespec-projection.schema.json';
export interface FacetsTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP';mode:'strict'|'report';profile:TableSpecFacetProfile;input:'raw'|'model-normalized';obligation:'value-domain'|'exact-input'}
type Author=CoreFacetDeclaration|CoreKindDeclaration;
type Outcome='exact'|'approximated'|'unknown'|'not-expressible';
const binding=schema.properties.binding.const;
const recovery='Recover source meaning with retained projection receipt; native-only import does not recover author intent' as const;
export interface FacetsTableSpecProjection {
 operation:'project-facets-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:Author;request:FacetsTableSpecRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/columns/0';facets:CoreFacetPatch;profile:TableSpecFacetProfile;outcome:Outcome};
 residuals:{path:string;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;recovery:typeof recovery}[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,facetAuthor,kindAuthor])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Project verified author intent. Native carrier defaults never become author assertions. */
export function projectFacetsToTableSpec(input:Author,options:FacetsTableSpecRequest):FacetsTableSpecProjection {
 const copied=copyJson(input) as unknown as Author,request=copyJson(options) as unknown as FacetsTableSpecRequest;
 if(!checkRequest(request))throw new UmfError('FACETS_TABLESPEC_REQUEST',JSON.stringify(checkRequest.errors));
 const author=copied?.operation==='declare-core-facets'?verifyCoreFacetDeclaration(copied,copied.target):verifyCoreKindDeclaration(copied as CoreKindDeclaration,copied?.target);
 const source=copyJson(author.target) as unknown as Document;
 if(source.umf!=='0.5.0')throw new UmfError('FACETS_TABLESPEC_VERSION','Explicit core 0.5.0 declaration required');
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 if(element.kind!=='field')throw new UmfError('FACETS_TABLESPEC_FIELD','Selected author must identify a Field');
 const result:FacetsTableSpecProjection={operation:'project-facets-tablespec',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/facets',nativePath:'/columns/0',facets:{},profile:request.profile,outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(at:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown')=>result.residuals.push({path:at,value:copyJson(value),reason,outcome,recovery});
 // Closed scope: unchanged identifiers are receipt bookkeeping, all other omitted semantics are disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata remains in the receipt and is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  for(const [key,value] of Object.entries(m))if(!['id','elements'].includes(key)&&!(key==='namespace'&&value===''))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
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
 const column:Record<string,Json>={name:request.columnName,data_type:request.nativeType};
 if(element.description!==undefined)column.description=copyJson(element.description);
 const native:Record<string,Json>={version:'1.0',table_name:request.tableName,columns:[column]};
 const rules:Json[]=[],profile=request.profile,normalized=request.input==='model-normalized';
 const stringCarrier=['VARCHAR','CHAR','TEXT'].includes(request.nativeType);
 const scalarShape=(element.cardinality===undefined||element.cardinality==='one'||element.cardinality==='unspecified')&&element.itemType===undefined&&!element.references?.some(r=>r.role==='record-type');
 if(!scalarShape)loss(path,element,'Scalar carrier cannot project container or record-valued Field facets','not-expressible');
 const addRule=(type:string,low:number,high:number)=>rules.push({type,kwargs:{column:request.columnName,min_value:low,max_value:high,mostly:1},meta:{stage:type==='expect_column_value_lengths_to_be_between'?'raw':'ingested',severity:'error',blocking:true,generated_from:'user'}});
 if(profile==='unresolved')loss(path+'/facets',intended,'No consumer profile selected; native metadata does not establish facet meaning');
 if(intended.length){
  const f=intended.length;let expressed=false;
  if(scalarShape&&stringCarrier&&f.unit==='unicode-scalar'){
   if(profile==='gx-suite-spark'){addRule('expect_column_value_lengths_to_be_between',0,f.max);if(f.max>0)column.length=f.max;expressed=true;}
   else if(profile==='gx-spark'&&f.max>0){column.length=f.max;expressed=true;}
   else if(profile==='json-schema'&&!normalized&&f.max>0){column.max_length=f.max;column.length=f.max;expressed=true;}
  }
  if(expressed)result.mapping.facets.length=f;
  else loss(path+'/facets/length',f,'Selected carrier/profile cannot honor this length and unit; zero baseline bounds, normalized max_length and byte encodings require another qualified representation','not-expressible');
 }
 if(intended.integerWidth){
  const f=intended.integerWidth;let expressed=false;
  if(scalarShape&&request.nativeType==='INTEGER'){
   if(profile==='gx-suite-spark'&&f.bits<=(f.signed?32:31)){
    addRule('expect_column_values_to_be_between',f.signed?-(2**(f.bits-1)):0,2**(f.bits-(f.signed?1:0))-1);expressed=true;
   }else if(['pyspark-schema','ingest-cast'].includes(profile)&&f.bits===32&&f.signed)expressed=true;
  }
  if(expressed)result.mapping.facets.integerWidth=f;
  else loss(path+'/facets/integerWidth',f,'Selected carrier/profile cannot honor this integer width; no cross-family or wider encoding is implied','not-expressible');
 }
 if(intended.precision!==undefined){
  const p=intended.precision,s=intended.scale!;let expressed=false;
  if(scalarShape&&request.nativeType==='DECIMAL'){
   if(profile==='declared-metadata'||profile==='ingest-cast'&&p<=38||profile==='pyspark-schema'&&p===10&&s===0)expressed=true;
   if(profile==='gx-suite-spark'&&p<=10&&s===0){addRule('expect_column_values_to_be_between',-(10**p-1),10**p-1);expressed=true;}
  }
  if(expressed){column.precision=p;column.scale=s;result.mapping.facets.precision=p;result.mapping.facets.scale=s;}
  else loss(path+'/facets', {precision:p,scale:s},'Selected carrier/profile cannot honor this precision and scale; native fallback defaults are not ideal assertions','not-expressible');
 }
 if(profile==='gx-suite-spark')native.expectations={expectations:rules};
 if(request.obligation==='exact-input'){
  const narrowing=['pyspark-schema','gx-suite-spark','ingest-cast'].includes(profile)&&['FLOAT','DECIMAL'].includes(request.nativeType);
  loss(path,element,narrowing?(request.nativeType==='FLOAT'?'Binary64 1.0000000000000002 narrows to binary32 1.0':'Native decimal conversion may round fractional inputs before validation'):'Selected schema/profile does not establish exact input conversion',narrowing?'approximated':'unknown');
 }
 const target=importTableSpec(JSON.stringify(native)+'\n',{id:request.id,format:'json'});
 if(element.scalarType!==undefined&&element.scalarType!==target.modules[0]!.elements[0]!.scalarType)loss(path+'/scalarType',element.scalarType,'Selected native carrier does not establish the authored scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':result.residuals.some(r=>r.outcome==='unknown')?'unknown':'approximated';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target;
 result.diagnostics=result.residuals.map(r=>({code:'FACETS_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FACETS_TABLESPEC_RESULT',JSON.stringify(check.errors));return output as unknown as FacetsTableSpecProjection;
}
/** Verify the entire operation and exact native text before recovering retained ideal meaning. */
export function recoverFacetsFromTableSpec(input:FacetsTableSpecProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as FacetsTableSpecProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FACETS_TABLESPEC_RECEIPT','Expected projected receipt');
 const expected=projectFacetsToTableSpec(receipt.author,receipt.request);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FACETS_TABLESPEC_RECEIPT','Receipt disagrees with retained author and request');
 if(typeof nativeText!=='string'||nativeText!==exportTableSpec(receipt.target))throw new UmfError('FACETS_TABLESPEC_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
