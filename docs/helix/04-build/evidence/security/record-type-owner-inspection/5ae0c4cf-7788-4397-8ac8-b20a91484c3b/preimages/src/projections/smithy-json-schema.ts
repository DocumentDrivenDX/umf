import {copyJson,LIMITS} from '../model/json';
import {UmfError,type Document} from '../model/types';
import {assembleSmithyDocument,createSmithyJavaScriptBackend,type SmithyAssemblyBackend,type SmithyAssemblyResult} from '../adapters/smithy/assembly';
import {importJsonSchema,inspectJsonSchema,walkJsonSchema,getJsonSchemaNode} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface SmithyJsonSchemaBackend extends SmithyAssemblyBackend {converterIdentity:string;jsonSchema(modelJson:string,rootShape:string):string|Promise<string>;jsonSchemaForService?(modelJson:string,rootShape:string,serviceContext:string,addRootDefinition:boolean):string|Promise<string>;jsonSchemaWithRootDefinition?(modelJson:string,rootShape:string):string|Promise<string>;}
export interface SmithyJsonSchemaPolicy {id:string;baseUri:string;rootShape:string;profile:'native-defaults-2020-12'|'native-root-definition-2020-12'|'native-service-context-2020-12';serviceContext?:string;usage:'native-emission';lossPolicy:'strict'|'allow-reported-loss';}
export interface SmithyJsonSchemaProjection {status:'blocked'|'projected';source:Document;converter:string;assembly:SmithyAssemblyResult;policy:SmithyJsonSchemaPolicy;complete:false;issues:ProjectionIssue[];nativeSchema?:string;adaptedSchema?:string;target?:Document;}
export function createSmithyJavaScriptJsonSchemaBackend(module:{assemble(sourcesJson:string):string;jsonSchema(modelJson:string,rootShape:string):string;jsonSchemaWithRootDefinition?(modelJson:string,rootShape:string):string;jsonSchemaForService?(modelJson:string,rootShape:string,serviceContext:string,addRootDefinition:boolean):string}):SmithyJsonSchemaBackend{
 if(typeof module?.jsonSchema!=='function')throw new UmfError('SMITHY_RUNTIME','Expected the installed Smithy JSON Schema converter');
 return {...createSmithyJavaScriptBackend(module),converterIdentity:'smithy-jsonschema@1.73.0',jsonSchema:(model,root)=>module.jsonSchema(model,root),...(module.jsonSchemaForService?{jsonSchemaForService:(model:string,root:string,service:string,adapted:boolean)=>module.jsonSchemaForService!(model,root,service,adapted)}:{}),...(module.jsonSchemaWithRootDefinition?{jsonSchemaWithRootDefinition:(model:string,root:string)=>module.jsonSchemaWithRootDefinition!(model,root)}:{})};
}
/** Native emission with explicit policy; does not certify Smithy instance or protocol equivalence. */
export async function projectSmithyToJsonSchema(source:Document,backend:SmithyJsonSchemaBackend,input:SmithyJsonSchemaPolicy):Promise<SmithyJsonSchemaProjection>{
 const policy=copyJson(input) as unknown as SmithyJsonSchemaPolicy;
 if(!policy||typeof policy!=='object'||Object.keys(policy).some(k=>!['id','baseUri','rootShape','profile','serviceContext','usage','lossPolicy'].includes(k))||typeof policy.id!=='string'||!policy.id||typeof policy.baseUri!=='string'||!policy.baseUri||typeof policy.rootShape!=='string'||!policy.rootShape||!['native-defaults-2020-12','native-root-definition-2020-12','native-service-context-2020-12'].includes(policy.profile)||policy.usage!=='native-emission'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||typeof backend?.jsonSchema!=='function'||typeof backend.converterIdentity!=='string'||!backend.converterIdentity)throw new UmfError('SMITHY_PROJECTION_POLICY','Explicit native emission profile, root shape and loss policy are required');
 if(policy.profile==='native-service-context-2020-12'?(typeof policy.serviceContext!=='string'||!policy.serviceContext):policy.serviceContext!==undefined)throw new UmfError('SMITHY_PROJECTION_POLICY','Service context is required only for the service-context profile');
 try{new URL(policy.baseUri);}catch{throw new UmfError('SMITHY_PROJECTION_POLICY','An absolute retrieval URI is required');}
 const assembly=await assembleSmithyDocument(source,backend,{id:policy.id+'-assembled'});
 const result:SmithyJsonSchemaProjection={status:'blocked',converter:backend.converterIdentity,source:copyJson(source) as unknown as Document,assembly,policy,complete:false,issues:[]};
 const issue=(code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path:'',code,classification,detail,retainedInSource:true});
 issue('SMITHY_UNREVIEWED_SEMANTICS','not-enforced','Native data-shape conversion does not preserve all traits, operations, resources, protocols or source-domain validation. This is not an instance converter.');
 issue('SMITHY_NATIVE_NUMERIC_MAPPING','representation-change','Native defaults map integer shapes to JSON number and do not guarantee native width/precision constraints; timestamps, blobs and unions use native JSON representation strategies.');
 if(assembly.status!=='assembled'){issue('SMITHY_ASSEMBLY_UNAVAILABLE','unsupported','Source assembly failed');return result;}
 try{
  const contextual=policy.profile==='native-service-context-2020-12';
  if(contextual&&typeof backend.jsonSchemaForService!=='function')throw new UmfError('SMITHY_EMISSION_CAPABILITY','Backend does not support service-context emission');
  if(contextual)issue('SMITHY_SERVICE_CONTEXT','representation-change','The selected native service closure and its declared renames determine definition pointers; original qualified identities remain in source. This does not convert service operations.');
  const raw=contextual?await backend.jsonSchemaForService!(assembly.nativeModel!,policy.rootShape,policy.serviceContext!,false):await backend.jsonSchema(assembly.nativeModel!,policy.rootShape);
  if(typeof raw!=='string'||raw.length>LIMITS.maxTextLength)throw new UmfError('SMITHY_EMISSION_RESPONSE','Expected bounded native JSON Schema text');
  result.nativeSchema=raw;
  let targetText=raw;
  if(policy.profile==='native-root-definition-2020-12'||contextual){
   if(!contextual&&typeof backend.jsonSchemaWithRootDefinition!=='function')throw new UmfError('SMITHY_EMISSION_CAPABILITY','Backend does not support root-definition emission');
   targetText=contextual?await backend.jsonSchemaForService!(assembly.nativeModel!,policy.rootShape,policy.serviceContext!,true):await backend.jsonSchemaWithRootDefinition!(assembly.nativeModel!,policy.rootShape);
   if(typeof targetText!=='string'||targetText.length>LIMITS.maxTextLength)throw new UmfError('SMITHY_EMISSION_RESPONSE','Expected bounded adapted JSON Schema text');
   result.adaptedSchema=targetText;
   issue('SMITHY_ROOT_DEFINITION_ADDED','representation-change','The emitted root schema is also registered at the native converter root pointer. Original native output is retained separately. Instance-valued keywords are unchanged.');
  }
  const target=importJsonSchema(targetText,{id:policy.id,baseUri:policy.baseUri});const validation=inspectJsonSchema(target);
  // Check native-profile references on exact trees even when host-number limits prevent AJV compilation.
  const positions=walkJsonSchema(target);const schemaPointers=new Set(positions.map(p=>p.pointer));
  for(const {node}of positions){
   if(node.kind!=='object')continue;
   if(node.members.$id||node.members.$dynamicRef)throw new UmfError('SMITHY_EMISSION_REFERENCES','This native profile does not support nested resource or dynamic-reference semantics');
   const ref=node.members.$ref;if(!ref)continue;
   if(ref.kind!=='string'||!ref.value.startsWith('#'))throw new UmfError('SMITHY_EMISSION_REFERENCES','Native-profile references must be local JSON pointers');
   const path=decodeURIComponent(ref.value.slice(1));
   if(!schemaPointers.has(path))throw new UmfError('SMITHY_EMISSION_REFERENCES','Reference target is not a schema position');
   const resolved=getJsonSchemaNode(target,path);
   if(resolved.kind!=='object'&&resolved.kind!=='boolean')throw new UmfError('SMITHY_EMISSION_REFERENCES','Reference target is not a schema');
  }
  for(const diagnostic of validation.diagnostics)issue(diagnostic.code,diagnostic.severity==='error'||diagnostic.code==='JSON_SCHEMA_COMPILE'?'unsupported':'not-enforced',diagnostic.message);
  if(!validation.valid||validation.diagnostics.some(d=>d.code==='JSON_SCHEMA_COMPILE')||policy.lossPolicy==='strict')return result;
  result.target=target;result.status='projected';
 }catch(error){issue('SMITHY_EMISSION_FAILED','unsupported',String(error));}
 return result;
}
