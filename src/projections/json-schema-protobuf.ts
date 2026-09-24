import {copyJson} from '../model/json';
import {UmfError,type Document,type Diagnostic,pointer} from '../model/types';
import {getJsonSchemaNode,inspectJsonSchema,type NativeJson} from '../adapters/json-schema';
import {inspectProtobuf} from '../adapters/protobuf';
import {importProtobufSources,type ProtobufSourceCompiler} from '../adapters/protobuf/source';
export interface ProjectionIssue {path:string;code:string;classification:'representation-change'|'not-enforced'|'unsupported'|'annotation-only';detail:string;retainedInSource:true;}
export interface ProtobufProjectionOptions {
 id:string;packageName:string;messageName:string;
 fields:Record<string,{number:number}>;
 integerType:'int64'|'uint64'|'sint64'|'int32'|'uint32'|'sint32';
 lossPolicy:'strict'|'allow-reported-loss';
}
export interface ProtobufProjection {
 status:'blocked'|'projected';source:Document;policy:ProtobufProjectionOptions;issues:ProjectionIssue[];
 mappings:{sourcePath:string;targetMessage:string;targetField:string;number:number}[];
 nativeSource?:string;target?:Document;targetDiagnostics?:Diagnostic[];
}
const ident=/^[A-Za-z_][A-Za-z0-9_]*$/;
/** Schema projection only. Does not silently claim an instance-data converter. */
export async function projectJsonSchemaToProtobuf(source:Document,input:ProtobufProjectionOptions,compiler:ProtobufSourceCompiler):Promise<ProtobufProjection>{
 const options=copyJson(input) as unknown as ProtobufProjectionOptions;
 if(typeof options.packageName!=='string'||!options.packageName.split('.').every(part=>ident.test(part))||typeof options.messageName!=='string'||!ident.test(options.messageName)||typeof options.id!=='string'||!options.id)throw new UmfError('PROJECTION_OPTIONS','Explicit valid package/message names and target id are required');
 if(!['int64','uint64','sint64','int32','uint32','sint32'].includes(options.integerType)||!['strict','allow-reported-loss'].includes(options.lossPolicy)||!options.fields||typeof options.fields!=='object'||Array.isArray(options.fields))throw new UmfError('PROJECTION_OPTIONS','Invalid projection policy or field bindings');
 if(Object.keys(options).some(key=>!['id','packageName','messageName','fields','integerType','lossPolicy'].includes(key)))throw new UmfError('PROJECTION_OPTIONS','Unknown projection policy field');
 const inspection=inspectJsonSchema(source);if(!inspection.valid)throw new UmfError('PROJECTION_SOURCE','Invalid source schema');
 const result:ProtobufProjection={status:'blocked',source:copyJson(source) as unknown as Document,policy:options,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 for(const diagnostic of inspection.diagnostics)issue(diagnostic.path,diagnostic.code,'unsupported',diagnostic.message);
 issue('','INSTANCE_ENCODING','representation-change','This projects schemas only; native wire/ProtoJSON data requires a separate explicit instance conversion using the field mappings');
 const root=getJsonSchemaNode(source,'');
 const messages:string[]=[];const names=new Map<string,string>();const usedBindings=new Set<string>();let serial=0;let fatal=inspection.diagnostics.some(d=>['JSON_SCHEMA_DIALECT','JSON_SCHEMA_VOCABULARY'].includes(d.code));
 const str=(node:NativeJson|undefined)=>node?.kind==='string'?node.value:undefined;
 function fail(path:string,code:string,detail:string){fatal=true;issue(path,code,'unsupported',detail);}
 function object(node:NativeJson,path:string):Record<string,NativeJson>|undefined {
  if(node.kind!=='object'){fail(path,'SCHEMA_SHAPE','Boolean or non-object schema has no selected native representation');return;}
  return node.members;
 }
 function notes(members:Record<string,NativeJson>,path:string,handled:string[]){
  for(const keyword of Object.keys(members))if(!handled.includes(keyword)){
   const annotation=['title','description','default','examples','$comment','readOnly','writeOnly','deprecated'].includes(keyword);
   issue(path+'/'+pointer(keyword),annotation?'ANNOTATION_RETAINED':'CONSTRAINT_NOT_ENFORCED',annotation?'annotation-only':'not-enforced',annotation?'Native target does not carry this source annotation; JSON Schema default is not a Protobuf field default':'Native target does not enforce this keyword; retained source schema remains authoritative');
  }
 }
 function type(node:NativeJson,path:string):string|undefined {
  const members=object(node,path);if(!members)return;
  if(members.$id&&path!==''){fail(path+'/$id','RESOURCE_SCOPE','Nested resource identity needs explicit reference lowering');return;}
  const reference=str(members.$ref);
  if(reference!==undefined){
   notes(members,path,['$ref']);
   if(reference!=='#'&&!reference.startsWith('#/')){fail(path+'/$ref','REFERENCE_SCOPE','Only explicit root-document JSON Pointer references are lowered in this profile');return;}
   let target:NativeJson;let targetPath:string;
   try{targetPath=decodeURIComponent(reference.slice(1));target=getJsonSchemaNode(source,targetPath);}catch{fail(path+'/$ref','REFERENCE_SCOPE','Unresolvable reference');return;}
   if(target.kind!=='object'||str(target.members.type)!=='object'){fail(path+'/$ref','REFERENCE_SHAPE','Referenced target must declare an object type');return;}
   issue(path+'/$ref','REFERENCE_LOWERED','representation-change','JSON Schema reference becomes a Protobuf message reference; native URI scope is retained in source');
   return message(target,targetPath);
  }
  let nativeType=str(members.type);
  if(members.type?.kind==='array'){
   const values=members.type.items.map(str);const nonNull=values.filter(v=>v!=='null');
   if(values.includes('null')&&nonNull.length===1&&nonNull[0]){nativeType=nonNull[0];issue(path+'/type','NULLABILITY_LOST','representation-change','Protobuf field absence does not represent a distinct JSON null value');}
  }
  if(nativeType==='object')return message(node,path);
  if(nativeType==='array'){
   const item=members.items;if(!item){fail(path+'/items','ARRAY_ITEMS','Array element type must be declared');return;}
   notes(members,path,['type','items']);
   const valueType=type(item,path+'/items');if(!valueType)return;
   if(valueType.startsWith('repeated ')){fail(path,'NESTED_ARRAY','Nested repeated fields need an explicit wrapper binding');return;}
   issue(path,'ARRAY_PRESENCE','representation-change','Repeated fields collapse absent and empty arrays; ordering is retained');return 'repeated '+valueType;
  }
  notes(members,path,['type']);
  if(nativeType==='string'){issue(path+'/type','STRING_ENCODING','representation-change','Native strings use UTF-8; ill-formed Unicode surrogate sequences have no portable native string representation');return 'string';}
  if(nativeType==='boolean')return 'bool';
  if(nativeType==='integer'){
   issue(path+'/type','INTEGER_DOMAIN','representation-change','Mathematical JSON integers are projected to explicitly selected '+options.integerType+'; range and wire representation differ');
   if(options.integerType.endsWith('64'))issue(path+'/type','PROTOJSON_INTEGER','representation-change','Protobuf JSON encodes 64-bit integers as strings; no instance converter is supplied');
   return options.integerType;
  }
  if(nativeType==='number'){issue(path+'/type','NUMBER_DOMAIN','representation-change','Binary64 may lose decimal precision and supports non-finite native values absent from JSON numbers');return 'double';}
  fail(path+'/type','TYPE_UNSUPPORTED','A declared object, array or supported scalar type is required; alternatives are not silently collapsed');
 }
 function message(node:NativeJson,path:string):string|undefined {
  const known=names.get(path);if(known)return known;
  const members=object(node,path);if(!members)return;
  let name=options.messageName;if(path!==''){do{name='Nested_'+(++serial);}while(name===options.messageName);}
  names.set(path,name);
  if(members.$id&&path!=='')fail(path+'/$id','RESOURCE_SCOPE','Nested resource identity needs explicit reference lowering');
  notes(members,path,['type','properties','$defs','$schema','$id','required','additionalProperties']);
  if(members.$schema)issue(path+'/$schema','DIALECT_RETAINED','annotation-only','JSON Schema dialect declaration is retained only in source');
  if(members.$id)issue(path+'/$id','IDENTITY_RETAINED','annotation-only','JSON Schema resource identity is retained only in source');
  if(members.$defs)issue(path+'/$defs','DEFINITIONS_RETAINED','annotation-only','Only referenced object definitions generate target messages; the full definition table remains in source');
  if(members.required)issue(path+'/required','REQUIRED_NOT_ENFORCED','not-enforced','Proto3 optional presence does not enforce JSON Schema required members');
  issue(path+'/additionalProperties','OBJECT_OPENNESS','representation-change',members.additionalProperties?.kind==='boolean'&&!members.additionalProperties.value?'Protobuf unknown wire fields are not JSON Schema additional-property rejection':'Undeclared JSON object properties have no generated fields');
  const properties=members.properties;
  if(properties&&properties.kind!=='object'){fail(path+'/properties','PROPERTIES_SHAPE','Invalid properties');return;}
  const lines:string[]=[];const tags=new Set<number>();
  for(const[key,child]of Object.entries(properties?.kind==='object'?properties.members:{})){
   const childPath=path+'/properties/'+pointer(key);const binding=options.fields[childPath];usedBindings.add(childPath);
   if(!binding||Object.keys(binding).some(k=>k!=='number')||!Number.isInteger(binding.number)||binding.number<1||binding.number>536870911||(binding.number>=19000&&binding.number<=19999)||tags.has(binding.number)){fail(childPath,'FIELD_NUMBER','Each field needs a distinct valid explicit Protobuf number within its message');continue;}
   tags.add(binding.number);const fieldType=type(child,childPath);if(!fieldType)continue;
   const field='field_'+binding.number;
   result.mappings.push({sourcePath:childPath,targetMessage:options.packageName+'.'+name,targetField:field,number:binding.number});
   lines.push(`  ${fieldType.startsWith('repeated ')?'':'optional '}${fieldType} ${field} = ${binding.number} [json_name = ${JSON.stringify(key)}];`);
  }
  messages.push(`message ${name} {\n${lines.join('\n')}\n}`);return name;
 }
 if(root.kind!=='object'||str(root.members.type)!=='object')fail('','ROOT_TYPE','This projection requires a declared object root');else message(root,'');
 for(const binding of Object.keys(options.fields))if(!usedBindings.has(binding))fail(binding,'UNUSED_BINDING','Field binding did not match a lowered source property');
 if(fatal||options.lossPolicy==='strict'&&result.issues.length)return result;
 result.nativeSource=`syntax = "proto3";\npackage ${options.packageName};\n${messages.join('\n\n')}\n`;
 try{result.target=await importProtobufSources({files:{'projection.proto':result.nativeSource},roots:['projection.proto']},compiler,{id:options.id});}catch(error){issue('','COMPILER_REJECTED','unsupported',String(error));return result;}
 result.targetDiagnostics=inspectProtobuf(result.target).diagnostics;
 result.status='projected';return result;
}
