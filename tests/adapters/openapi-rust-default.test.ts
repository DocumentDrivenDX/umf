import {describe,expect,test} from 'bun:test';
import {createOpenapiRustDefault} from '../../src/adapters/openapi/rust-default';
import {UmfError} from '../../src/model/errors';
import type {OpenapiNativeFamilyEngine} from '../../src/adapters/openapi/rust-default';
import type {Diagnostic, Document} from '../../src/model/types';

const document:Document={umf:'0.10.0',id:'openapi-rust-default',vocabularies:{},modules:[]};
const nativeTree={kind:'string',value:'API 🚀'} as const;
const unexpected=()=>{throw new Error('unexpected OpenAPI operation');};
function openapiEngine(overrides:Partial<OpenapiNativeFamilyEngine['openapi']>):OpenapiNativeFamilyEngine {
 return {openapi:{
  import:unexpected,inspectPayload:()=>[],validate:unexpected,export:unexpected,exportBundle:unexpected,
  getNode:unexpected,lookupResource:unexpected,extractSchema:unexpected,indexSchemas:unexpected,
  resolveSchemaReference:unexpected,resolveDynamicReference:unexpected,resolveObjectReference:unexpected,
  edit:unexpected,...overrides,
 }};
}

describe('OpenAPI Rust default facade',()=>{
 test('preserves import, exact UTF-16 node values, and export operation shape',()=>{
  const calls:string[]=[];
  const engine=openapiEngine({
   import(fields:Record<string,unknown>){calls.push('import');expect(fields.source).toBe('{"openapi":"3.2.1","info":{"title":"API 🚀","version":"1"},"paths":{}}');return document;},
   validate(){calls.push('validate');return {valid:true,complete:true,diagnostics:[]};},
   getNode(fields:Record<string,unknown>){calls.push('getNode');expect(fields.pointer).toBe('/info/title');return nativeTree;},
   export(fields:Record<string,unknown>){calls.push('export');expect(fields.document).toBe(document);return 'openapi: 3.2.1';},
   exportBundle(){throw new Error('unexpected bundle operation');},
   edit(){throw new Error('unexpected edit operation');},
  });
  const api=createOpenapiRustDefault(engine,()=>false);
  const source='{"openapi":"3.2.1","info":{"title":"API 🚀","version":"1"},"paths":{}}';
  const imported=api.importOpenapiDocument(source,{id:'openapi-rust-default',format:'json'});
  expect(imported).toBe(document);
  expect(api.getOpenapiNode(document as never,'/info/title')).toBe(nativeTree);
  expect(api.exportOpenapiDocument(document as never)).toBe('openapi: 3.2.1');
  expect(calls).toEqual(['import','getNode','export']);
 });

 test('maps malformed native request refusals to the public error while preserving control errors',()=>{
  const malformed=Object.assign(new Error('format must be json or yaml'),{code:'REQUEST',path:'/format'});
  const engine=openapiEngine({import(){throw malformed;}});
  const api=createOpenapiRustDefault(engine,()=>true);
  let error:unknown;
  try{api.importOpenapiDocument('{}',{id:'bad',format:'json' as never});}catch(value){error=value;}
  expect(error).toBeInstanceOf(UmfError);
  expect((error as UmfError).code).toBe('REQUEST');
  expect((error as UmfError).path).toBe('/format');

  const control=Object.assign(new Error('cancelled'),{code:'CANCELLED',path:'/request'});
  const controlled=createOpenapiRustDefault(openapiEngine({...engine.openapi,import(){throw control;}}),()=>true);
  let observed:unknown;
  try{controlled.importOpenapiDocument('{}',{id:'x',format:'json'});}catch(value){observed=value;}
  expect(observed).toBe(control);
 });

 test('registers a Rust-backed payload inspector for the OpenAPI package',()=>{
  const payload={profile:'openapi-json-yaml-0.1',root:{kind:'object',members:{openapi:{kind:'string',value:'3.2.1'},info:{kind:'object',members:{title:{kind:'string',value:'API'},version:{kind:'string',value:'1'}}},paths:{kind:'object',members:{}}}},originalSource:'{"openapi":"3.2.1","info":{"title":"API","version":"1"},"paths":{}}',originalFormat:'json'};
  const diagnostic:Diagnostic={code:'OPENAPI_VALIDATION_LIMIT',path:'/root',message:'Scoped validation',severity:'warning'};
  const engine=openapiEngine({inspectPayload({payload:actual}){expect(actual).toBe(payload);return [diagnostic];}});
  const api=createOpenapiRustDefault(engine,()=>false);
  const registration=api.openapiRegistry().registrations()[0];
  if(!registration)throw new Error('OpenAPI registration was not created');
  expect(registration.manifest.id).toBe('umf.openapi');
  expect(registration.semantics?.(payload as never,{document:{} as never,path:'/modules/0/elements/0',scope:[] as never})).toEqual([diagnostic]);
 });
});
