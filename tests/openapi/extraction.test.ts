import {test,expect} from 'bun:test';
import {extractOpenapiSchema,importOpenapiDocument,getOpenapiNode,openapiSchemaExtractionSchema,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
const owner=(schemas:string,extra='')=>`{"openapi":"3.1.2","info":{"title":"Extraction","version":"1"},"components":{"schemas":${schemas}}${extra}}`;
const load=(text:string)=>importOpenapiDocument(text,{id:'extraction',format:'json',baseUri:'https://example.test/api.json',resources:[{uri:'https://example.test/shared.json',text:'{"type":"string"}',format:'json'}]});
test('US-011-AC15: extraction retains exact numbers, references and complete source context',()=>{
 const doc=load(owner('{"A":{"minimum":9007199254740993,"$ref":"shared.json","examples":[{"schema":{"type":"string"}}]}}'));
 const result=extractOpenapiSchema(doc,{pointer:'/components/schemas/A'});
 const validator=createValidator();validator.addSchema(coreSchema);
 expect(validator.compile(openapiSchemaExtractionSchema)(result)).toBe(true);
 expect(result.nativeSchema).toContain('9007199254740993');expect(result.nativeSchema).toContain('shared.json');
 expect(result.dialectOrigin).toBe('openapi-default');expect(result.retrievalUri).toBe('https://example.test/api.json');
 expect(result.source).toEqual(doc);expect(result.complete).toBe(false);
 (result.schema as any).members.minimum.value='1';
 expect(getOpenapiNode(doc,'/components/schemas/A/minimum')).toEqual({kind:'number',value:'9007199254740993'});
 expect(()=>extractOpenapiSchema(doc,{pointer:'/components/schemas/A/examples/0/schema'})).toThrow('declared top-level');
});
test('US-011-AC16: dialect provenance and contextual extraction boundaries',()=>{
 const doc=load(owner('{"A":false,"B":{"$schema":"urn:custom:dialect","custom":true}}',',"jsonSchemaDialect":"https://json-schema.org/draft/2020-12/schema"'));
 const a=extractOpenapiSchema(doc,{pointer:'/components/schemas/A'});const b=extractOpenapiSchema(doc,{pointer:'/components/schemas/B'});
 expect(a.nativeSchema).toBe('false');expect(a.dialectOrigin).toBe('document');expect(a.dialect).toBe('https://json-schema.org/draft/2020-12/schema');
 expect(b.dialectOrigin).toBe('schema');expect(b.dialect).toBe('urn:custom:dialect');expect(b.nativeSchema).toContain('custom');
 expect(()=>extractOpenapiSchema(doc,{pointer:'',resourceUri:'https://example.test/shared.json'})).toThrow('owning OpenAPI');
 expect(()=>extractOpenapiSchema(doc,{pointer:'/components/schemas/A',unexpected:true} as any)).toThrow('schema pointer');
 const newer=load(owner('{"A":true}').replace('3.1.2','3.2.1'));
 expect(extractOpenapiSchema(newer,{pointer:'/components/schemas/A'}).dialect).toBe('https://spec.openapis.org/oas/3.2/dialect/2026-02-26');
});
