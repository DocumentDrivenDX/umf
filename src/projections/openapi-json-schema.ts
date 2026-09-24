import {copyJson} from '../model/json';
import {renderTree,type NativeJson} from '../model/native-json';
import {UmfError,pointer,type Document} from '../model/types';
import {getOpenapiNode,inspectOpenapi,exportOpenapiBundle} from '../adapters/openapi';
import {indexOpenapiSchemas,resolveOpenapiSchemaReference,type OpenapiSchemaLocation} from '../adapters/openapi/scope';
import {importJsonSchema,inspectJsonSchema} from '../adapters/json-schema';
import type {ProjectionIssue} from './json-schema-protobuf';
export interface OpenapiJsonSchemaPolicy {id:string;schemaId:string;pointer:string;resourceUri?:string;schemaResources?:string[];usage:'schema-only';lossPolicy:'strict'|'allow-reported-loss';}
export interface OpenapiJsonSchemaProjection {status:'blocked'|'projected';source:Document;policy:OpenapiJsonSchemaPolicy;issues:ProjectionIssue[];mappings:{retrievalUri:string;sourcePointer:string;targetPointer:string}[];target?:Document;nativeSchema?:string;}
const known=new Set('$schema $id $anchor $ref $comment $defs definitions dependencies type enum const multipleOf maximum exclusiveMaximum minimum exclusiveMinimum maxLength minLength pattern maxItems minItems uniqueItems maxContains minContains maxProperties minProperties required dependentRequired allOf anyOf oneOf not if then else prefixItems items contains additionalProperties properties patternProperties dependentSchemas propertyNames unevaluatedItems unevaluatedProperties title description default deprecated readOnly writeOnly examples format contentEncoding contentMediaType contentSchema'.split(' '));
const oas=new Set(['discriminator','xml','externalDocs','example']);
const str=(value:string):NativeJson=>({kind:'string',value});
const obj=(members:Record<string,NativeJson>):NativeJson=>({kind:'object',members});
/** Project static JSON instance constraints with explicit API/annotation losses. */
export function projectOpenapiToJsonSchema(source:Document,input:OpenapiJsonSchemaPolicy):OpenapiJsonSchemaProjection {
 const policy=copyJson(input) as unknown as OpenapiJsonSchemaPolicy;
 if(policy.resourceUri!==undefined&&typeof policy.resourceUri!=='string'||policy.schemaResources!==undefined&&(!Array.isArray(policy.schemaResources)||policy.schemaResources.some(x=>typeof x!=='string'))||typeof policy.id!=='string'||!policy.id||typeof policy.schemaId!=='string'||typeof policy.pointer!=='string'||policy.usage!=='schema-only'||!['strict','allow-reported-loss'].includes(policy.lossPolicy)||Object.keys(policy).some(k=>!['id','schemaId','pointer','resourceUri','schemaResources','usage','lossPolicy'].includes(k)))throw new UmfError('OPENAPI_PROJECTION_POLICY','Explicit schema-only projection policy is required');
 try{const uri=new URL(policy.schemaId);if(uri.hash)throw new Error();}catch{throw new UmfError('OPENAPI_PROJECTION_POLICY','Target schema ID must be absolute and fragment-free');}
 if(!inspectOpenapi(source).valid)throw new UmfError('OPENAPI_PROJECTION_SOURCE','Invalid OpenAPI source');
 const result:OpenapiJsonSchemaProjection={status:'blocked',source:copyJson(source) as unknown as Document,policy,issues:[],mappings:[]};
 const issue=(path:string,code:string,classification:ProjectionIssue['classification'],detail:string)=>result.issues.push({path,code,classification,detail,retainedInSource:true});
 let fatal=false;const fail=(path:string,detail:string)=>{fatal=true;issue(path,'OPENAPI_PROJECTION_UNSUPPORTED','unsupported',detail);};
 let index:ReturnType<typeof indexOpenapiSchemas>;
 try{index=indexOpenapiSchemas(source,policy.schemaResources?{schemaResources:policy.schemaResources}:{});}catch(error){fail('',String(error));return result;}
 const uri=policy.resourceUri===undefined?exportOpenapiBundle(source).baseUri!:new URL(policy.resourceUri).href;
 const identity=(u:string,p:string)=>JSON.stringify([u,p]);
 const positions=new Map(index.locations.map(location=>[identity(location.retrievalUri,location.pointer),location]));
 const selected=positions.get(identity(uri,policy.pointer));if(!selected){fail(policy.pointer,'Selection is not an indexed schema position');return result;}
 const names=new Map<string,string>();const defs:Record<string,NativeJson>=Object.create(null);
 function project(location:OpenapiSchemaLocation):NativeJson {
  const key=identity(location.retrievalUri,location.pointer);let name=names.get(key);
  if(name)return obj({$ref:str('#/$defs/'+name)});
  name='schema_'+names.size;names.set(key,name);
  result.mappings.push({retrievalUri:location.retrievalUri,sourcePointer:location.pointer,targetPointer:'/$defs/'+name});
  function walk(node:NativeJson,path:string):NativeJson {
   const nested=positions.get(identity(location.retrievalUri,path));if(nested&&path!==location.pointer)return project(nested);
   if(node.kind==='array')return {kind:'array',items:node.items.map((n,i)=>walk(n,path+'/'+i))};
   if(node.kind!=='object')return node;
   const members:Record<string,NativeJson>=Object.create(null);
   for(const [key,value]of Object.entries(node.members)){
    if(path===location.pointer){
     if(['$schema','$id','$anchor'].includes(key))continue;
     if(['$dynamicRef','$dynamicAnchor','$vocabulary'].includes(key)){fail(path+'/'+pointer(key),'Dynamic scope or custom vocabulary requires a separate projection contract');continue;}
     if(key==='$ref'){
      if(value.kind!=='string'){fail(path+'/$ref','Reference must be a string');continue;}
      try{const target=resolveOpenapiSchemaReference(source,{pointer:path,resourceUri:location.retrievalUri,reference:value.value,...(policy.schemaResources?{schemaResources:policy.schemaResources}:{})}).target;const ref=project(target);if(ref.kind==='object')members.$ref=ref.members.$ref!;}catch(error){fail(path+'/$ref',String(error));}continue;
     }
     if(oas.has(key)||key.startsWith('x-')){issue(path+'/'+pointer(key),'OPENAPI_ANNOTATION','not-enforced','OpenAPI annotation/extension is retained in source and omitted from generic JSON validation');continue;}
     if(!known.has(key)){fail(path+'/'+pointer(key),'Unknown schema keyword cannot be assigned generic validation semantics');continue;}
     if(['readOnly','writeOnly','format','contentEncoding','contentMediaType'].includes(key))issue(path+'/'+pointer(key),'ANNOTATION_BEHAVIOR','not-enforced','Annotation is retained, without request/response filtering, format assertion or content decoding');
    }
    members[key]=walk(value,path+'/'+pointer(key));
   }
   return obj(members);
  }
  defs[name]=walk(getOpenapiNode(source,location.pointer,location.retrievalUri),location.pointer);
  return obj({$ref:str('#/$defs/'+name)});
 }
 const root=project(selected);
 issue('','SCHEMA_IDENTITY','representation-change','Static schema identities and references are rewritten into target definitions; original identities remain in source and mappings');
 issue('','SCHEMA_ONLY','not-enforced','JSON instance constraints do not implement operations, HTTP serialization, authorization, request/response direction, defaults insertion or API runtime behavior');
 if(fatal||policy.lossPolicy==='strict'&&result.issues.length)return result;
 const target=obj({$schema:str('https://json-schema.org/draft/2020-12/schema'),$id:str(policy.schemaId),...(root.kind==='object'?root.members:{}),$defs:obj(defs)});
 const text=renderTree(target);
 try{
  const document=importJsonSchema(text,{id:policy.id,baseUri:policy.schemaId});const checked=inspectJsonSchema(document);
  for(const d of checked.diagnostics){const blocked=['JSON_SCHEMA_COMPILE','JSON_SCHEMA_NUMERIC','JSON_SCHEMA_KEYWORD','JSON_SCHEMA_DIALECT','JSON_SCHEMA_VOCABULARY'].includes(d.code);issue(d.path,d.code,blocked?'unsupported':'not-enforced',d.message);if(blocked)fatal=true;}
  if(fatal)return result;
  result.nativeSchema=text;result.target=document;result.status='projected';
 }catch(error){fail('',String(error));}
 return result;
}
