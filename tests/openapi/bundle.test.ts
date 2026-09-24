import {test,expect} from 'bun:test';
import {importOpenapiDocument,exportOpenapiDocument,exportOpenapiBundle,lookupOpenapiResource,proposeOpenapiEdit,inspectOpenapi,getOpenapiNode,readDocument,writeDocument} from '../../src';
const baseUri='https://example.test/petstore/spec/swagger.json';
async function fixture(format:'json'|'yaml'){
 const prefix='fixtures/openapi/upstream/examples/v2.0/'+format+'/petstore-separate/';const ext=format;
 const resources=[];
 for(const path of ['spec/Pet','spec/NewPet','spec/parameters','common/Error'])resources.push({uri:new URL('../'+path+'.'+ext,baseUri).href,text:await Bun.file(prefix+path+'.'+ext).text(),format});
 return {text:await Bun.file(prefix+'spec/swagger.'+ext).text(),resources,baseUri:baseUri.replace('.json','.'+ext)};
}
test('US-011-AC8: external resources retain URI identity, source formats and edits in complete bundles',async()=>{
 for(const format of ['json','yaml'] as const){
  const data=await fixture(format);const doc=importOpenapiDocument(data.text,{id:'petstore',format,baseUri:data.baseUri,resources:data.resources});
  expect(inspectOpenapi(doc).valid).toBe(true);expect(inspectOpenapi(doc).diagnostics.some(d=>d.code==='OPENAPI_RESOURCE_CONTEXT')).toBe(true);
  expect(()=>exportOpenapiDocument(doc)).toThrow('bundle');
  for(const serialization of ['json','yaml'] as const){
   const bundle=exportOpenapiBundle(readDocument(writeDocument(doc,serialization),serialization));
   expect(bundle.schema).toBe(data.text);expect(bundle.resources).toEqual(data.resources);
   expect(importOpenapiDocument(bundle.schema,{id:'petstore',format:bundle.format,baseUri:bundle.baseUri!,resources:bundle.resources})).toEqual(doc);
  }
  const ref=lookupOpenapiResource(doc,'Pet.'+format+'#/properties/id');
  expect(ref.uri).toBe('https://example.test/petstore/spec/Pet.'+format);expect(ref.interpretation).toBe('literal-document-pointer-only');
  expect(lookupOpenapiResource(doc,'../common/Error.'+format,ref.uri).node.kind).toBe('object');
  expect(lookupOpenapiResource(doc,'parameters.'+format+'#/tagsParam/name').node).toEqual({kind:'string',value:'tags'});
  const edited=proposeOpenapiEdit(doc,'/properties/id/type','"string"',ref.uri);
  expect(getOpenapiNode(doc,'/properties/id/type',ref.uri)).toEqual({kind:'string',value:'integer'});
  expect(getOpenapiNode(edited.document,'/properties/id/type',ref.uri)).toEqual({kind:'string',value:'string'});
  expect(exportOpenapiBundle(edited.document).diagnostics.some(d=>d.code==='OPENAPI_SOURCE_LAYOUT')).toBe(true);
  await Bun.write('fixtures/openapi/resource-bundle-'+format+'.json',JSON.stringify({original:exportOpenapiBundle(doc),edited:exportOpenapiBundle(edited.document)},null,2)+'\n');
 }
});
test('US-011-AC9: URI collisions, missing resources and unsupported anchor scopes fail explicitly',async()=>{
 const data=await fixture('json');const doc=importOpenapiDocument(data.text,{id:'petstore',format:'json',baseUri,resources:data.resources});
 expect(()=>lookupOpenapiResource(doc,'https://not-supplied.test/schema')).toThrow('not supplied');
 expect(()=>lookupOpenapiResource(doc,'Pet.json#named-anchor')).toThrow('schema-aware');
 expect(()=>lookupOpenapiResource(doc,'Pet.json#/missing')).toThrow();
 expect(()=>lookupOpenapiResource(doc,'Pet.json#/%XX')).toThrow();
 expect(lookupOpenapiResource(doc,'parameters.json#%2FtagsParam%2Fname').node).toEqual({kind:'string',value:'tags'});
 expect(()=>importOpenapiDocument(data.text,{id:'duplicates',format:'json',baseUri,resources:[...data.resources,data.resources[0]!]})).toThrow();
 expect(()=>importOpenapiDocument(data.text,{id:'alias',format:'json',baseUri,resources:[...data.resources,{...data.resources[0]!,uri:'https://example.test:443/petstore/spec/./Pet.json'}]})).toThrow();
 expect(()=>importOpenapiDocument(data.text,{id:'collision',format:'json',baseUri,resources:[{...data.resources[0]!,uri:baseUri}]})).toThrow();
 expect(()=>importOpenapiDocument(data.text,{id:'no-base',format:'json',resources:data.resources})).toThrow();
 const unknown=structuredClone(doc);(unknown.modules[0]!.elements[0]!.extensions['umf.openapi'] as any).resources[0].future='keep';
 expect(()=>exportOpenapiBundle(unknown)).toThrow('discard');
 const missing=importOpenapiDocument(data.text,{id:'unbundled',format:'json'});expect(()=>lookupOpenapiResource(missing,'Pet.json')).toThrow('base URI');
});
