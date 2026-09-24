import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreRelationship,verifyCoreRelationshipOperation,type CoreRelationshipDeclaration,type CoreRelationshipIdentity} from '../model/relationships';
import type {RelationshipEndpoint} from '../validation/relationships';
import type {CoreKeyDefinition} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {importAvroSchema,exportAvroBundle} from '../adapters/avro';
import {buildAvroRelationshipCarrier,type AvroRelationshipCarrier} from './relationship-avro-carrier';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import authorSchema from '../../spec/core/relationship-operation.schema.json';
import schema from '../../spec/core/relationship-avro-projection.schema.json';
export {default as relationshipAvroProjectionSchema} from '../../spec/core/relationship-avro-projection.schema.json';
export interface RelationshipAvroRequest extends Omit<AvroRelationshipCarrier,'components'> {id:string;profile:'target-key-record';relationship:CoreRelationshipIdentity;mode:'strict'|'report';components:(AvroRelationshipCarrier['components'][number]&{targetField:RelationshipEndpoint})[]}
const binding=schema.properties.binding.const;
const recovery='Retained receipt recovers authored source and emitted native archive; native-only import does not establish authored intent' as const;
export interface RelationshipAvroProjection {
 operation:'project-relationship-avro';version:'1.0.0';status:'projected'|'blocked';outcome:'approximated'|'not-expressible'|'unknown';
 source:Document;author:CoreRelationshipDeclaration;request:RelationshipAvroRequest;binding:typeof binding;target?:Document;nativeArchive?:{schema:string;dependencies:[]};
 mappings:{idealPath:string;nativePath:string;outcome:'approximated';targetKey:string;componentPaths:string[]}[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships,authorSchema])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const id=(r:RelationshipEndpoint)=>JSON.stringify([r.module,r.element]);
function locate(d:Document,ref:RelationshipEndpoint){const mi=d.modules.findIndex(x=>x.id===ref.module),ei=d.modules[mi]?.elements.findIndex(x=>x.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('RELATIONSHIP_AVRO_REFERENCE','Unresolved logical element');return {element:d.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** Explicit reference-value lowering with retained authored meaning; no native identity inference. */
export function projectRelationshipToAvro(input:Document,authorInput:CoreRelationshipDeclaration,options:RelationshipAvroRequest):RelationshipAvroProjection {
 const source=copyJson(input) as unknown as Document,author=copyJson(authorInput) as unknown as CoreRelationshipDeclaration,request=copyJson(options) as unknown as RelationshipAvroRequest;
 if(!requestCheck(request))throw new UmfError('RELATIONSHIP_AVRO_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid)throw new UmfError('RELATIONSHIP_AVRO_SOURCE','Valid core 0.7.0 required');
 if(author.operation!=='declare-core-relationship')throw new UmfError('RELATIONSHIP_AVRO_AUTHOR','Expected explicit relationship declaration');
 verifyCoreRelationshipOperation(author,author.target);
 if(author.target.id!==source.id||author.identity.module!==request.relationship.module||author.request.id!==request.relationship.id)throw new UmfError('RELATIONSHIP_AVRO_AUTHOR','Mismatched author identity');
 const current=lookupCoreRelationship(source,request.relationship),prior=lookupCoreRelationship(author.target,request.relationship),rel=current.relationship;
 if(!same(rel,prior.relationship))throw new UmfError('RELATIONSHIP_AVRO_STALE','Relationship changed since authoring');
 for(const endpoint of [...rel.source,...rel.target,...(rel.associationRecord?[rel.associationRecord]:[])]){
  const e=locate(source,endpoint).element,old=locate(author.target,endpoint).element;
  if(!same(e,old))throw new UmfError('RELATIONSHIP_AVRO_STALE','Endpoint Record or Key changed since authoring');
  for(const member of (e.members??[]) as RelationshipEndpoint[])if(!same(locate(source,member).element,locate(author.target,member).element))throw new UmfError('RELATIONSHIP_AVRO_STALE','Endpoint component changed since authoring');
 }
 const r:RelationshipAvroProjection={operation:'project-relationship-avro',version:'1.0.0',status:'projected',outcome:'approximated',source,author,request,binding,mappings:[],residuals:[],diagnostics:[]};
 let impossible=false;
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'|'approximated'='not-expressible')=>r.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 const block=(path:string,value:unknown,reason:string)=>{impossible=true;loss(path,value,reason);};
 loss('/',source,'Only selected target-key reference values are emitted; all other logical and native extension content remains in the retained source');
 for(const key of ['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed','inverse','associationRecord'])if(Object.hasOwn(rel,key))loss(current.path+'/'+key,rel[key],'Avro value structure does not establish this authored obligation: stable relationship/Record/Key identity, target existence, distinct-record participation, lifecycle and presentation require retained meaning');
 for(const path of current.uninterpretedPaths){
  let value:unknown=source;for(const part of path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'))){if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))throw new UmfError('RELATIONSHIP_AVRO_PATH','Unresolved qualifier diagnostic path');value=(value as Record<string,unknown>)[part];}
  loss(path,value,'Unknown relationship qualifier remains uninterpreted','unknown');
 }
 if(rel.source.length!==1||rel.target.length!==1)block(current.path,rel,'This target-key-record profile cannot represent heterogeneous endpoint sets');
 if(rel.associationRecord)block(current.path+'/associationRecord',rel.associationRecord,'A keyed association Record needs a separately declared identity and attribute layout');
 const endpoint=rel.target[0]!,record=locate(source,endpoint).element,key=(record.keys as CoreKeyDefinition[]).find(k=>k.id===endpoint.key)!;
 if(request.components.length!==key.fields.length||request.components.some((c,i)=>!key.fields[i]||id(c.targetField)!==id(key.fields[i]!)))block('/request/components',request.components,'Components must cover target Key Fields exactly once, in Key order');
 const families:Record<string,string>={boolean:'boolean',int:'integer',long:'integer',float:'float',double:'float',bytes:'binary',string:'string'};
 for(const [i,c] of request.components.entries()){
  if(!key.fields.some(f=>id(f)===id(c.targetField)))continue;
  const f=locate(source,c.targetField),e=f.element;
  if(e.kind!=='field'||e.cardinality!=='one'||e.scalarType!==families[c.type]||e.itemType!==undefined||e.references?.some(x=>x.role==='record-type'))block('/request/components/'+i,c,'Native primitive must match a singular scalar target Key Field');
  loss(f.path,e,'Native primitive choice does not establish ideal domain, exact conversion, nullability, integer width, length, precision/scale or unknown qualifier meaning','unknown');
  if(e.facets!==undefined)loss(f.path+'/facets',e.facets,'Author-stated facets are retained but not enforced by this primitive reference carrier','not-expressible');
 }
 loss('/request/shape',request.shape,'Wire shape is explicit: arrays admit empty and duplicate values, nullable unions admit null, and singular values do not establish distinct-record participation','approximated');
 let native:string|undefined;
 try{native=buildAvroRelationshipCarrier({recordName:request.recordName,namespace:request.namespace,fieldName:request.fieldName,keyRecordName:request.keyRecordName,shape:request.shape,components:request.components.map(c=>({name:c.name,type:c.type}))});}
 catch(error){if(!(error instanceof UmfError))throw error;block('/request',request,'Invalid explicit native carrier: '+error.message);}
 if(impossible||request.mode==='strict'){r.status='blocked';r.outcome=impossible?'not-expressible':'unknown';}
 else{
  r.nativeArchive={schema:native!,dependencies:[]};r.target=importAvroSchema(native!,{id:request.id});
  const keyPath=request.shape==='array'?'/fields/0/type/items':request.shape==='nullable-one'?'/fields/0/type/1':'/fields/0/type';
  r.mappings.push({idealPath:current.path,nativePath:keyPath,outcome:'approximated',targetKey:key.id,componentPaths:request.components.map((_,i)=>keyPath+'/fields/'+i)});
 }
 r.diagnostics=r.residuals.map(x=>({code:'RELATIONSHIP_AVRO_LOSS',path:x.path,message:x.reason,severity:r.status==='blocked'?'error':'warning'}));
 const result=copyJson(r);if(!check(result))throw new UmfError('RELATIONSHIP_AVRO_RESULT',JSON.stringify(check.errors));return result as unknown as RelationshipAvroProjection;
}
/** Verify retained consistency against a current or freshly imported native document. */
export function verifyRelationshipAvroProjection(input:RelationshipAvroProjection,current:Document):RelationshipAvroProjection {
 const r=copyJson(input) as unknown as RelationshipAvroProjection;if(!check(r)||r.status!=='projected')throw new UmfError('RELATIONSHIP_AVRO_RECEIPT','Expected successful projection receipt');
 if(!same(r,projectRelationshipToAvro(r.source,r.author,r.request)))throw new UmfError('RELATIONSHIP_AVRO_RECEIPT','Forged or inconsistent retained projection');
 const actual=exportAvroBundle(copyJson(current) as unknown as Document),expected=exportAvroBundle(r.target!);
 if(actual.schema!==expected.schema||!same(actual.dependencies,expected.dependencies))throw new UmfError('RELATIONSHIP_AVRO_STALE','Emitted native representation changed');return r;
}
export function recoverRelationshipAvroIdeal(input:RelationshipAvroProjection,current:Document):Document{return copyJson(verifyRelationshipAvroProjection(input,current).source) as unknown as Document;}
export function recoverRelationshipAvroNative(input:RelationshipAvroProjection,current:Document){return copyJson(verifyRelationshipAvroProjection(input,current).nativeArchive!) as unknown as {schema:string;dependencies:[]};}
