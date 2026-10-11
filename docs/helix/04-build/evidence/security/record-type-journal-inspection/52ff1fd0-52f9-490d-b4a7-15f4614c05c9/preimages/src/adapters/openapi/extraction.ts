import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type Json} from '../../model/types';
import {openapiSchemaPositions} from './schemas';
import {inspectOpenapi,getOpenapiNode,exportOpenapiBundle} from './index';
export interface OpenapiSchemaExtraction {
 source:Document;pointer:string;retrievalUri?:string;openapiVersion:string;
 dialect:string;dialectOrigin:'schema'|'document'|'openapi-default';
 schema:NativeJson;nativeSchema:string;complete:false;limitations:string[];
}
/** Extract one declared Schema Object while retaining its entire owning context. */
export function extractOpenapiSchema(document:Document,input:{pointer:string;resourceUri?:string}):OpenapiSchemaExtraction {
 const options=copyJson(input) as unknown as {pointer:string;resourceUri?:string};
 if(typeof options.pointer!=='string'||Object.keys(options).some(k=>!['pointer','resourceUri'].includes(k))||(options.resourceUri!==undefined&&typeof options.resourceUri!=='string'))throw new UmfError('OPENAPI_SCHEMA_SELECTION','A schema pointer and optional resource URI are required');
 if(!inspectOpenapi(document).valid)throw new UmfError('OPENAPI_SCHEMA_SOURCE','Invalid owning OpenAPI description');
 const bundle=exportOpenapiBundle(document);
 const root=getOpenapiNode(document,'',options.resourceUri);
 const version=root.kind==='object'?root.members.openapi:undefined;
 if(version?.kind!=='string'||!/^3\.[12]\./.test(version.value))throw new UmfError('OPENAPI_SCHEMA_VERSION','Schema extraction requires an owning OpenAPI 3.1 or 3.2 description; fragments require declared context');
 // This host view is used only to identify object roles, never numeric schema values.
 const shape=JSON.parse(renderTree(root)) as Json;
 if(!openapiSchemaPositions(shape).some(entry=>entry.pointer===options.pointer))throw new UmfError('OPENAPI_SCHEMA_POSITION','Selection is not a declared top-level Schema Object position');
 const schema=getOpenapiNode(document,options.pointer,options.resourceUri);
 if(schema.kind!=='object'&&schema.kind!=='boolean')throw new UmfError('OPENAPI_SCHEMA_POSITION','Schema must be an object or boolean');
 const explicit=schema.kind==='object'?schema.members.$schema:undefined;
 const inherited=root.kind==='object'?root.members.jsonSchemaDialect:undefined;
 if(explicit&&explicit.kind!=='string'||inherited&&inherited.kind!=='string')throw new UmfError('OPENAPI_SCHEMA_DIALECT','Schema dialect must be a string');
 const dialect=explicit?.kind==='string'?explicit.value:inherited?.kind==='string'?inherited.value:version.value.startsWith('3.1.')?'https://spec.openapis.org/oas/3.1/dialect/base':'https://spec.openapis.org/oas/3.2/dialect/2026-02-26';
 const retrievalUri=options.resourceUri===undefined?bundle.baseUri:new URL(options.resourceUri).href;
 return {
  source:copyJson(document) as unknown as Document,pointer:options.pointer,...(retrievalUri?{retrievalUri}:{}),openapiVersion:version.value,
  dialect,dialectOrigin:explicit?'schema':inherited?'document':'openapi-default',schema,nativeSchema:renderTree(schema),complete:false,
  limitations:['nativeSchema is an exact contextual fragment, not a standalone validation schema','Schema IDs, anchors, dynamic references and OpenAPI $self identity require contextual resolution','The retained source includes supplied resources; absent resources are not fetched','Extraction does not implement HTTP serialization, read/write direction or API runtime semantics']
 };
}
