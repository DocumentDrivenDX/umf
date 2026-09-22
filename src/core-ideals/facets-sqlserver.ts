import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {verifyCoreFacetDeclaration,inspectCoreFacets,type CoreFacetDeclaration,type CoreFacetPatch} from '../model/facets';
import {exportSqlServerCatalog,getSqlServerColumnMetadata} from '../adapters/sqlserver';
import {inspectSqlServerFacetConstraints,type SqlServerFacetConstraintFact} from '../adapters/sqlserver/facet-constraints';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import core from '../../spec/core/facet-document.schema.json';import authorSchema from '../../spec/core/facet-operation.schema.json';import nativeSchema from '../../spec/core/native-json.schema.json';
import schema from '../../spec/core/sqlserver-facet-classification.schema.json';
import captureSchema from '../../spec/extensions/sqlserver/capture.schema.json';
import manifest from '../../spec/extensions/sqlserver-facets/package.json';
export const SQLSERVER_FACETS_EXTENSION='umf.sqlserver.facets';
export const sqlserverFacetsPackage=manifest as unknown as ExtensionPackage;
export {default as sqlserverFacetClassificationSchema} from '../../spec/core/sqlserver-facet-classification.schema.json';
export interface SqlServerFacetRequest {column:string;nativeSource:string;identity:{module:string;element:string};mode:'strict'|'report';profile:'stored-value'|'ordinary-checked-write'|'unresolved';obligation:'value-domain'|'exact-input';author?:CoreFacetDeclaration}
type Outcome='exact'|'approximated'|'not-expressible'|'unknown';
type Concept='length'|'decimal'|'integerWidth'|'conversion'|'native';
interface Observation {concept:Concept;idealPath:string;nativePath:string;interpretation:'declared'|'inferred'|'unknown'|'unsupported';outcome:Outcome;basis:string}
const binding=schema.properties.binding.const;
const recovery='Retain original native archive and authored facets; interpretation does not replace native meaning' as const;
export interface SqlServerFacetClassification {
 operation:'classify-sqlserver-facets';version:'1.0.0';status:'classified'|'blocked';outcome:Outcome;source:Document;target?:Document;request:SqlServerFacetRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;facets:CoreFacetPatch;observations:Observation[]};
 residuals:{path:string;targetPath:string|null;value:Json;reason:string;outcome:Exclude<Outcome,'exact'>;binding:typeof binding;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator();for(const s of [legacy,fields,availability,containers,core,authorSchema,nativeSchema])validator.addSchema(s);
const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
/** Interpret a selected physical column onto an explicitly selected logical Field.
 * Native columns are never relabeled. Results are scoped observations, not authorship. */
export function classifySqlServerFacets(input:Document,options:SqlServerFacetRequest):SqlServerFacetClassification {
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as SqlServerFacetRequest;
 if(!checkRequest(request))throw new UmfError('SQLSERVER_FACET_REQUEST',JSON.stringify(checkRequest.errors));
 if(source.umf!=='0.5.0'||!validateDocument(source).valid)throw new UmfError('SQLSERVER_FACET_SOURCE','Valid core 0.5.0 required; migrate explicitly');
 const root=parseNativeJson(request.nativeSource);
 if(renderTree(root)+'\n'!==exportSqlServerCatalog(source))throw new UmfError('SQLSERVER_FACET_ARCHIVE','Original native source differs from retained catalog');
 if(root.kind!=='object'||root.members.serverVersion?.kind!=='string'||root.members.serverVersion.value!=='16.0.4295.3'||root.members.profile?.kind!=='string'||root.members.profile.value!=='sqlserver-catalog-v3'||root.members.state?.kind!=='string'||root.members.state.value!=='captured')throw new UmfError('SQLSERVER_FACET_VERSION','Pinned captured SQL Server v3 catalog required');
 const row=getSqlServerColumnMetadata(source).find(c=>c.path===request.column);
 if(!row)throw new UmfError('SQLSERVER_FACET_COLUMN','Column not captured');
 const mi=source.modules.findIndex(m=>m.id===request.identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===request.identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('SQLSERVER_FACET_FIELD','Explicit logical Field identity required');
 const element=source.modules[mi]!.elements[ei]!,idealPath=`/modules/${mi}/elements/${ei}/facets`,base=row.path;
 const result:SqlServerFacetClassification={operation:'classify-sqlserver-facets',version:'1.0.0',status:'classified',outcome:'exact',source,request,binding,mapping:{origin:'classified',idealPath,nativePath:base,nativeFragment:row.nativeColumn,facets:{},observations:[]},residuals:[],diagnostics:[]};
 const observe=(concept:Concept,nativePath:string,basis:string)=>result.mapping.observations.push({concept,idealPath,nativePath,interpretation:'inferred',outcome:'exact',basis});
 const loss=(path:string,value:unknown,reason:string,outcome:Exclude<Outcome,'exact'>='unknown',concept:Concept='native')=>{result.residuals.push({path,targetPath:idealPath,value:copyJson(value),reason,outcome,binding,recovery});result.mapping.observations.push({concept,idealPath,nativePath:path,interpretation:outcome==='not-expressible'?'unsupported':'unknown',outcome,basis:reason});};
 let conflict=false;const block=(value:unknown,reason:string)=>{conflict=true;loss(idealPath,value,reason);};
 if(request.identity.module==='sqlserver.columns'||element.kind!=='field'||element.cardinality!=='one'||element.references?.some(r=>r.role==='record-type')||element.scalarType!==row.element.scalarType)block(element,'An explicitly scalar logical Field matching the native scalar family is required; physical columns cannot be relabeled');
 if(Object.hasOwn(element.extensions,SQLSERVER_FACETS_EXTENSION))block(element.extensions[SQLSERVER_FACETS_EXTENSION],'Existing binding cannot be overwritten');
 if(source.vocabularies[SQLSERVER_FACETS_EXTENSION]&&source.vocabularies[SQLSERVER_FACETS_EXTENSION]!.version!=='1.0.0')block(source.vocabularies[SQLSERVER_FACETS_EXTENSION],'Incompatible facet vocabulary');
 const inspected=inspectSqlServerFacetConstraints(source,base),meaning=row.nativeColumn.kind==='object'&&row.nativeColumn.members.is_computed?.kind==='boolean'&&row.nativeColumn.members.is_computed.value===false?inspected.type.meaning:undefined,terms:SqlServerFacetConstraintFact[]=[];
 for(const o of inspected.observations){
  if(o.state==='residual'||request.profile==='stored-value'&&o.scope==='ordinary-checked-write-non-null')loss(o.path,o.native,'CHECK is unresolved for the selected value scope: '+o.reason);
  else terms.push(...o.facts);
 }
 const used=new Set<number>();
 if(request.profile==='unresolved')loss(base,row.nativeColumn,'No non-null value scope selected');
 else if(!meaning)loss(base,row.nativeColumn,inspected.type.reason??'Unsupported native type','not-expressible');
 else if(meaning.family==='integer'){
  let min=meaning.signed?-(1n<<BigInt(meaning.bits-1)):0n,max=(1n<<BigInt(meaning.signed?meaning.bits-1:meaning.bits))-1n;
  terms.forEach((t,i)=>{if(t.kind!=='integer-bound')return;const n=BigInt(t.literal);if(t.operator==='>=')min=n>min?n:min;else max=n<max?n:max;used.add(i);});
  let width:{bits:number;signed:boolean}|undefined;
  for(let bits=1;bits<=meaning.bits;bits++)for(const signed of [true,false]){const lo=signed?-(1n<<BigInt(bits-1)):0n,hi=(1n<<BigInt(signed?bits-1:bits))-1n;if(min===lo&&max===hi)width={bits,signed};}
  if(width){result.mapping.facets.integerWidth=width;observe('integerWidth',base,'Native carrier and applicable CHECKs establish this canonical non-null width domain');}
  else loss(base,{min:String(min),max:String(max)},'Effective range is empty or not a canonical width domain','not-expressible','integerWidth');
 }else if(meaning.family==='decimal'){
  result.mapping.facets.precision=meaning.precision;result.mapping.facets.scale=meaning.scale;
  terms.forEach((t,i)=>{if(t.kind==='decimal-stored-scale'&&t.scale===String(meaning.scale))used.add(i);});
  observe('decimal',base,'Native finite decimal coefficient domain; input rounding and runtime settings remain native');
 }else if(meaning.family==='binary'){
  let max=meaning.maxBytes;
  terms.forEach((t,i)=>{if(t.kind!=='binary-byte-bound')return;const n=BigInt(t.maximum);if(n>BigInt(Number.MAX_SAFE_INTEGER))return;max=max===null?Number(n):Math.min(max,Number(n));used.add(i);});
  if(max!==null){result.mapping.facets.length={max,unit:'byte'};observe('length',base,'Native byte capacity and applicable CHECKs establish a non-null upper bound');}
  if(meaning.padding==='fixed')loss(base,row.nativeColumn,'Fixed binary padding is not represented by a maximum byte bound','not-expressible','length');
 }else if(meaning.family==='string')loss(base,row.nativeColumn,'Native byte/UTF-16 capacity, collation, padding and malformed Unicode do not establish a portable Unicode-scalar length facet','not-expressible','length');
 terms.forEach((t,i)=>{if(!used.has(i))loss(base,t,'Additional native predicate remains outside interpreted facets');});
 if(request.obligation==='exact-input')loss(base,row.nativeColumn,meaning?.family==='float'&&meaning.bits===32?'Binary64 1.0000000000000002 narrows to binary32 1.0':meaning?.family==='decimal'?'Decimal input can round before CHECK evaluation; runtime settings can also produce error or NULL':'Catalog value-domain facts do not prove exact conversion of arbitrary SQL inputs',meaning?.family==='decimal'||meaning?.family==='float'&&meaning.bits===32?'approximated':'unknown','conversion');
 // All unknown capture properties stay attached and are made explicit, including
 // unknown content outside the selected table. Schema conditions add requirements only.
 function unknown(n:NativeJson,rule:any,at:string):void{
  if(rule.$ref){unknown(n,(captureSchema as any).$defs[rule.$ref.slice('#/$defs/'.length)],at);return;}
  if(rule.anyOf){const branch=rule.anyOf.find((r:any)=>n.kind==='null'?r.type==='null':r.type!=='null');if(branch)unknown(n,branch,at);return;}
  if(n.kind==='object')for(const [key,value] of Object.entries(n.members)){const p=at+'/'+key.replaceAll('~','~0').replaceAll('/','~1');if(rule.properties&&Object.hasOwn(rule.properties,key))unknown(value,rule.properties[key],p);else loss(p,value,'Unknown catalog content remains native');}
  if(n.kind==='array'&&rule.items)n.items.forEach((v,i)=>unknown(v,rule.items,at+'/'+i));
 }
 unknown(root,captureSchema,'');
 // Existing labels are never treated as proof of author intent. Reconcile only a verified receipt.
 if(request.author){
  try{
   const author=verifyCoreFacetDeclaration(request.author,source);
   if(author.identity.module!==request.identity.module||author.identity.element!==request.identity.element)block(author.identity,'Author receipt identifies a different Field');
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
  target.vocabularies[SQLSERVER_FACETS_EXTENSION]??={version:'1.0.0'};
  selected.extensions[SQLSERVER_FACETS_EXTENSION]=copyJson({origin:'classified',physicalColumn:request.column,binding:{id:binding.id,version:binding.version},profile:request.profile,obligation:request.obligation,outcome:result.outcome,observations:result.mapping.observations});
  if(!validateDocument(target).valid)throw new UmfError('SQLSERVER_FACET_TARGET','Classification would violate core facet constraints');result.target=target;
 }
 result.diagnostics=result.residuals.map(r=>({code:r.path.startsWith(idealPath)?'SQLSERVER_FACET_CONFLICT':'SQLSERVER_FACET_UNRESOLVED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('SQLSERVER_FACET_RESULT',JSON.stringify(check.errors));return copied as unknown as SqlServerFacetClassification;
}
/** Receipt consistency with retained input and current target, not source authentication. */
export function verifySqlServerFacetClassification(input:SqlServerFacetClassification,current:Document):SqlServerFacetClassification {
 const receipt=copyJson(input) as unknown as SqlServerFacetClassification;
 if(!check(receipt)||receipt.status!=='classified')throw new UmfError('SQLSERVER_FACET_RECEIPT','Expected complete classified receipt');
 const expected=classifySqlServerFacets(receipt.source,receipt.request);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('SQLSERVER_FACET_RECEIPT','Receipt disagrees with retained native source and selected profile');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('SQLSERVER_FACET_STALE','Target changed after classification');return receipt;
}
export function recoverSqlServerFacetSource(input:SqlServerFacetClassification,current:Document):string {return verifySqlServerFacetClassification(input,current).request.nativeSource;}
