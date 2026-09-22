import {copyJson} from '../model/json';
import {readJsonValue} from '../model/serialization';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {type NativeJson} from '../model/native-json';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {exportTableSpec,exportTableSpecBundle,getTableSpecColumn,getTableSpecTable,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {inspectTableSpecFacetSuite} from './tablespec-facet-suite';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import core from '../../spec/core/facet-document.schema.json';import authorSchema from '../../spec/core/facet-operation.schema.json';import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/tablespec-facet-classification.schema.json';
import manifest from '../../spec/extensions/tablespec-facets/package.json';
export const TABLESPEC_FACETS_EXTENSION='umf.tablespec.facets';
export const tableSpecFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as tableSpecFacetClassificationSchema} from '../../spec/core/tablespec-facet-classification.schema.json';
export type TableSpecFacetProfile='declared-metadata'|'json-schema'|'pyspark-schema'|'gx-spark'|'gx-suite-spark'|'ingest-cast'|'unresolved';
export interface TableSpecFacetRequest {column:number;mode:'strict'|'report';profile:TableSpecFacetProfile;input:'raw'|'model-normalized';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface TableSpecFacetClassification {
 operation:'classify-tablespec-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:TableSpecFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
function nativeArchive(source:Document):string|Record<string,string>{const p=source.extensions?.[TABLESPEC_EXTENSION];return p&&typeof p==='object'&&!Array.isArray(p)&&Object.hasOwn(p,'splitFiles')?exportTableSpecBundle(source):exportTableSpec(source);}
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
const absent=(n:NativeJson|undefined)=>!n||n.kind==='null';
/** Exact mathematical integer check before host conversion; original lexemes stay archived. */
function count(n:NativeJson|undefined,min:number):number|undefined{
 if(n?.kind!=='number')return undefined;
 try{const value=readJsonValue(n.value,'json');return typeof value==='number'&&Number.isSafeInteger(value)&&value>=min?value:undefined;}catch(error){if(!(error instanceof UmfError))throw error;return undefined;}
}
/** Qualified interpretation, never native validation or execution. No implicit migration. */
export function classifyTableSpecFacets(input:Document,options:TableSpecFacetRequest):TableSpecFacetClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as TableSpecFacetRequest;
 if(!checkRequest(request))throw new UmfError('TABLESPEC_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.5.0'||!validateDocument(source).valid)throw new UmfError('TABLESPEC_FACET_SOURCE','Valid core 0.5.0 required; migrate explicitly');
 nativeArchive(source);const fragment=getTableSpecColumn(source,request.column);if(fragment.kind!=='object')throw new UmfError('TABLESPEC_FACET_COLUMN','Expected native column');
 const mi=source.modules.findIndex(m=>m.id==='table'),element=source.modules[mi]!.elements[request.column]!,members=fragment.members;
 const base=`/extensions/umf.tablespec/root/members/columns/items/${request.column}`,idealPath=`/modules/${mi}/elements/${request.column}/facets`;
 const result:TableSpecFacetClassification={operation:'classify-tablespec-facets',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment:fragment,facets:{},observations:[]},residuals:[],diagnostics:[]};
 const path=(key:string)=>base+'/members/'+key;
 const observe=(concept:Concept,key:string,interpretation:Observation['interpretation'],outcome:Outcome,basis:string)=>result.mapping.observations.push({concept,idealPath,nativePath:path(key),interpretation,outcome,basis});
 const loss=(key:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown',concept:Concept='native')=>{
  const at=key.startsWith('/')?key:path(key);result.residuals.push({path:at,targetPath:idealPath,value:copyJson(value),reason,outcome,binding,recovery});
  result.mapping.observations.push({concept,idealPath,nativePath:at,interpretation:outcome==='not-expressible'?'unsupported':'unknown',outcome,basis:reason});
 };
 let conflict=false;const block=(value:unknown,reason:string)=>{conflict=true;loss(idealPath,value,reason);};
 const type=members.data_type?.kind==='string'?members.data_type.value:'';
 const supported=['VARCHAR','CHAR','TEXT','DECIMAL','INTEGER','FLOAT','BOOLEAN','DATE','DATETIME','TIMESTAMP'].includes(type);
 const model=request.input==='model-normalized',profile=request.profile;
 const bounds=['length','precision','scale'] as const;
 const malformed=bounds.filter(key=>!absent(members[key])&&count(members[key],key==='scale'?0:1)===undefined);
 if(element.kind!=='field'||(element.cardinality!==undefined&&element.cardinality!=='one'&&element.cardinality!=='unspecified')||element.references?.some(r=>r.role==='record-type'))block(element,'Facet classification requires a scalar Field; containers and record-valued Fields need explicit item/value mapping');
 if(Object.hasOwn(element.extensions,TABLESPEC_FACETS_EXTENSION))block(element.extensions[TABLESPEC_FACETS_EXTENSION],'Existing facet binding cannot be overwritten; reclassify its retained source');
 if(source.vocabularies[TABLESPEC_FACETS_EXTENSION]&&source.vocabularies[TABLESPEC_FACETS_EXTENSION]!.version!=='1.0.0')block(source.vocabularies[TABLESPEC_FACETS_EXTENSION],'Existing facet vocabulary version is incompatible');
 for(const key of ['integerWidth','length_unit','precision_unit','facets','signed','unsigned','bits','width'])if(Object.hasOwn(members,key))loss(key,members[key],'Native qualifier is retained without a core interpretation; consumer behavior does not make it an authored facet');
 const family=type==='INTEGER'?'integer':type==='DECIMAL'?'decimal':['VARCHAR','CHAR','TEXT'].includes(type)?'string':undefined;
 const usable=supported&&profile!=='unresolved'&&!(model&&malformed.length>0);
 if(!supported)loss('data_type',members.data_type??null,'Native type is outside the qualified scalar subset','not-expressible');
 if(profile==='unresolved')loss('data_type',fragment,'No consumer profile selected; no facet meaning inferred');
 if(model&&malformed.length)for(const key of malformed)loss(key,members[key],'Model-normalized profile cannot infer an exact count from rejected, coerced or unsafe native metadata');
 if(usable&&profile==='gx-suite-spark'){
  const suite=inspectTableSpecFacetSuite(getTableSpecTable(source),request.column);
  Object.assign(result.mapping.facets,suite.facets);
  for(const claim of suite.claims)result.mapping.observations.push({concept:claim.concept,idealPath,nativePath:claim.path,interpretation:'inferred',outcome:'exact',basis:claim.basis});
  for(const issue of suite.issues)loss(issue.path,issue.value,issue.reason);
  if(request.obligation==='exact-input')loss('data_type',fragment,type==='FLOAT'?'Binary64 1.0000000000000002 narrows to binary32 1.0 before suite validation':type==='DECIMAL'?'The general DecimalType(10,0) carrier can round fractional input before suite validation':'Suite validation does not establish exact conversion into the native carrier',type==='FLOAT'||type==='DECIMAL'?'approximated':'unknown','conversion');
 }
 if(usable&&profile!=='gx-suite-spark'){
  const length=members.length,maxLength=members.max_length;
  const lengthSupplied=!absent(length),maxSupplied=!absent(maxLength);
  let lengthKey:'length'|'max_length'|undefined;
  if(profile==='json-schema'&&!model&&!absent(maxLength))lengthKey='max_length';
  if(profile==='gx-spark')lengthKey=!model&&!absent(maxLength)&&!(maxLength?.kind==='number'&&count(maxLength,0)===0)?'max_length':lengthSupplied?'length':undefined;
  if(lengthKey){
   const n=count(members[lengthKey],1);
   if(n===undefined)loss(lengthKey,members[lengthKey],'Selected length parameter is not an uncoerced positive safe integer; zero is ignored by native truthiness and malformed JSON bounds are not valid ideals','unknown','length');
   else if(family!=='string')loss(lengthKey,members[lengthKey],'Selected native length rule is not qualified for this scalar family','not-expressible','length');
   else{result.mapping.facets.length={max:n,unit:'unicode-scalar'};observe('length',lengthKey,'inferred','exact',profile==='json-schema'?'Generated JSON Schema maxLength counts Unicode scalars for strings; not storage enforcement':'Native-generated GX rule on Spark counts Unicode scalars in the tested string domain; not a whole ingestion guarantee');}
  }
  if(lengthSupplied&&lengthKey!=='length'){
   const n=count(length,1);if(!result.mapping.facets.length||n!==result.mapping.facets.length.max)loss('length',length,'Native length declaration has no matching interpreted bound under this consumer/input profile','not-expressible','length');
  }
  if(maxSupplied&&lengthKey!=='max_length')loss('max_length',maxLength,model?'Model normalization removes unknown max_length; original declaration stays archived':'This consumer does not establish the max_length bound','not-expressible','length');
  if(lengthKey==='max_length'&&lengthSupplied&&count(length,1)===result.mapping.facets.length?.max)observe('length','length','declared','exact','Equal retained length declaration agrees with the selected consumer bound');
  const p=members.precision,s=members.scale,hasPair=!absent(p)||!absent(s);
  if(hasPair){
   const precision=count(p,1),scale=count(s,0);
   if(family!=='decimal')loss('precision',{precision:p??null,scale:s??null},'Decimal metadata on another scalar family cannot supply a core decimal facet','not-expressible','decimal');
   else if(precision===undefined||scale===undefined||scale>precision)loss('precision',{precision:p??null,scale:s??null},'Both exact uncoerced decimal counts are required, with scale no greater than precision; native defaults and coercions are not substituted','unknown','decimal');
   else if(profile==='declared-metadata'||profile==='ingest-cast'&&precision<=38){
    result.mapping.facets.precision=precision;result.mapping.facets.scale=scale;observe('decimal','precision',profile==='declared-metadata'?'declared':'inferred','exact',profile==='declared-metadata'?'Explicit paired decimal declarations describe bounds only; native enforcement remains consumer-specific':'Explicit Spark ingest decimal output domain; casting may round and ANSI mode changes overflow behavior');
   }else loss('precision',{precision:p,scale:s},profile==='ingest-cast'?'Spark decimal capacity is limited to precision 38':'This consumer does not enforce the explicit decimal pair; generated/default types cannot replace it','not-expressible','decimal');
  }
  if(type==='INTEGER'&&(profile==='pyspark-schema'||profile==='ingest-cast')){result.mapping.facets.integerWidth={bits:32,signed:true};observe('integerWidth','data_type','inferred','exact','Explicit native INTEGER maps to signed 32-bit under the selected Spark consumer; no authored identity or arbitrary width is inferred');}
  if(request.obligation==='exact-input'){
   if(profile==='declared-metadata')loss('data_type',fragment,'Declarations alone do not establish exact input validation or conversion','unknown','conversion');
   else if(profile==='ingest-cast')loss('data_type',fragment,'Ingest expressions can coerce, round, trim or replace inputs; output facet agreement does not prove exact input conversion','approximated','conversion');
   else if(profile==='pyspark-schema'&&(type==='DECIMAL'||type==='FLOAT'))loss('data_type',fragment,type==='FLOAT'?'Binary64 1.0000000000000002 narrows to binary32 1.0':'Generated DecimalType(10,0) can round fractional values; declared facets cannot establish exactness','approximated','conversion');
   else if(profile==='gx-spark')loss('data_type',fragment,'GX length validation does not establish input conversion before validation','unknown','conversion');
  }
 }
 // Existing labels are never treated as proof of author intent. Reconcile only a verified receipt.
 if(request.author){
  try{
   const author=verifyCoreFacetDeclaration(request.author,source);
   if(author.identity.module!=='table'||author.identity.element!==element.id)block(author.identity,'Author receipt identifies a different Field');
   else{
    const meaning=inspectCoreFacets(source,author.identity).meaning;
    if(meaning.state==='known'||meaning.state==='partial'){
     for(const key of ['length','precision','scale','integerWidth'] as const){
      const declared=meaning.interpreted[key],observed=result.mapping.facets[key];
      if(declared!==undefined&&observed!==undefined&&canonical(copyJson(declared))!==canonical(copyJson(observed)))block({declared,observed},'Authored '+key+' conflicts with native interpretation; neither may be overwritten');
      else if(declared!==undefined&&observed===undefined)loss(idealPath+'/'+key,declared,'Authored bound is retained but not established by the selected native consumer','unknown');
     }
     if(meaning.state==='partial')loss(idealPath,meaning.facets,'Unknown authored facet qualifiers remain attached and cannot establish native enforcement');
    }
   }
  }catch(error){if(!(error instanceof UmfError))throw error;block(null,'Author provenance is invalid or stale: '+error.code);}
 }else if(Object.hasOwn(element,'facets'))block(element.facets,'Existing facets require verified author provenance before classification');
 if(result.residuals.length)result.outcome=result.residuals.some(r=>r.outcome==='unknown')?'unknown':result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'approximated';
 if(conflict||request.mode==='strict'&&result.residuals.length)result.status='blocked';
 else{
  const target=copyJson(source) as unknown as Document,selected=target.modules[mi]!.elements[request.column]!;
  if(!request.author&&Object.keys(result.mapping.facets).length)selected.facets=copyJson(result.mapping.facets);
  target.vocabularies[TABLESPEC_FACETS_EXTENSION]??={version:'1.0.0'};
  selected.extensions[TABLESPEC_FACETS_EXTENSION]=copyJson({origin:'classified',binding:{id:binding.id,version:binding.version},profile:request.profile,input:request.input,obligation:request.obligation,outcome:result.outcome,observations:result.mapping.observations});
  if(!validateDocument(target).valid)throw new UmfError('TABLESPEC_FACET_TARGET','Classification would violate core facet constraints');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:r.path.startsWith(idealPath)?'TABLESPEC_FACET_CONFLICT':'TABLESPEC_FACET_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('TABLESPEC_FACET_RESULT',JSON.stringify(check.errors));return copied as unknown as TableSpecFacetClassification;
}
/** Receipt consistency with retained input and current target, not source authentication. */
export function verifyTableSpecFacetClassification(input:TableSpecFacetClassification,current:Document):TableSpecFacetClassification {
 const receipt=copyJson(input) as unknown as TableSpecFacetClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('TABLESPEC_FACET_RECEIPT','Expected complete classified receipt');
 const expected=classifyTableSpecFacets(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('TABLESPEC_FACET_RECEIPT','Receipt disagrees with retained native source and selected profile');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('TABLESPEC_FACET_STALE','Target changed after classification');return receipt;
}
export function recoverTableSpecFacetSource(input:TableSpecFacetClassification,current:Document):string|Record<string,string>{return nativeArchive(verifyTableSpecFacetClassification(input,current).source);}
