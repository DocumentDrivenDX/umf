import schema from '../../spec/core/relationship-document.schema.json';
import {createValidator} from './schema';
import {validateKeyCandidate} from './keys';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Element,type Diagnostic,type Validation,type Module,type Json} from '../model/types';

export interface RelationshipEndpoint {module:string;element:string;[key:string]:unknown}
export interface RelationshipTarget extends RelationshipEndpoint {key:string}
export interface RelationshipMultiplicity {min:number;max:number|'*';[key:string]:unknown}
export interface CoreRelationship {id:string;name:string;source:RelationshipEndpoint[];target:RelationshipTarget[];sourceMultiplicity:RelationshipMultiplicity;targetMultiplicity:RelationshipMultiplicity;targetLifecycle:'owned'|'independent'|'unspecified'|(string&{});directed:boolean;inverse?:string;associationRecord?:RelationshipEndpoint;[key:string]:unknown}
export interface RelationshipCandidate {umf:'0.7.0';id:string;vocabularies:Document['vocabularies'];modules:(Module&{relationships?:CoreRelationship[]})[];extensions?:Record<string,Json>;[key:string]:unknown}
const check=createValidator().compile(schema);
const identity=(ref:RelationshipEndpoint)=>JSON.stringify([ref.module,ref.element]);

/** Explicit candidate validator; never reinterprets an older envelope. */
export function validateRelationshipCandidate(input:unknown,validateBase=true):Validation {
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 let document:RelationshipCandidate;
 try{document=copyJson(input) as unknown as RelationshipCandidate;}catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);return {valid:false,complete:false,diagnostics};}
 if(!check(document)){for(const e of check.errors??[])add('RELATIONSHIP_STRUCTURE',e.instancePath,e.message??'Invalid relationship envelope');return {valid:false,complete:false,diagnostics};}
 const base=copyJson(document) as unknown as Document;base.umf='0.6.0';for(const m of base.modules)delete m.relationships;
 diagnostics.push(...validateKeyCandidate(base,validateBase).diagnostics);
 add('EXPERIMENTAL_CORE_RELATIONSHIPS','/umf','Candidate authored relationship profile; native enforcement and storage are not inferred','warning');
 const unknown=(value:object,known:string[],path:string)=>{for(const key of Object.keys(value))if(!known.includes(key))add('UNKNOWN_RELATIONSHIP_QUALIFIER',path+'/'+pointer(key),'Qualifier retained without interpretation','warning');};
 const elements=new Map<string,Element>();for(const m of document.modules)for(const e of m.elements)elements.set(identity({module:m.id,element:e.id}),e);
 const presentations=new Map<string,{path:string;inverse:boolean}[]>();
 const presentation=(ref:RelationshipEndpoint,name:string,path:string,inverse:boolean)=>{
  const id=JSON.stringify([ref.module,ref.element,name]),previous=presentations.get(id)??[];
  // Forward names are module-scoped. An inverse must be unambiguous on its
  // target Record regardless of which module contains the other assertion.
  const collision=previous.find(p=>inverse||p.inverse);
  if(collision)add('RELATIONSHIP_PRESENTATION_COLLISION',path,'Inverse presentation collides on this endpoint with '+collision.path);
  previous.push({path,inverse});presentations.set(id,previous);
 };
 const resolve=(ref:RelationshipEndpoint,path:string)=>{
  const record=elements.get(identity(ref));
  if(!record){add('RELATIONSHIP_ENDPOINT_MISSING',path,'Endpoint does not resolve by exact module and element IDs');return;}
  if(record.kind!=='record'){add('RELATIONSHIP_ENDPOINT_KIND',path,'Endpoint must be a Record');return;}
  if(!Array.isArray(record.keys)||!record.keys.length)add('RELATIONSHIP_ENDPOINT_KEY',path,'Endpoint must have authored Keys');
  return record;
 };
 document.modules.forEach((module,mi)=>{
  const ids=new Set<string>(),names=new Set<string>();
  (module.relationships??[]).forEach((r,ri)=>{
   const path=`/modules/${mi}/relationships/${ri}`;
   unknown(r,['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed','inverse','associationRecord'],path);
   if(ids.has(r.id))add('RELATIONSHIP_DUPLICATE_ID',path+'/id','Relationship ID must be unique in its module');ids.add(r.id);
   if(names.has(r.name))add('RELATIONSHIP_DUPLICATE_NAME',path+'/name','Relationship name must be unique in its module');names.add(r.name);
   for(const end of ['source','target'] as const){
    const seen=new Set<string>();r[end].forEach((ref,index)=>{
     const at=path+`/${end}/${index}`;unknown(ref,end==='target'?['module','element','key']:['module','element'],at);
     const id=identity(ref);if(seen.has(id))add('RELATIONSHIP_DUPLICATE_ENDPOINT',at,'Endpoint Record repeats, regardless of qualifiers or target key');seen.add(id);
     const record=resolve(ref,at);
     if(end==='target'&&record&&!((record.keys??[]) as {id:string}[]).some(k=>k.id===(ref as RelationshipTarget).key))add('RELATIONSHIP_TARGET_KEY',at+'/key','Target key must resolve by its stable ID');
     if(end==='source')presentation(ref,r.name,at,false);else if(r.inverse)presentation(ref,r.inverse,path+'/inverse',true);
    });
    const bounds=r[end+'Multiplicity' as 'sourceMultiplicity'|'targetMultiplicity'];unknown(bounds,['min','max'],path+'/'+end+'Multiplicity');
    if(bounds.max!=='*'&&bounds.max<bounds.min)add('RELATIONSHIP_MULTIPLICITY',path+'/'+end+'Multiplicity','Maximum must be at least the minimum');
   }
   if(r.targetLifecycle==='owned'&&!r.directed)add('RELATIONSHIP_LIFECYCLE',path+'/targetLifecycle','Owned target lifecycle requires a directed relationship');
   if(!['owned','independent','unspecified'].includes(r.targetLifecycle))add('UNKNOWN_RELATIONSHIP_LIFECYCLE',path+'/targetLifecycle','Future lifecycle retained without interpretation','warning');
   if(r.associationRecord){unknown(r.associationRecord,['module','element'],path+'/associationRecord');resolve(r.associationRecord,path+'/associationRecord');}
  });
 });
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
