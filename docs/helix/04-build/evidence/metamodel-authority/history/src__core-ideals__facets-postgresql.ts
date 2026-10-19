import {copyJson} from '../model/json';
import {readJsonValue} from '../model/serialization';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {type NativeJson} from '../model/native-json';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../adapters/postgresql/catalog';
import {correlatePostgresqlFacetCatalog} from '../adapters/postgresql/facet-catalog';
import {inspectPostgresqlFacetType} from '../adapters/postgresql/facet-typmod';
import type {PostgresqlBackend} from '../adapters/postgresql';
import {parseNativeJson,renderTree} from '../model/native-json';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import core from '../../spec/core/facet-document.schema.json';import authorSchema from '../../spec/core/facet-operation.schema.json';import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/postgresql-facet-classification.schema.json';
import supplementSchema from '../../spec/extensions/postgresql-catalog/facet-constraints-v1.schema.json';
import manifest from '../../spec/extensions/postgresql-facets/package.json';
export const POSTGRESQL_FACETS_EXTENSION='umf.postgresql.facets';
export const postgresqlFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as postgresqlFacetClassificationSchema} from '../../spec/core/postgresql-facet-classification.schema.json';
export type PostgresqlFacetProfile='stored-value'|'new-value'|'unresolved';
export interface PostgresqlFacetRequest {column:string;nativeSource:string;supplement:string;mode:'strict'|'report';profile:PostgresqlFacetProfile;datumFormat:'little-endian-datum64'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface PostgresqlFacetClassification {
 operation:'classify-postgresql-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:PostgresqlFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Qualified interpretation, never native validation or execution. No implicit migration. */
export async function classifyPostgresqlFacets(input:Document,options:PostgresqlFacetRequest,backend:PostgresqlBackend):Promise<PostgresqlFacetClassification> {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlFacetRequest;
 if(!checkRequest(request))throw new UmfError('POSTGRESQL_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.5.0'||!validateDocument(source).valid)throw new UmfError('POSTGRESQL_FACET_SOURCE','Valid core 0.5.0 required; migrate explicitly');
 const exported=exportPostgresqlCatalogCapture(source);
 if(renderTree(parseNativeJson(request.nativeSource))!==exported.json)throw new UmfError('POSTGRESQL_FACET_ARCHIVE','Original native source differs from retained catalog');
 const correspondence=await correlatePostgresqlFacetCatalog(source,request.supplement,request.datumFormat,backend);
 if(correspondence.root.kind!=='object'||correspondence.root.members.serverVersion?.kind!=='number'||Number(correspondence.root.members.serverVersion.value)!==170004||correspondence.root.members.encoding?.kind!=='string'||correspondence.root.members.encoding.value!=='UTF8')throw new UmfError('POSTGRESQL_FACET_VERSION','PostgreSQL 17.4 and UTF8 required');
 const row=getPostgresqlColumnMetadata(source).find(c=>c.path===request.column);
 if(!row||row.nativeColumn.kind!=='object')throw new UmfError('POSTGRESQL_FACET_COLUMN','Column not captured');
 const fragment=row.nativeColumn,members=fragment.members;
 const mi=source.modules.findIndex(m=>m.id==='postgresql.columns'),ei=source.modules[mi]?.elements.findIndex(e=>e.id===request.column)??-1;
 if(mi<0||ei<0)throw new UmfError('POSTGRESQL_FACET_COLUMN','Derived Field missing');
 const element=source.modules[mi]!.elements[ei]!;
 const base=request.column,idealPath=`/modules/${mi}/elements/${ei}/facets`;
 const result:PostgresqlFacetClassification={operation:'classify-postgresql-facets',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment:fragment,facets:{},observations:[]},residuals:[],diagnostics:[]};
 const path=(key:string)=>base+'/'+key;
 const observe=(concept:Concept,key:string,interpretation:Observation['interpretation'],outcome:Outcome,basis:string)=>result.mapping.observations.push({concept,idealPath,nativePath:path(key),interpretation,outcome,basis});
 const loss=(key:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown',concept:Concept='native')=>{
  const at=key.startsWith('/')?key:path(key);result.residuals.push({path:at,targetPath:idealPath,value:copyJson(value),reason,outcome,binding,recovery});
  result.mapping.observations.push({concept,idealPath,nativePath:at,interpretation:outcome==='not-expressible'?'unsupported':'unknown',outcome,basis:reason});
 };
 let conflict=false;const block=(value:unknown,reason:string)=>{conflict=true;loss(idealPath,value,reason);};
 if(element.kind!=='field'||(element.cardinality!==undefined&&element.cardinality!=='one'&&element.cardinality!=='unspecified')||element.references?.some(r=>r.role==='record-type'))block(element,'Facet classification requires a scalar Field');
 if(Object.hasOwn(element.extensions,POSTGRESQL_FACETS_EXTENSION))block(element.extensions[POSTGRESQL_FACETS_EXTENSION],'Existing binding cannot be overwritten');
 if(source.vocabularies[POSTGRESQL_FACETS_EXTENSION]&&source.vocabularies[POSTGRESQL_FACETS_EXTENSION]!.version!=='1.0.0')block(source.vocabularies[POSTGRESQL_FACETS_EXTENSION],'Incompatible facet vocabulary');
 const type=inspectPostgresqlFacetType(members.nativeType??{kind:'null'}),meaning=type.meaning;
 const selected=correspondence.matches.filter(m=>m.identity.schema===row.relation.schema&&m.identity.relation===row.relation.name&&(m.columns.length===0||m.columns.some(c=>c.path===request.column)));
 const terms:typeof selected[number]['inspection']['terms']=[];
 for(const match of selected){
  if(match.inspection.state!=='verified-expression'||request.profile==='stored-value'&&match.inspection.valueScope==='new-values-only')loss('/supplement/constraints',match.inspection.native,'Constraint meaning or enforcement scope is not qualified for the requested values');
  else terms.push(...match.inspection.terms);
 }
 const used=new Set<number>();
 const integral=(s:string)=>/^-?(0|[1-9][0-9]*)$/.test(s)&&s.length<4001?BigInt(s):undefined;
 if(request.profile==='unresolved')loss('nativeType',fragment,'No stored/new value scope selected');
 else if(!meaning)loss('nativeType',type.native,type.reason??'Native type is outside the qualified facet subset','not-expressible');
 else if(meaning.family==='integer'){
  let min=-(1n<<BigInt(meaning.signedBits-1)),max=(1n<<BigInt(meaning.signedBits-1))-1n;
  terms.forEach((t,i)=>{if(t.kind!=='bound')return;const n=integral(t.literal);if(n===undefined)return;if(t.operator==='>=')min=n>min?n:min;else max=n<max?n:max;used.add(i);});
  let width:{bits:number;signed:boolean}|undefined;
  for(let bits=1;bits<=meaning.signedBits;bits++)for(const signed of [true,false]){const lo=signed?-(1n<<BigInt(bits-1)):0n,hi=(1n<<BigInt(signed?bits-1:bits))-1n;if(min===lo&&max===hi)width={bits,signed};}
  if(width){result.mapping.facets.integerWidth=width;observe('integerWidth','nativeType','inferred','exact','Qualified non-null integer carrier and applicable CHECK bounds form the canonical width domain');}
  else loss('nativeType',{min:String(min),max:String(max)},'Effective integer interval is empty or not a canonical core width domain','not-expressible','integerWidth');
 }else if(meaning.family==='decimal'){
  const lower=terms.map((t,i)=>({t,i})).filter(x=>x.t.kind==='bound'&&x.t.operator==='>='),upper=terms.map((t,i)=>({t,i})).filter(x=>x.t.kind==='bound'&&x.t.operator==='<='),scales=terms.map((t,i)=>({t,i})).filter(x=>x.t.kind==='scale');
  let pair:{precision:number;scale:number}|undefined;
  for(const lo of lower)for(const hi of upper){
   if(pair)continue;
   if(lo.t.kind!=='bound'||hi.t.kind!=='bound'||lo.t.literal!=='-'+hi.t.literal)continue;
   const match=/^(9+|0)(?:\.(9+))?$/.exec(hi.t.literal);if(!match)continue;
   const scale=match[2]?.length??0,precision=(match[1]==='0'?0:match[1]!.length)+scale;if(precision<1||precision>1000)continue;
   const nativePair=meaning.precision===precision&&meaning.scale===scale;
   const guard=scales.find(x=>x.t.kind==='scale'&&x.t.scale===String(scale));
   if(nativePair||meaning.precision===null&&guard){pair={precision,scale};used.add(lo.i);used.add(hi.i);if(guard)used.add(guard.i);}
  }
  if(pair){Object.assign(result.mapping.facets,pair);observe('decimal','nativeType','inferred','exact','Finite symmetric decimal bounds plus qualified native scale or truncation equality establish the non-null coefficient domain');}
  else if(meaning.precision!==null||terms.length)loss('nativeType',{native:type.native,terms},'Native numeric precision/scale, special values and predicates do not establish a qualified finite core coefficient domain','not-expressible','decimal');
 }else if(meaning.family==='string'||meaning.family==='binary'){
  let max=meaning.family==='string'?meaning.declaredMaxCharacters:undefined;
  terms.forEach((t,i)=>{if(t.kind!=='length'||t.unit!==(meaning.family==='string'?'unicode-scalar':'byte'))return;const n=integral(t.max);if(n===undefined||n>BigInt(Number.MAX_SAFE_INTEGER))return;max=max==null?Number(n):Math.min(max,Number(n));used.add(i);});
  if(max!=null){result.mapping.facets.length={max,unit:meaning.family==='string'?'unicode-scalar':'byte'};observe('length','nativeType','inferred','exact','Native carrier and applicable length predicates establish this non-null upper bound');}
  if(meaning.family==='string'){
   if(max!==0)loss('nativeType',type.native,'PostgreSQL character values exclude NUL; a Unicode-scalar bound alone does not retain this restriction','not-expressible','length');
   if(meaning.padding!=='none')loss('nativeType',type.native,'Native character padding and trailing-space semantics remain outside the core length facet','not-expressible','length');
  }
 }
 terms.forEach((t,i)=>{if(!used.has(i))loss('/supplement/constraints',t,'Additional native predicate remains outside the interpreted facet domain');});
 if(request.obligation==='exact-input')loss('nativeType',type.native,meaning?.family==='float'&&meaning.bits===32?'Binary64 1.0000000000000002 narrows to binary32 1.0':meaning?.family==='decimal'&&meaning.coercesScale?'Native numeric scale conversion can round before CHECK evaluation':'Catalog value-domain evidence does not establish exact conversion of arbitrary SQL input expressions',meaning?.family==='float'&&meaning.bits===32||meaning?.family==='decimal'&&meaning.coercesScale?'approximated':'unknown','conversion');
 const columnKeys=['name','position','type','nativeType','notNull','identity','generated','collation','default','comment','storage','compression','acl'];
 for(const [key,value] of Object.entries(members))if(!columnKeys.includes(key))loss(key,value,'Unknown column metadata remains native');
 if(members.nativeType?.kind==='object')for(const [key,value] of Object.entries(members.nativeType.members))if(!['schema','name','kind','category','dimensions','modifier'].includes(key))loss('nativeType/'+key,value,'Unknown type refinement remains native');
 function unknown(n:NativeJson,rule:any,at:string):void{
  if(rule.$ref){unknown(n,(supplementSchema.$defs as any)[rule.$ref.slice('#/$defs/'.length)],at);return;}
  if(rule.anyOf){const branch=rule.anyOf.find((r:any)=>n.kind==='null'?r.type==='null':r.type!=='null');unknown(n,branch,at);return;}
  if(n.kind==='object')for(const [key,value] of Object.entries(n.members)){const path=at+'/'+key.replaceAll('~','~0').replaceAll('/','~1');if(rule.properties&&Object.hasOwn(rule.properties,key))unknown(value,rule.properties[key],path);else loss(path,value,'Unknown supplement content remains native');}
  if(n.kind==='array')n.items.forEach((v,i)=>unknown(v,rule.items,at+'/'+i));
 }
 unknown(correspondence.root,supplementSchema,'/supplement');
 // Existing labels are never treated as proof of author intent. Reconcile only a verified receipt.
 if(request.author){
  try{
   const author=verifyCoreFacetDeclaration(request.author,source);
   if(author.identity.module!=='postgresql.columns'||author.identity.element!==element.id)block(author.identity,'Author receipt identifies a different Field');
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
  const target=copyJson(source) as unknown as Document,selected=target.modules[mi]!.elements[ei]!;
  if(!request.author&&Object.keys(result.mapping.facets).length)selected.facets=copyJson(result.mapping.facets);
  target.vocabularies[POSTGRESQL_FACETS_EXTENSION]??={version:'1.0.0'};
  selected.extensions[POSTGRESQL_FACETS_EXTENSION]=copyJson({origin:'classified',nativeSupplement:request.supplement,binding:{id:binding.id,version:binding.version},profile:request.profile,datumFormat:request.datumFormat,obligation:request.obligation,outcome:result.outcome,observations:result.mapping.observations});
  if(!validateDocument(target).valid)throw new UmfError('POSTGRESQL_FACET_TARGET','Classification would violate core facet constraints');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:r.path.startsWith(idealPath)?'POSTGRESQL_FACET_CONFLICT':'POSTGRESQL_FACET_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('POSTGRESQL_FACET_RESULT',JSON.stringify(check.errors));return copied as unknown as PostgresqlFacetClassification;
}
/** Receipt consistency with retained input and current target, not source authentication. */
export async function verifyPostgresqlFacetClassification(input:PostgresqlFacetClassification,current:Document,backend:PostgresqlBackend):Promise<PostgresqlFacetClassification> {
 const receipt=copyJson(input) as unknown as PostgresqlFacetClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('POSTGRESQL_FACET_RECEIPT','Expected complete classified receipt');
 const expected=await classifyPostgresqlFacets(receipt.source,receipt.request,backend);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('POSTGRESQL_FACET_RECEIPT','Receipt disagrees with retained native source and selected profile');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('POSTGRESQL_FACET_STALE','Target changed after classification');return receipt;
}
export async function recoverPostgresqlFacetSource(input:PostgresqlFacetClassification,current:Document,backend:PostgresqlBackend):Promise<{nativeSource:string;supplement:string}>{const receipt=await verifyPostgresqlFacetClassification(input,current,backend);return {nativeSource:receipt.request.nativeSource,supplement:receipt.request.supplement};}
