import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type JsonObject} from '../model/types';
import {inspectDdd,getDddDefinition,type DddReference,type DddDefinition,type DddField} from '../extensions/ddd';
import {importJsonSchema,inspectJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface DddDocumentBindings {
 id:string;schemaId:string;root:DddReference;closedObjects:boolean;
 integer:'json-integer';decimal:'decimal-string';dateTime:'string';bytes:'hex-string';collection:'array';
 relations:Record<string,'embed'|'identity'>;lossPolicy:'strict'|'allow-reported-loss';
}
export interface DddDocumentProjection {
 status:'blocked'|'projected';source:Document;policy:DddDocumentBindings;issues:ProjectionIssue[];
 mappings:{concept:DddReference;mode:'embed'|'identity';targetPointer:string}[];target?:Document;nativeSchema?:string;
}
export const dddFieldBinding=(ref:DddReference,field:string)=>'/'+pointer(ref.module)+'/'+pointer(ref.element)+'/fields/'+pointer(field);
export function projectDddToJsonSchema(source:Document,input:DddDocumentBindings):DddDocumentProjection {
 const options=copyJson(input) as unknown as DddDocumentBindings;
 if(typeof options.id!=='string'||!options.id||typeof options.schemaId!=='string'||!options.root||typeof options.root.module!=='string'||!options.root.module||typeof options.root.element!=='string'||!options.root.element||typeof options.closedObjects!=='boolean'||options.integer!=='json-integer'||options.decimal!=='decimal-string'||options.dateTime!=='string'||options.bytes!=='hex-string'||options.collection!=='array'||!['strict','allow-reported-loss'].includes(options.lossPolicy)||!options.relations||typeof options.relations!=='object'||Array.isArray(options.relations))throw new UmfError('DDD_BINDINGS','Explicit complete document bindings are required');
 if(Object.keys(options).some(k=>!['id','schemaId','root','closedObjects','integer','decimal','dateTime','bytes','collection','relations','lossPolicy'].includes(k))||Object.keys(options.root).some(k=>!['module','element'].includes(k)))throw new UmfError('DDD_BINDINGS','Unknown binding option');
 try{const uri=new URL(options.schemaId);if(uri.hash)throw new Error('fragment');}catch{throw new UmfError('DDD_BINDINGS','Schema identity must be an absolute fragment-free URI');}
 const checked=inspectDdd(source);if(!checked.valid)throw new UmfError('DDD_SOURCE','Invalid DDD model');
 const result:DddDocumentProjection={status:'blocked',source:copyJson(source) as unknown as Document,policy:options,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 for(const diagnostic of checked.diagnostics)issue(diagnostic.path,diagnostic.code,'unsupported',diagnostic.message);
 let fatal=false;const fail=(path:string,code:string,detail:string)=>{fatal=true;issue(path,code,'unsupported',detail);};
 const definitions:Record<string,JsonObject>=Object.create(null);const names=new Map<string,string>();const used=new Set<string>();const active=new Set<string>();
 function origin(ref:DddReference):string {const mi=source.modules.findIndex(m=>m.id===ref.module);const ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;return '/modules/'+mi+'/elements/'+ei+'/extensions/umf.ddd';}
 function scalar(field:DddField,path:string):JsonObject {
  if(field.type.kind!=='scalar')throw new UmfError('DDD_INTERNAL','Expected scalar');
  switch(field.type.name){
   case 'boolean':return {type:'boolean'};
   case 'string':return {type:'string'};
   case 'integer':issue(path,'INTEGER_ENCODING','representation-change','JSON integer encoding does not guarantee host-runtime precision; no instance conversion is supplied');return {type:'integer'};
   case 'decimal':issue(path,'DECIMAL_ENCODING','representation-change','Decimal values use non-exponent base-ten strings; scale and value equality are not enforced');return {type:'string',pattern:'^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$'};
   case 'date-time':issue(path,'DATETIME_UNENFORCED','not-enforced','Date-time meaning is retained in DDD; the selected binding validates strings only');return {type:'string'};
   case 'bytes':issue(path,'BYTES_ENCODING','representation-change','Bytes use lowercase hexadecimal pairs');return {type:'string',pattern:'^([0-9a-f]{2})*$'};
  }
 }
 function concept(ref:DddReference,mode:'embed'|'identity'):JsonObject|undefined {
  const key=JSON.stringify([ref.module,ref.element,mode]);const existing=names.get(key);if(existing){if(active.has(key))issue(origin(ref),'RECURSIVE_EMBED','representation-change','Recursive document schemas require finite instance shapes; cyclic object graphs may need identity bindings');return {$ref:'#/$defs/'+existing};}
  let def:DddDefinition;try{def=getDddDefinition(source,ref.module,ref.element);}catch(error){fail('/root','DDD_REFERENCE',String(error));return;}
  if(!['entity','value','domain-event'].includes(def.kind)){fail(origin(ref),'NON_DATA_CONCEPT','Services and repositories need an operation binding, not an inferred document shape');return;}
  if(mode==='identity'&&(def.kind!=='entity'||def.identity.scope!=='context')){fail(origin(ref),'IDENTITY_SCOPE','Identity references require a context-scoped entity identity; aggregate-local identifiers need an owner binding');return;}
  const name='concept_'+names.size;names.set(key,name);active.add(key);result.mappings.push({concept:copyJson(ref) as unknown as DddReference,mode,targetPointer:'/$defs/'+name});
  const data=def as Extract<DddDefinition,{kind:'entity'|'value'|'domain-event'}>;
  const properties:Record<string,JsonObject>=Object.create(null);const required:string[]=[];
  definitions[name]={type:'object',title:ref.module+'.'+ref.element+(mode==='identity'?' identity':''),properties,additionalProperties:!options.closedObjects};
  if(def.description)definitions[name]!.description=def.description;
  if(def.kind==='entity')issue(origin(ref),'IDENTITY_UNENFORCED','not-enforced','Required identity fields do not enforce uniqueness, lifecycle or referential integrity');
  if(def.kind==='entity'&&def.aggregate)issue(origin(ref),'AGGREGATE_UNENFORCED','not-enforced','Embedding does not enforce aggregate ownership, consistency or transactions');
  if(def.kind==='value')issue(origin(ref),'VALUE_EQUALITY_UNENFORCED','not-enforced','Object shape does not enforce domain value equality or immutability');
  if(def.kind==='domain-event')issue(origin(ref),'EVENT_UNENFORCED','not-enforced','Document shape does not enforce event occurrence, immutability, producer authority or delivery');
  const fields=mode==='identity'&&def.kind==='entity'?def.identity.fields:Object.keys(data.fields);
  if(mode==='identity')issue(origin(ref),'IDENTITY_REFERENCE','representation-change','Only the selected identity fields are emitted at this relationship; the full entity stays in source');
  for(const fieldName of fields){
   const field=data.fields[fieldName]!;const path=dddFieldBinding(ref,fieldName);let shape:JsonObject|undefined;
   if(field.type.kind==='scalar')shape=scalar(field,origin(ref)+'/fields/'+pointer(fieldName));
   else{
    used.add(path);const binding=options.relations[path];if(binding!=='embed'&&binding!=='identity'){fail(path,'RELATION_BINDING','Every reached concept field requires an explicit embed/identity binding');continue;}
    shape=concept(field.type.target,binding);
   }
   if(!shape)continue;
   if(field.cardinality==='many'){issue(origin(ref)+'/fields/'+pointer(fieldName),'COLLECTION_ENCODING','representation-change','Selected optional array encoding permits absent/empty collections and adds order; it does not enforce domain set semantics or aggregate ownership');shape={type:'array',items:shape};}
   if(field.description)shape={...shape,description:field.description};
   properties[fieldName]=shape;if(field.cardinality==='one')required.push(fieldName);
  }
  if(required.length)definitions[name]!.required=required;
  active.delete(key);return {$ref:'#/$defs/'+name};
 }
 issue('','DOMAIN_MODEL_RETAINED','not-enforced','Bounded contexts, terminology, mappings/ACLs, services, repositories and unselected definitions remain in source; document validation does not implement them');
 issue('','OBJECT_BINDING','representation-change',options.closedObjects?'Closed JSON objects are an explicit physical binding, not an inferred domain rule':'Open JSON objects are an explicit physical binding, not an inferred domain rule');
 const root=concept(options.root,'embed');
 for(const path of Object.keys(options.relations))if(!used.has(path))fail(path,'UNUSED_BINDING','Relationship binding did not match a reached concept field');
 if(fatal||!root||options.lossPolicy==='strict'&&result.issues.length)return result;
 const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:options.schemaId,...root,$defs:definitions};
 result.nativeSchema=JSON.stringify(schema,null,2)+'\n';
 result.target=importJsonSchema(result.nativeSchema,{id:options.id,baseUri:options.schemaId});
 if(!inspectJsonSchema(result.target).valid)throw new UmfError('DDD_TARGET','Generated document schema is invalid');
 result.status='projected';return result;
}
