import manifest from '../../../spec/extensions/ddd/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {readDocument,writeDocument,editExtension} from '../../model/document';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const DDD_EXTENSION='umf.ddd';
export const dddPackage=manifest as unknown as ExtensionPackage;
export interface DddReference {module:string;element:string;}
export interface DddField {type:{kind:'scalar';name:'string'|'boolean'|'integer'|'decimal'|'date-time'|'bytes'}|{kind:'concept';target:DddReference};cardinality:'one'|'optional'|'many';description?:string;}
export interface DddInvariant {id:string;scope:'definition'|'aggregate';language:string;version:string;expression:string;references:DddReference[];}
interface DddBase {description?:string;[key:string]:unknown;}
export interface DddEntity extends DddBase {kind:'entity';fields:Record<string,DddField>;identity:{fields:string[];scope:'context'|'aggregate'};aggregate?:{members:DddReference[]};invariants?:DddInvariant[];}
export interface DddValue extends DddBase {kind:'value';fields:Record<string,DddField>;equality:{fields:string[]};invariants?:DddInvariant[];}
export interface DddEvent extends DddBase {kind:'domain-event';fields:Record<string,DddField>;emittedBy:DddReference;immutable:true;invariants?:DddInvariant[];}
export interface DddOperation {name:string;input?:DddReference;output?:DddReference;emits?:DddReference[];}
export interface DddService extends DddBase {kind:'domain-service';operations:DddOperation[];}
export interface DddRepository extends DddBase {kind:'repository';aggregate:DddReference;operations:string[];}
export interface DddTerm {term:string;definition:string;aliases?:string[];concept?:DddReference;}
export interface DddContext extends DddBase {kind:'bounded-context';terms:DddTerm[];}
export interface DddMapping {id:string;source:DddReference;target:DddReference;direction:'source-to-target'|'target-to-source'|'bidirectional';equivalence:'partial'|'asserted-equivalent'|'distinct';description:string;limitations:string[];antiCorruptionLayer?:{ownerModule:string;description:string};}
export interface DddContextMap extends DddBase {kind:'context-map';mappings:DddMapping[];}
export type DddDefinition=DddEntity|DddValue|DddEvent|DddService|DddRepository;
const kinds:Record<string,string>={'entity':'entity','value':'value','domain-event':'event','domain-service':'service','repository':'repository','bounded-context':'context','context-map':'map'};
function semantics(value:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]{
 const p=value as any;const doc=context.document;const out:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>out.push({code,path:context.path+path,message,severity});
 const localIndex=/\/modules\/(\d+)/.exec(context.path);const local=localIndex?doc.modules[Number(localIndex[1])]:undefined;
 const elementIndex=/\/elements\/(\d+)/.exec(context.path);const current=elementIndex&&local?local.elements[Number(elementIndex[1])]:undefined;
 const refKey=(r:DddReference)=>JSON.stringify([r.module,r.element]);
 function resolve(ref:DddReference,path:string):any {
  const module=doc.modules.find(m=>m.id===ref.module);const element=module?.elements.find(e=>e.id===ref.element);
  const target=element?.extensions[DDD_EXTENSION] as any;
  if(!target){add('DDD_REFERENCE',path,'Missing DDD concept '+refKey(ref));return;}
  return target;
 }
 // Preserve unknown properties, but never treat them as interpreted vocabulary.
 function unknown(node:any,schema:any,path:string):void {
  if(schema.$ref)schema=(manifest.schema.$defs as any)[schema.$ref.split('/').at(-1)];
  if(schema.oneOf){schema=schema.oneOf.find((candidate:any)=>candidate.properties?.kind?.const===node?.kind);if(!schema)return;}
  if(schema.type==='object'&&node&&typeof node==='object'&&!Array.isArray(node))for(const[key,child]of Object.entries(node)){
   const next=(schema.properties&&Object.hasOwn(schema.properties,key)?schema.properties[key]:undefined)??(typeof schema.additionalProperties==='object'?schema.additionalProperties:undefined);
   if(next)unknown(child,next,path+'/'+pointer(key));else add('DDD_UNKNOWN',path+'/'+pointer(key),'Unknown DDD content retained','warning');
  }
  if(schema.type==='array'&&Array.isArray(node))node.forEach((child,index)=>unknown(child,schema.items,path+'/'+index));
 }
 unknown(p,(manifest.schema.$defs as any)[kinds[p.kind]!],'');
 const expected=p.kind==='bounded-context'?'module':p.kind==='context-map'?'document':'element';
 if(context.scope!==expected)add('DDD_SCOPE','','DDD declaration has the wrong attachment scope');
 if(context.scope==='element'&&(local?.extensions?.[DDD_EXTENSION] as any)?.kind!=='bounded-context')add('DDD_CONTEXT','','DDD concepts require an explicit bounded-context module');
 if(p.fields)for(const[name,field]of Object.entries(p.fields) as [string,any][]){if(field.type.kind==='concept'){const target=resolve(field.type.target,'/fields/'+name+'/type/target');if(target&&!['entity','value','domain-event'].includes(target.kind))add('DDD_FIELD','/fields/'+name,'Field type must denote data, not a service or repository');}}
 if(p.kind==='entity'){
  for(const name of p.identity.fields){const field=p.fields[name];if(!field||field.cardinality!=='one')add('DDD_IDENTITY','/identity','Identity fields must exist and be singular required values');}
  if(p.aggregate&&p.identity.scope!=='context')add('DDD_IDENTITY','/identity','An aggregate root requires context-scoped identity');
  if(p.aggregate)for(const[index,member]of p.aggregate.members.entries()){
   const target=resolve(member,'/aggregate/members/'+index);
   if(member.module!==local?.id)add('DDD_BOUNDARY','/aggregate/members/'+index,'Aggregate membership cannot cross bounded contexts');
   if(member.element===current?.id&&member.module===local?.id)add('DDD_BOUNDARY','/aggregate/members/'+index,'A root cannot be its own member');
   if(target&&(!['entity','value'].includes(target.kind)||target.aggregate))add('DDD_BOUNDARY','/aggregate/members/'+index,'Members must be non-root entities or value objects');
   if(target?.kind==='entity'){
    let owners=0;for(const module of doc.modules)for(const element of module.elements){const other=element.extensions[DDD_EXTENSION] as any;if(other?.kind==='entity'&&other.aggregate?.members?.some((r:DddReference)=>refKey(r)===refKey(member)))owners++;}
    if(owners!==1)add('DDD_OWNERSHIP','/aggregate/members/'+index,'An entity definition cannot belong to conflicting aggregate boundaries in this profile');
   }
  }
  if(p.identity.scope==='aggregate'){
   let owners=0;for(const module of doc.modules)for(const element of module.elements){const other=element.extensions[DDD_EXTENSION] as any;if(other?.kind==='entity'&&other.aggregate?.members?.some((r:DddReference)=>r.module===local?.id&&r.element===current?.id))owners++;}
   if(owners!==1)add('DDD_IDENTITY','/identity','Aggregate-scoped identity requires exactly one aggregate owner');
  }
 }
 if(p.kind==='value'){
  const names=Object.keys(p.fields).sort();if(JSON.stringify([...p.equality.fields].sort())!==JSON.stringify(names))add('DDD_EQUALITY','/equality','Value equality must explicitly include every declared field');
 }
 if(p.kind==='repository'){
  const target=resolve(p.aggregate,'/aggregate');if(target&&(target.kind!=='entity'||!target.aggregate))add('DDD_REPOSITORY','/aggregate','Repository must target an aggregate root');
  if(p.aggregate.module!==local?.id)add('DDD_CONTEXT','/aggregate','Repository belongs to the aggregate bounded context');
 }
 if(p.kind==='domain-event'){
  const target=resolve(p.emittedBy,'/emittedBy');if(target&&!['entity','domain-service'].includes(target.kind))add('DDD_EVENT','/emittedBy','Event producer must be an entity or domain service');
  if(p.emittedBy.module!==local?.id)add('DDD_CONTEXT','/emittedBy','Event declaration belongs to its producer context');
 }
 if(p.kind==='domain-service'){
  const names=new Set();for(const[index,op]of p.operations.entries()){
   if(names.has(op.name))add('DDD_OPERATION','/operations/'+index,'Duplicate operation');names.add(op.name);
   for(const key of ['input','output'])if(op[key])resolve(op[key],'/operations/'+index+'/'+key);
   for(const ref of op.emits??[]){const target=resolve(ref,'/operations/'+index+'/emits');if(target&&target.kind!=='domain-event')add('DDD_EVENT','/operations/'+index+'/emits','Operation emits must target a domain event');}
  }
 }
 if(p.invariants){
  const ids=new Set();for(const[index,invariant]of p.invariants.entries()){
   if(ids.has(invariant.id))add('DDD_INVARIANT','/invariants/'+index,'Duplicate invariant id');ids.add(invariant.id);
   if(invariant.scope==='aggregate'&&!p.aggregate)add('DDD_INVARIANT','/invariants/'+index,'Aggregate invariants belong on aggregate roots');
   for(const ref of invariant.references){resolve(ref,'/invariants/'+index+'/references');if(ref.module!==local?.id)add('DDD_INVARIANT','/invariants/'+index,'Invariant scope cannot cross a bounded context');
    if(invariant.scope==='aggregate'&&p.aggregate&&!(ref.module===local?.id&&ref.element===current?.id)&&!p.aggregate.members.some((member:DddReference)=>refKey(member)===refKey(ref)))add('DDD_INVARIANT','/invariants/'+index,'Aggregate invariant reference lies outside the declared boundary');}
   add('DDD_INVARIANT_OPAQUE','/invariants/'+index,'Invariant expression is preserved with its language/version; it is not interpreted or enforced','warning');
  }
 }
 if(p.kind==='bounded-context'){
  const terms=new Set();for(const[index,term]of p.terms.entries()){
   for(const text of [term.term,...term.aliases??[]]){if(terms.has(text))add('DDD_TERM','/terms/'+index,'Term or alias collides within its context');terms.add(text);}
   if(term.concept){resolve(term.concept,'/terms/'+index+'/concept');if(term.concept.module!==local?.id)add('DDD_TERM','/terms/'+index,'Ubiquitous-language term is local to its context');}
  }
 }
 if(p.kind==='context-map'){
  const ids=new Set();for(const[index,map]of p.mappings.entries()){
   if(ids.has(map.id))add('DDD_MAPPING','/mappings/'+index,'Duplicate mapping id');ids.add(map.id);
   resolve(map.source,'/mappings/'+index+'/source');resolve(map.target,'/mappings/'+index+'/target');
   if(map.source.module===map.target.module)add('DDD_MAPPING','/mappings/'+index,'A context mapping requires distinct contexts');
   if(map.equivalence==='partial'&&!map.limitations.length)add('DDD_MAPPING','/mappings/'+index,'Partial mappings must state limitations');
   if(map.equivalence==='asserted-equivalent')add('DDD_EQUIVALENCE_UNPROVEN','/mappings/'+index,'Declared equivalence is retained but not proven by matching structure or names','warning');
   if(map.antiCorruptionLayer&&![map.source.module,map.target.module].includes(map.antiCorruptionLayer.ownerModule))add('DDD_ACL','/mappings/'+index,'Anti-corruption layer owner must be a participating context');
  }
 }
 return out;
}
export function dddRegistry():Registry{return new Registry().register(dddPackage,semantics);}
export function inspectDdd(document:Document){return validateDocument(document,dddRegistry());}
function requireProfile(doc:Document):void {if(doc.vocabularies[DDD_EXTENSION]?.version!=='0.1.0'||!doc.modules.some(m=>(m.extensions?.[DDD_EXTENSION] as any)?.kind==='bounded-context'))throw new UmfError('DDD_PROFILE','Expected umf.ddd 0.1.0 and a bounded context');}
export function readDddDocument(text:string,format:'json'|'yaml'='yaml'):Document{const doc=readDocument(text,format);requireProfile(doc);const result=inspectDdd(doc);if(!result.valid)throw new UmfError('DDD_DOCUMENT',JSON.stringify(result.diagnostics));return doc;}
export function writeDddDocument(doc:Document,format:'json'|'yaml'='yaml'):string{requireProfile(doc);const result=inspectDdd(doc);if(!result.valid)throw new UmfError('DDD_DOCUMENT',JSON.stringify(result.diagnostics));return writeDocument(doc,format);}
export function getDddDefinition(doc:Document,module:string,element:string):DddDefinition{requireProfile(doc);if(!inspectDdd(doc).valid)throw new UmfError('DDD_DOCUMENT','Invalid DDD model');const value=doc.modules.find(m=>m.id===module)?.elements.find(e=>e.id===element)?.extensions[DDD_EXTENSION];if(!value)throw new UmfError('DDD_REFERENCE','Missing DDD definition');return copyJson(value) as unknown as DddDefinition;}
export function editDddDefinition(doc:Document,module:string,element:string,update:(definition:DddDefinition)=>DddDefinition):Document{return editExtension(doc,dddRegistry(),module,element,DDD_EXTENSION,value=>update(value as unknown as DddDefinition) as unknown as Json);}
