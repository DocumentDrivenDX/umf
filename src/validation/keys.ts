import schema from '../../spec/core/key-document.schema.json';
import {createValidator} from './schema';
import {validateDocument} from './document';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Element,type Diagnostic,type Validation} from '../model/types';

export interface CoreKeyFieldReference {module:string;element:string;[key:string]:unknown}
export interface CoreKeyDefinition {id:string;name:string;fields:CoreKeyFieldReference[];primary?:boolean;[key:string]:unknown}
interface Candidate {umf:'0.6.0';modules:{id:string;elements:Element[]}[];[key:string]:unknown}
const check = createValidator().compile(schema);
const identity = (ref:CoreKeyFieldReference) => JSON.stringify([ref.module,ref.element]);

/** Candidate-only 0.6.0 validation. No author provenance, migration or native enforcement is inferred. */
export function validateKeyCandidate(input:unknown,validateBase=true):Validation {
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
 let document:Candidate;
 try {document=copyJson(input) as unknown as Candidate;}
 catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message);return {valid:false,complete:false,diagnostics};}
 if(!check(document)){
  for(const e of check.errors??[])add('KEY_STRUCTURE',e.instancePath,e.message??'Invalid key envelope');
  return {valid:false,complete:false,diagnostics};
 }
 // Reuse unchanged 0.5.0 semantics on a private view. The original candidate is
 // retained; this is not an exported downgrade or reinterpretation of old data.
 const base=copyJson(document) as unknown as Document;base.umf='0.5.0';
 for(const m of base.modules)for(const e of m.elements){delete e.members;delete e.keys;}
 if(validateBase)diagnostics.push(...validateDocument(base).diagnostics);
 add('EXPERIMENTAL_CORE_KEYS','/umf','Candidate key profile; native uniqueness and author provenance are not inferred','warning');
 const unknown=(o:object,known:string[],path:string)=>{
  for(const key of Object.keys(o))if(!known.includes(key))add('UNKNOWN_KEY_QUALIFIER',path+'/'+pointer(key),'Qualifier retained without interpretation','warning');
 };
 const definitions=new Map<string,Element>(),owners=new Map<string,string>();
 for(const m of document.modules)for(const e of m.elements)definitions.set(identity({module:m.id,element:e.id}),e);
 document.modules.forEach((m,mi)=>m.elements.forEach((record,ei)=>{
  const path=`/modules/${mi}/elements/${ei}`,members=record.members as CoreKeyFieldReference[]|undefined;
  if(!members)return;
  const own=new Set<string>();
  members.forEach((ref,ri)=>{
   const at=path+`/members/${ri}`,id=identity(ref),field=definitions.get(id);
   unknown(ref,['module','element'],at);
   if(own.has(id))add('KEY_DUPLICATE_MEMBER',at,'Record membership repeats a Field identity');
   own.add(id);
   if(!field)add('KEY_MEMBER_MISSING',at,'Member Field does not exist');
   else if(field.kind!=='field')add('KEY_MEMBER_KIND',at,'Record members must be explicit Fields');
   const previous=owners.get(id);
   if(previous&&previous!==path)add('KEY_MEMBER_OWNER',at,'Field already belongs to another Record: '+previous);
   else owners.set(id,path);
  });
  const ids=new Set<string>(),names=new Set<string>(),sets=new Set<string>();let primaries=0;
  (record.keys as CoreKeyDefinition[]|undefined)?.forEach((key,ki)=>{
   const at=path+`/keys/${ki}`;unknown(key,['id','name','fields','primary'],at);
   if(ids.has(key.id))add('KEY_DUPLICATE_ID',at+'/id','Key ID is not unique within the Record');ids.add(key.id);
   if(names.has(key.name))add('KEY_DUPLICATE_NAME',at+'/name','Key name is not unique within the Record');names.add(key.name);
   if(key.primary===true&&++primaries>1)add('KEY_PRIMARY_COUNT',at+'/primary','At most one key may be primary');
   const fieldIds=key.fields.map(identity),set=JSON.stringify([...fieldIds].sort());
   if(new Set(fieldIds).size!==fieldIds.length)add('KEY_DUPLICATE_FIELD',at+'/fields','Key repeats a Field identity');
   if(sets.has(set))add('KEY_DUPLICATE_SET',at+'/fields','Key component set duplicates another key, regardless of order');sets.add(set);
   key.fields.forEach((ref,ri)=>{
    const location=at+`/fields/${ri}`,id=identity(ref),field=definitions.get(id);
    unknown(ref,['module','element'],location);
    if(!own.has(id))add('KEY_FIELD_OWNER',location,'Key component is not a member of its owning Record');
    if(!field){add('KEY_FIELD_MISSING',location,'Key Field does not exist');return;}
    if(field.kind!=='field')add('KEY_FIELD_KIND',location,'Key component must be an explicit Field');
    if(field.nullability!=='required')add('KEY_FIELD_REQUIRED',location,'Key component must explicitly supply a value');
    if(field.cardinality!=='one')add('KEY_FIELD_SINGULAR',location,'Key component must explicitly be singular');
    if(!['boolean','integer','decimal','string','binary'].includes(field.scalarType??'')||field.references?.some(r=>r.role==='record-type'))add('KEY_EQUALITY',location,'Key equality is undefined for this component');
    if(field.scalarType==='decimal'){
     const facets=field.facets as {precision?:unknown;scale?:unknown}|undefined;
     if(!facets||facets.precision===undefined||facets.scale===undefined)add('KEY_DECIMAL_DOMAIN',location,'Decimal key equality requires explicit precision and scale');
    }
   });
  });
 }));
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
