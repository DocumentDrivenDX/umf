import {describe,expect,test} from 'bun:test';
import {createJsonLdRustDefault,type JsonLdNativeFamilyEngine} from '../../src/adapters/jsonld/rust-default';

const document={umf:'0.10.0',id:'jsonld-public-root',modules:[]} as const;

describe('JSON-LD Rust default facade',()=>{
 test('uses native registry inspection and keeps source sync / transformations promise based',async()=>{
  const calls:string[]=[];
  const engine={jsonld:{
   import(fields:Record<string,unknown>){calls.push('import');expect(fields).toMatchObject({source:'{}',id:'jsonld-public-root',baseIRI:'https://example.test/'});return document;},
   inspectPayload({payload}:Record<string,unknown>){calls.push('inspectPayload');expect(payload).toEqual({profile:'jsonld-source'});return [{code:'JSONLD_CONTEXT',path:'',message:'source only',severity:'warning'}];},
   validate(){calls.push('validate');return {valid:true,complete:false,diagnostics:[]};},
   export(){calls.push('export');return '{}';},
   getNode(){return {kind:'object',members:{}};},
   editNode(){return {document,validation:{valid:true,complete:false,diagnostics:[]}};},
   expand(){calls.push('expand');return {source:document,status:'candidate',complete:false};},
  }} as unknown as JsonLdNativeFamilyEngine;
  const api=createJsonLdRustDefault(engine);
  const imported=api.importJsonLdDocument('{}',{id:'jsonld-public-root',baseIRI:'https://example.test/'});
  expect(imported).toBe(document);
  expect(api.inspectJsonLdDocument(document as never)).toMatchObject({valid:true,complete:false});
  expect(api.exportJsonLdDocument(document as never)).toBe('{}');
  const registration=api.jsonldRegistry().registrations()[0];
  expect(registration.manifest.id).toBe('umf.jsonld');
  expect(registration.semantics?.({profile:'jsonld-source'} as never,{document:document as never,path:'/payload',scope:[] as never})).toEqual([
   {code:'JSONLD_CONTEXT',path:'',message:'source only',severity:'warning'},
  ]);
  const proposal=api.proposeJsonLdExpansion(document as never,{lossPolicy:'reject'});
  expect(proposal).toBeInstanceOf(Promise);
  await expect(proposal).resolves.toMatchObject({status:'candidate',complete:false});
  expect(calls).toEqual(['import','validate','export','inspectPayload','expand']);
 });
});
