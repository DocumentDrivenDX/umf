/** Private selected-source correspondence; no policy/domain/runtime admission. */
import {copyJson} from '../../model/json';
import type {SecurityRef} from './types';
const sources=new WeakMap<object,any>();
const fail=():never=>{throw Error('SECURITY_ASSOCIATION_CANDIDATE_UNSUPPORTED');};
const id=(r:SecurityRef)=>JSON.stringify([r.documentId,r.moduleId,r.elementId]);
function shape(v:any,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function text(v:unknown){if(typeof v!=='string'||!v)return fail();let n=0;for(const c of v)if(++n>4096)fail();}
function ref(v:any){shape(v,['documentId','moduleId','elementId']);Object.values(v).forEach(text);}
function freeze(v:any):any{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export interface CandidateRecordAssociationPlan {
 readonly kind:'candidate-record-association/0.1';
 readonly type:SecurityRef;readonly key:unknown;readonly sourceRecord:unknown;
 readonly endpoints:readonly {role:string;target:SecurityRef;key:unknown;fields:readonly SecurityRef[]}[];
}
export function resolveCandidateRecordAssociation(input:unknown,document:unknown,entities:unknown):CandidateRecordAssociationPlan {
 const s:any=copyJson(input),d:any=copyJson(document),choices:any=copyJson(entities);
 shape(s,['kind','type','keyId','endpoints']);if(s.kind!=='record-members')fail();ref(s.type);text(s.keyId);
 if(!['0.7.0','0.8.0'].includes(d.umf)||!Array.isArray(d.modules)||!Array.isArray(choices)||choices.length>256)fail();
 const keys=new Map<string,string>();for(const e of choices){shape(e,['type','keyId']);ref(e.type);text(e.keyId);if(keys.has(id(e.type)))fail();keys.set(id(e.type),e.keyId);}
 function record(r:SecurityRef){ref(r);if(r.documentId!==d.id)fail();const ms=d.modules.filter((m:any)=>m.id===r.moduleId);if(ms.length!==1||!Array.isArray(ms[0].elements))return fail();const rs=ms[0].elements.filter((e:any)=>e.id===r.elementId);if(rs.length!==1||rs[0].kind!=='record'||!Array.isArray(rs[0].members)||!Array.isArray(rs[0].keys))return fail();return rs[0];}
 function selected(r:any,keyId:string){text(keyId);const ks=r.keys.filter((k:any)=>k.id===keyId);if(ks.length!==1)return fail();const k=ks[0];if(Object.keys(k).some(n=>!['id','name','fields','primary'].includes(n))||('primary'in k&&typeof k.primary!=='boolean')||!Array.isArray(k.fields)||!k.fields.length)return fail();const seen=new Set<string>();for(const f of k.fields){shape(f,['module','element']);text(f.module);text(f.element);const token=JSON.stringify([f.module,f.element]);if(seen.has(token)||!r.members.some((m:any)=>m.module===f.module&&m.element===f.element))fail();seen.add(token);}return k;}
 const source=record(s.type),key=selected(source,s.keyId),roles=new Set<string>();
 if(!Array.isArray(s.endpoints)||!s.endpoints.length||s.endpoints.length>256)fail();
 const endpoints=s.endpoints.map((e:any)=>{
  shape(e,['role','target','fields']);text(e.role);ref(e.target);if(roles.has(e.role))fail();roles.add(e.role);
  const keyId=keys.get(id(e.target));if(!keyId)return fail();const target=record(e.target),key=selected(target,keyId);
  if(!Array.isArray(e.fields)||!e.fields.length||e.fields.length>256||e.fields.length!==key.fields.length)fail();const fields=new Set<string>();
  for(const f of e.fields){ref(f);if(f.documentId!==s.type.documentId||fields.has(id(f))||!source.members.some((m:any)=>m.module===f.moduleId&&m.element===f.elementId))fail();fields.add(id(f));}
  return {role:e.role,target:e.target,key,fields:e.fields};
 });
 const plan=freeze({kind:'candidate-record-association/0.1',type:s.type,key,sourceRecord:source,endpoints});sources.set(plan,d);return plan;
}

function canonical(v:any):string{return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
/** Exact selected-field equality-domain correspondence within the issuance
 * snapshot. Not full core validity, classification or authority admission. */
export function requireCandidateEndpointDomainCorrespondence(plan:CandidateRecordAssociationPlan):void {
 const document=sources.get(plan);if(!document)return fail();
 function domain(r:SecurityRef):string{
  const modules=document.modules.filter((m:any)=>m.id===r.moduleId);if(r.documentId!==document.id||modules.length!==1)return fail();
  const fields=modules[0].elements.filter((f:any)=>f.id===r.elementId);if(fields.length!==1)return fail();const f=fields[0];
  const known=['id','kind','name','description','title','aliases','examples','extensions','scalarType','nullability','cardinality','facets','allowedValues'];
  if(Object.keys(f).some(k=>!known.includes(k))||f.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(f.scalarType)||f.cardinality!=='one'||f.nullability!=='required'||(f.extensions&&Object.keys(f.extensions).length))return fail();
  const facets=f.facets??{};if(!facets||typeof facets!=='object'||Array.isArray(facets))return fail();
  if(Object.keys(facets).some(k=>!['length','precision','scale','integerWidth','range'].includes(k)))return fail();
  for(const [group,allowed] of Object.entries({length:['min','max','unit'],integerWidth:['bits','signed'],range:['min','max','minInclusive','maxInclusive']})){
   const value=facets[group];if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k))))return fail();
  }
  if(f.scalarType==='decimal'&&(!Number.isSafeInteger(facets.precision)||!Number.isSafeInteger(facets.scale)||facets.precision<1||facets.scale<0))return fail();
  return canonical({scalarType:f.scalarType,cardinality:f.cardinality,nullability:f.nullability,facets,allowedValues:f.allowedValues??null});
 }
 for(const endpoint of plan.endpoints){
  const fields=(endpoint.key as any).fields;
  endpoint.fields.forEach((field,i)=>{const target={documentId:endpoint.target.documentId,moduleId:fields[i].module,elementId:fields[i].element};if(domain(field)!==domain(target))fail();});
 }
}

/** Explicit classification coverage for every member of selected Records.
 * Retained query-use declarations are not compiler or runtime authorization. */
export function requireCandidateAssociationClassifications(plan:CandidateRecordAssociationPlan,input:unknown):unknown {
 const document=sources.get(plan);if(!document)return fail();
 return checkCandidateRecordClassifications(document,[plan.type,...plan.endpoints.map(e=>e.target)],input);
}
/** Coverage utility over captured source content; caller must establish core validity. */
export function checkCandidateRecordClassifications(source:unknown,scope:unknown,input:unknown):unknown {
 const packet:any=copyJson({source,scope,input}),document=packet.source,declarations=packet.input;
 if(!Array.isArray(packet.scope)||packet.scope.length>257)fail();packet.scope.forEach((r:any)=>{ref(r);if(r.documentId!==document.id)fail();});
 if(!Array.isArray(declarations)||declarations.length>257)return fail();
 const required=new Map<string,SecurityRef>(packet.scope.map((r:SecurityRef)=>[id(r),r])),seen=new Set<string>();
 for(const declaration of declarations){
  shape(declaration,['type','fields']);ref(declaration.type);const token=id(declaration.type);
  if(!required.has(token)||seen.has(token)||!Array.isArray(declaration.fields))fail();seen.add(token);
  const record=document.modules.find((m:any)=>m.id===declaration.type.moduleId).elements.find((e:any)=>e.id===declaration.type.elementId);
  const members=new Set<string>(record.members.map((r:any)=>id({documentId:document.id,moduleId:r.module,elementId:r.element}))),classified=new Set<string>();
  for(const field of declaration.fields){
   if(!field||typeof field!=='object'||Array.isArray(field)||Object.keys(field).some(k=>!['ref','protection','queryUse'].includes(k))||!Object.hasOwn(field,'ref')||!Object.hasOwn(field,'protection'))fail();
   ref(field.ref);const key=id(field.ref);if(!members.has(key)||classified.has(key)||!['protected','unprotected'].includes(field.protection))fail();classified.add(key);
   if(field.queryUse!==undefined){if(!field.queryUse||typeof field.queryUse!=='object'||Array.isArray(field.queryUse))fail();for(const [operator,use] of Object.entries(field.queryUse))if(!['predicate','order','group','join','aggregate'].includes(operator)||!['disclosed','original-authorized','prohibited'].includes(use as string))fail();}
  }
  if(classified.size!==members.size)fail();
 }
 if(seen.size!==required.size)fail();return freeze(declarations);
}
