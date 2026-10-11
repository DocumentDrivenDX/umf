import {createValidator} from '../../validation/schema';
import {pointer,type Json,type Diagnostic} from '../../model/types';
import meta31 from '../../../spec/extensions/openapi/upstream/3.1-meta.json';
import meta32 from '../../../spec/extensions/openapi/upstream/3.2-meta.json';
const standard='https://json-schema.org/draft/2020-12/schema';
const validator=createValidator(false);
const standardCheck=validator.getSchema(standard)!;
const oasChecks={'3.1':createValidator(false).compile(meta31),'3.2':createValidator(false).compile(meta32)};
const known:Record<string,'3.1'|'3.2'|'standard'>={
 [standard]:'standard','https://spec.openapis.org/oas/3.1/dialect/base':'3.1',
 'https://spec.openapis.org/oas/3.1/dialect/2024-11-10':'3.1',
 'https://spec.openapis.org/oas/3.2/dialect/2026-02-26':'3.2'
};
const singles=['not','if','then','else','items','contains','additionalProperties','unevaluatedProperties','unevaluatedItems','propertyNames','contentSchema'];
const lists=['allOf','anyOf','oneOf','prefixItems'];
const maps=['$defs','definitions','properties','patternProperties','dependentSchemas'];
const object=(x:any)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
/** Find Schema Objects by OAS object role; examples/default values are never scanned. */
export function openapiSchemaPositions(root:Json):{pointer:string;schema:Json}[]{
 const out:{pointer:string;schema:Json}[]=[];
 function map(x:any,path:string,fn:(x:any,p:string)=>void){if(object(x))for(const [key,value]of Object.entries(x))fn(value,path+'/'+pointer(key));}
 function array(x:any,path:string,fn:(x:any,p:string)=>void){if(Array.isArray(x))x.forEach((v,i)=>fn(v,path+'/'+i));}
 function schema(x:any,path:string){if(x!==undefined)out.push({pointer:path,schema:x});}
 function encoding(x:any,p:string){if(!object(x))return;map(x.headers,p+'/headers',parameter);map(x.encoding,p+'/encoding',encoding);array(x.prefixEncoding,p+'/prefixEncoding',encoding);if(x.itemEncoding)encoding(x.itemEncoding,p+'/itemEncoding');}
 function media(x:any,p:string){if(!object(x))return;schema(x.schema,p+'/schema');schema(x.itemSchema,p+'/itemSchema');encoding(x,p);}
 function content(x:any,p:string){if(object(x))map(x.content,p+'/content',media);}
 function parameter(x:any,p:string){if(!object(x))return;schema(x.schema,p+'/schema');content(x,p);}
 function response(x:any,p:string){if(!object(x))return;content(x,p);map(x.headers,p+'/headers',parameter);}
 function callback(x:any,p:string){map(x,p,(v,path)=>{if(!path.split('/').at(-1)!.startsWith('x-')&&object(v))pathItem(v,path);});}
 function operation(x:any,p:string){if(!object(x))return;array(x.parameters,p+'/parameters',parameter);content(x.requestBody,p+'/requestBody');map(x.responses,p+'/responses',(v,path)=>{const key=path.split('/').at(-1)!;if(key==='default'||/^[1-5][0-9Xx]{2}$/.test(key))response(v,path);});map(x.callbacks,p+'/callbacks',callback);}
 function pathItem(x:any,p:string){if(!object(x))return;array(x.parameters,p+'/parameters',parameter);for(const name of ['get','put','post','delete','options','head','patch','trace','query'])operation(x[name],p+'/'+name);map(x.additionalOperations,p+'/additionalOperations',operation);}
 const r=root as any;
 map(r.paths,'/paths',(v,path)=>{if(path.startsWith('/paths/~1'))pathItem(v,path);});map(r.webhooks,'/webhooks',pathItem);
 const c=r.components;if(object(c)){
  map(c.schemas,'/components/schemas',schema);
  for(const key of ['parameters','headers'])map(c[key],'/components/'+key,parameter);
  map(c.responses,'/components/responses',response);map(c.requestBodies,'/components/requestBodies',content);
  map(c.callbacks,'/components/callbacks',callback);map(c.pathItems,'/components/pathItems',pathItem);map(c.mediaTypes,'/components/mediaTypes',media);
 }
 return out;
}
export function inspectEmbeddedSchemas(root:Json):Diagnostic[]{
 const r=root as any;const version=String(r.openapi??'').slice(0,3);if(!['3.1','3.2'].includes(version))return [];
 const out:Diagnostic[]=[];const defaultDialect=r.jsonSchemaDialect??(version==='3.1'?'https://spec.openapis.org/oas/3.1/dialect/2024-11-10':'https://spec.openapis.org/oas/3.2/dialect/2026-02-26');
 function inspect(schema:any,path:string,inherited:string){
  if(typeof schema!=='boolean'&&!object(schema)){out.push({code:'OPENAPI_SCHEMA_META',path,severity:'error',message:'Schema must be an object or boolean'});return;}
  const dialect=typeof schema==='boolean'?inherited:schema.$schema??inherited;const profile=typeof dialect==='string'&&Object.hasOwn(known,dialect)?known[dialect]:undefined;
  if(typeof dialect!=='string'){out.push({code:'OPENAPI_SCHEMA_META',path:path+'/$schema',severity:'error',message:'Schema dialect must be a string'});return;}
  if(!profile){out.push({code:'OPENAPI_SCHEMA_DIALECT',path,severity:'warning',message:'Unknown dialect retained without applying another dialect: '+dialect});return;}
  if(typeof schema==='boolean')return;
  // Validate each schema position shallowly so a nested dialect boundary is respected.
  const shallow={...schema};const children:{value:any;path:string}[]=[];
  const child=(value:any,p:string)=>{children.push({value,path:p});return object(value)||typeof value==='boolean'?true:value;};
  for(const key of singles)if(Object.hasOwn(schema,key))shallow[key]=child(schema[key],path+'/'+key);
  for(const key of lists)if(Array.isArray(schema[key]))shallow[key]=schema[key].map((v:any,i:number)=>child(v,path+'/'+key+'/'+i));
  for(const key of maps)if(object(schema[key]))shallow[key]=Object.fromEntries(Object.entries(schema[key]).map(([k,v])=>[k,child(v,path+'/'+pointer(key)+'/'+pointer(k))]));
  if(object(schema.dependencies))shallow.dependencies=Object.fromEntries(Object.entries(schema.dependencies).map(([k,v])=>[k,object(v)||typeof v==='boolean'?child(v,path+'/dependencies/'+pointer(k)):v]));
  for(const check of [standardCheck,...(profile==='standard'?[]:[oasChecks[profile]])])if(!check(shallow))for(const error of check.errors??[])out.push({code:'OPENAPI_SCHEMA_META',path:path+error.instancePath,severity:'error',message:error.message??'Invalid schema keyword'});
  if(schema.$vocabulary)out.push({code:'OPENAPI_SCHEMA_VOCABULARY',path:path+'/$vocabulary',severity:'warning',message:'Custom vocabulary interpretation is not established by this meta-schema check'});
  for(const entry of children)inspect(entry.value,entry.path,dialect);
 }
 for(const position of openapiSchemaPositions(root))inspect(position.schema,position.pointer,defaultDialect);
 return out;
}
